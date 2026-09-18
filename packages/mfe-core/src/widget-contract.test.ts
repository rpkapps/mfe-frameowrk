import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { createWidgetInputRuntime, validateWidgetInputs } from '@company/mfe-core';

describe('Widget input contracts', () => {
  const schema = z.object({ id: z.string(), count: z.number() });

  it('validates once per changed shallow input set and caches an immutable snapshot', () => {
    const parse = vi.spyOn(schema, 'safeParse');
    const runtime = createWidgetInputRuntime({ id: 'panel', version: '2.0.0', schema });
    const inputs = { id: 'a', count: 1 };
    const first = runtime.validateInitial(inputs);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.isFrozen(first.snapshot)).toBe(true);
    expect(runtime.update(inputs)).toMatchObject({ changed: false, accepted: true });
    expect(runtime.update({ ...inputs })).toMatchObject({ changed: false, accepted: true });
    expect(parse).toHaveBeenCalledTimes(1);

    const invalid = runtime.update({ id: 'a', count: 'bad' });
    expect(invalid).toMatchObject({ changed: true, accepted: false });
    expect(runtime.getSnapshot()).toBe(first.snapshot);

    const invalidContainer = runtime.update(new Date());
    expect(invalidContainer).toMatchObject({ changed: true, accepted: false });
    expect(runtime.getSnapshot()).toBe(first.snapshot);
  });

  it('treats reused object props as stable but newly allocated objects as changes', () => {
    const objectSchema = z.object({ filter: z.object({ query: z.string() }) });
    const runtime = createWidgetInputRuntime({ id: 'panel', schema: objectSchema });
    const filter = { query: 'open' };
    expect(runtime.validateInitial({ filter }).ok).toBe(true);
    expect(runtime.update({ filter })).toMatchObject({ changed: false, accepted: true });
    expect(runtime.update({ filter: { ...filter } })).toMatchObject({
      changed: true,
      accepted: true,
    });
  });

  it('requires explicit retry after an invalid initial mount', () => {
    const report = vi.fn();
    const runtime = createWidgetInputRuntime({
      id: 'panel',
      version: '2.0.0',
      schema,
      reportError: report,
    });
    expect(runtime.validateInitial({ id: 'a', count: 'bad' }).ok).toBe(false);
    expect(runtime.getSnapshot()).toBeUndefined();
    expect(runtime.update({ id: 'a', count: 2 })).toMatchObject({ accepted: false });
    expect(runtime.getSnapshot()).toBeUndefined();
    const retried = runtime.retry();
    expect(retried.ok).toBe(true);
    expect(runtime.getSnapshot()).toEqual({ id: 'a', count: 2 });
    expect(report).toHaveBeenCalled();
    expect(report.mock.calls[0]?.[0]).toMatchObject({
      id: 'panel',
      definitionVersion: '2.0.0',
      direction: 'input',
    });
  });

  it('reports schema and serialization failures without trusting sink failures', () => {
    const report = vi.fn(() => {
      throw new Error('diagnostic sink failed');
    });
    const result = validateWidgetInputs({
      id: 'panel',
      version: '2.0.0',
      schema,
      operation: 'initial mount',
      value: { id: 'a', count: Infinity },
    });
    expect(result.ok).toBe(false);
    const runtime = createWidgetInputRuntime({ id: 'panel', schema, reportError: report });
    expect(() => runtime.validateInitial({ id: 'a', count: 'bad' })).not.toThrow();
  });

  it('does not invoke accessors while staging a rejected input', () => {
    let reads = 0;
    const value = { id: 'a' } as { id: string; count?: number };
    Object.defineProperty(value, 'count', {
      enumerable: true,
      get() {
        reads += 1;
        return 1;
      },
    });
    const runtime = createWidgetInputRuntime({ id: 'panel', schema });
    expect(runtime.validateInitial(value).ok).toBe(false);
    expect(reads).toBe(0);
  });
});
