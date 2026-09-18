/* eslint-disable no-restricted-imports -- this file is the executable vendor API smoke probe. */
import { context, trace, ROOT_CONTEXT, type Context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { StackContextManager } from '@opentelemetry/sdk-trace-web';
import {
  AlwaysOnSampler,
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { expect, it } from 'vitest';

function setup() {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const manager = new StackContextManager();
  expect(context.setGlobalContextManager(manager)).toBe(true);

  return {
    tracer: provider.getTracer('mfe-gate-one'),
    async finish() {
      await provider.forceFlush();
      const spans = exporter.getFinishedSpans();
      await provider.shutdown();
      context.disable();
      return spans;
    },
  };
}

function requestHeaders(carrier: Context) {
  const headers: Record<string, string> = {};
  new W3CTraceContextPropagator().inject(carrier, headers, {
    set(target, key, value) {
      (target as Record<string, string>)[key] = String(value);
    },
  });
  return headers;
}

/** StackContextManager is the official browser manager; its stack intentionally does not cross native await. */
it('proves synchronous active-span parenting and the native-await ambient gap', async () => {
  const harness = setup();
  const { tracer } = harness;
  const operation = tracer.startSpan('operation');
  const operationContext = trace.setSpan(ROOT_CONTEXT, operation);

  await context.with(operationContext, async () => {
    tracer.startActiveSpan('sync-child', (span) => span.end());
    await Promise.resolve();
    const awaitChild = tracer.startSpan('await-child');
    expect(awaitChild.spanContext().traceId).not.toBe(operation.spanContext().traceId);
    awaitChild.end();
  });
  operation.end();

  const spans = await harness.finish();
  const root = spans.find((span) => span.name === 'operation');
  const synchronous = spans.find((span) => span.name === 'sync-child');
  const asynchronous = spans.find((span) => span.name === 'await-child');
  expect(root).toBeDefined();
  expect(synchronous?.parentSpanContext?.spanId).toBe(root?.spanContext().spanId);
  expect(asynchronous?.parentSpanContext).toBeUndefined();
  expect(asynchronous?.spanContext().traceId).not.toBe(root?.spanContext().traceId);
});

it('keeps two concurrent request carriers parented and injects exact W3C IDs', async () => {
  const harness = setup();
  const { tracer } = harness;
  const operations = await Promise.all(
    ['first', 'second'].map(async (name) => {
      const root = tracer.startSpan(`${name}-operation`);
      const carrier = trace.setSpan(ROOT_CONTEXT, root);
      await Promise.resolve();
      const request = tracer.startSpan(`${name}-request`, undefined, carrier);
      const headers = requestHeaders(trace.setSpan(carrier, request));
      request.end();
      root.end();
      return { name, root, request, headers };
    }),
  );

  const spans = await harness.finish();
  for (const { name, root, request, headers } of operations) {
    const recordedRoot = spans.find((span) => span.name === `${name}-operation`);
    const recordedRequest = spans.find((span) => span.name === `${name}-request`);
    expect(recordedRoot?.spanContext().spanId).toBe(root.spanContext().spanId);
    expect(recordedRequest?.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    const traceparent = headers.traceparent;
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    const [, traceId, requestSpanId] = traceparent!.split('-');
    expect(traceId).toBe(request.spanContext().traceId);
    expect(requestSpanId).toBe(request.spanContext().spanId);
  }
  expect(operations[0]!.root.spanContext().traceId).not.toBe(
    operations[1]!.root.spanContext().traceId,
  );
});
