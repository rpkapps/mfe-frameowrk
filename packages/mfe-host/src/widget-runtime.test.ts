// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWidgetRuntime } from './widget-runtime';
import type { WidgetAdapterOptions } from './widget-runtime';

afterEach(() => vi.restoreAllMocks());

const target = () => document.createElement('main');
const registration = (
  load: WidgetAdapterOptions['definition'] extends never
    ? never
    : (options: { signal: AbortSignal; retry: boolean }) => Promise<unknown>,
) => ({ id: 'clock', kind: 'widget' as const, contractMajor: 1, load });

describe('neutral widget runtime', () => {
  it('preloads a validated definition without creating placement or activating an adapter', async () => {
    const load = vi.fn(() => Promise.resolve({ kind: 'widget' as const, id: 'clock' }));
    const create = vi.fn(() => ({ mount: vi.fn() }));
    const runtime = createWidgetRuntime({
      registry: [{ id: 'clock', kind: 'widget', contractMajor: 1, load }],
      adapter: { create },
      reportError: vi.fn(),
    });
    const controller = new AbortController();
    await expect(
      runtime.preloadWidget({ id: 'clock', signal: controller.signal }),
    ).resolves.toMatchObject({
      kind: 'widget',
      id: 'clock',
    });
    expect(create).not.toHaveBeenCalled();
    expect(document.body.textContent).toBe('');
  });

  it('aborts transport only after the final shared waiter leaves', async () => {
    let transportAbort = 0;
    let resolveLoad!: (value: unknown) => void;
    const load = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          resolveLoad = resolve;
          signal.addEventListener(
            'abort',
            () => {
              transportAbort++;
              reject(new Error('transport aborted', { cause: signal.reason }));
            },
            { once: true },
          );
        }),
    );
    const runtime = createWidgetRuntime({
      registry: [{ id: 'clock', kind: 'widget', contractMajor: 1, load }],
      adapter: { create: () => ({ mount: () => {} }) },
      reportError: vi.fn(),
    });
    const first = runtime.mountWidget({ id: 'clock', target: target(), inputs: {} });
    const second = runtime.mountWidget({ id: 'clock', target: target(), inputs: {} });
    const firstStart = first.start();
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    const secondStart = second.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await first.handle.dispose();
    expect(transportAbort).toBe(0);
    resolveLoad({ kind: 'widget', id: 'clock' });
    await secondStart;
    expect(transportAbort).toBe(0);
    await firstStart;
    await second.handle.dispose();
  });

  it('quarantines null and throwing registry entries without escaping getters', () => {
    const throwing = Object.defineProperty({}, 'id', {
      get: () => {
        throw new Error('hostile');
      },
    });
    const report = vi.fn();
    const runtime = createWidgetRuntime({
      registry: [
        null,
        throwing,
        registration(() => Promise.resolve({ kind: 'widget', id: 'clock' })),
      ] as never,
      adapter: { create: () => ({ mount: () => {} }) },
      reportError: report,
    });
    expect(() => runtime.mountWidget({ id: 'missing', target: target(), inputs: {} })).toThrow();
    expect(report).toHaveBeenCalled();
  });

  it('quarantines malformed and duplicate registrations', () => {
    const report = vi.fn();
    const runtime = createWidgetRuntime({
      registry: [
        registration(() => Promise.resolve({ kind: 'widget', id: 'clock' })),
        registration(() => Promise.resolve({ kind: 'widget', id: 'clock' })),
      ],
      adapter: { create: () => ({ mount: () => {} }) },
      reportError: report,
    });
    expect(() => runtime.mountWidget({ id: 'clock', target: target(), inputs: {} })).toThrow();
    expect(report).toHaveBeenCalled();
  });

  it('forwards latest inputs and retries a failed load', async () => {
    const attempts: boolean[] = [];
    let fail = true;
    const update = vi.fn();
    const runtime = createWidgetRuntime({
      registry: [
        registration(({ retry }) => {
          attempts.push(retry);
          if (fail) {
            fail = false;
            return Promise.reject(new Error('offline'));
          }
          return Promise.resolve({ kind: 'widget', id: 'clock' });
        }),
      ],
      adapter: { create: () => ({ mount: () => {}, update }) },
      reportError: vi.fn(),
    });
    const mount = runtime.mountWidget({ id: 'clock', target: target(), inputs: { value: 1 } });
    await expect(mount.start()).rejects.toThrow();
    mount.update({ value: 2 });
    await mount.handle.retry();
    expect(attempts).toEqual([false, true]);
    expect(update).toHaveBeenLastCalledWith({ value: 2 }, {});
    await mount.handle.dispose();
    mount.update({ value: 3 }, { onChange: vi.fn() });
    expect(update).toHaveBeenLastCalledWith({ value: 2 }, {});
  });

  it('disposes a failed-attempt driver before replacing it on retry', async () => {
    const disposeFirst = vi.fn();
    const disposeSecond = vi.fn();
    let created = 0;
    const runtime = createWidgetRuntime({
      registry: [registration(() => Promise.resolve({ kind: 'widget', id: 'clock' }))],
      adapter: {
        create: () => {
          created++;
          return {
            mount:
              created === 1
                ? () => {
                    throw new Error('first render failed');
                  }
                : () => {},
            dispose: created === 1 ? disposeFirst : disposeSecond,
          };
        },
      },
      reportError: vi.fn(),
    });
    const mount = runtime.mountWidget({ id: 'clock', target: target(), inputs: {} });
    await expect(mount.start()).rejects.toMatchObject({ code: 'mount/failure' });
    await mount.handle.retry();
    expect(created).toBe(2);
    expect(disposeFirst).toHaveBeenCalledOnce();
    await mount.handle.dispose();
    expect(disposeSecond).toHaveBeenCalledOnce();
  });
});
