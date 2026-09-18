import type { Span, Tracer } from '@company/mfe-react';
// eslint-disable-next-line no-restricted-imports -- fixture-only shell adapter owns the OTel integration.
import { context, trace, type Context, type Span as OTelSpan } from '@opentelemetry/api';
// eslint-disable-next-line no-restricted-imports -- fixture-only shell adapter owns the OTel integration.
import { W3CTraceContextPropagator } from '@opentelemetry/core';
// eslint-disable-next-line no-restricted-imports -- fixture-only shell adapter owns the OTel integration.
import { StackContextManager } from '@opentelemetry/sdk-trace-web';
// eslint-disable-next-line no-restricted-imports -- fixture-only shell adapter owns the OTel integration.
import {
  AlwaysOnSampler,
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

interface TraceRequestBoundary {
  request(parent: Span): Promise<void>;
}

export interface TraceProbe {
  readonly tracer: Tracer;
  readonly request: TraceRequestBoundary['request'];
  readonly records: () => Promise<readonly TraceRecord[]>;
  readonly dispose: () => Promise<void>;
  /** Fixture-only negative control for ambient startActiveSpan semantics. */
  readonly ambientControl: () => Promise<readonly TraceRecord[]>;
}

export interface TraceRecord {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
}

/** Fixture-only shell adapter. OTel stays in the shell; remotes receive opaque operations. */
export function createTraceProbe(): TraceProbe {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const contextManager = new StackContextManager().enable();
  if (!context.setGlobalContextManager(contextManager)) {
    throw new Error('Trace fixture could not install its context manager.');
  }
  const tracer = provider.getTracer('mfe-gate-one-shell');
  const propagator = new W3CTraceContextPropagator();

  const records = async (): Promise<readonly TraceRecord[]> => {
    await provider.forceFlush();
    return exporter.getFinishedSpans().map((span) => ({
      name: span.name,
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      ...(span.parentSpanContext ? { parentSpanId: span.parentSpanContext.spanId } : {}),
    }));
  };

  const spans = new WeakMap<Span, { span: OTelSpan; carrier: Context; name: string }>();
  const makeSpan = (name: string, carrier = context.active()): Span => {
    const span = tracer.startSpan(name, undefined, carrier);
    const frameworkSpan: Span = { end: () => span.end() };
    spans.set(frameworkSpan, { span, carrier: trace.setSpan(carrier, span), name });
    return frameworkSpan;
  };
  const frameworkTracer: Tracer = {
    startSpan: (name) => makeSpan(name),
    startActiveSpan: (name, callback) => {
      const span = makeSpan(name);
      return context.with(spans.get(span)!.carrier, () => callback(span));
    },
  };

  return {
    tracer: frameworkTracer,
    async request(parent: Span) {
      const entry = spans.get(parent);
      if (!entry) throw new Error('Unknown fixture span.');
      const child = makeSpan(`${entry.name}.request`, entry.carrier);
      const headers: Record<string, string> = {};
      propagator.inject(spans.get(child)!.carrier, headers, {
        set(target, key, value) {
          (target as Record<string, string>)[key] = String(value);
        },
      });
      try {
        await fetch('/__trace-probe', { headers });
      } finally {
        child.end();
      }
    },
    async ambientControl() {
      const before = exporter.getFinishedSpans().length;
      await frameworkTracer.startActiveSpan('ambient-control', async (root) => {
        const synchronous = frameworkTracer.startSpan('ambient-sync');
        synchronous.end();
        await Promise.resolve();
        const asynchronous = frameworkTracer.startSpan('ambient-await');
        asynchronous.end();
        root.end();
      });
      await provider.forceFlush();
      return records().then((all) => all.slice(before));
    },
    records,
    async dispose() {
      await provider.shutdown();
      context.disable();
      contextManager.disable();
    },
  };
}
