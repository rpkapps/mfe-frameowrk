// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ShellState } from '@company/mfe-core';

import { createAppRuntime } from './app-runtime';
import type { AppAdapter, AppAdapterOptions, AppRegistration } from './app-runtime';
import type { MountAttempt } from './mount-lifecycle';

const shellState: ShellState = { user: null, groups: ['readers'], theme: 'light' };

function setup(
  load = vi.fn<AppRegistration['load']>(() => Promise.resolve({ kind: 'app', id: 'plain' })),
) {
  const created: AppAdapterOptions[] = [];
  const disposal = vi.fn();
  const adapter: AppAdapter = {
    id: 'dom',
    create(options) {
      created.push(options);
      return {
        mount(attempt) {
          const content = document.createElement('p');
          const render = () => {
            content.textContent = options.shellState.getTheme();
          };
          render();
          attempt.onDetach(options.shellState.subscribeTheme(render));
          attempt.onDetach(() => content.remove());
          attempt.commit(() => options.placement.append(content));
        },
        dispose: disposal,
      };
    },
  };
  const reportError = vi.fn();
  const runtime = createAppRuntime({
    registry: [{ id: 'plain', kind: 'app', contractMajor: 1, adapter: 'dom', load }],
    adapters: [adapter],
    reportError,
  });
  const mount = () =>
    runtime.mountApp({
      id: 'plain',
      basePath: '/plain',
      target: document.createElement('main'),
      shellState,
    });
  return { runtime, mount, load, created, disposal, reportError, adapter };
}

describe('framework-neutral app runtime', () => {
  it('shares one pending load while a disposed waiter leaves another owner active', async () => {
    let resolveLoad!: (definition: { kind: 'app'; id: string }) => void;
    const load = vi.fn<AppRegistration['load']>(
      ({ signal }) =>
        new Promise((resolve, reject) => {
          resolveLoad = resolve;
          signal.addEventListener('abort', () => reject(new Error('transport aborted')), {
            once: true,
          });
        }),
    );
    const created: AppAdapterOptions[] = [];
    const runtime = createAppRuntime({
      registry: [{ id: 'plain', kind: 'app', contractMajor: 1, adapter: 'dom', load }],
      adapters: [
        {
          id: 'dom',
          create(options) {
            created.push(options);
            return { mount: () => {} };
          },
        },
      ],
      reportError: vi.fn(),
    });
    const first = runtime.mountApp({
      id: 'plain',
      basePath: '/plain',
      target: document.createElement('main'),
      shellState,
    });
    const second = runtime.mountApp({
      id: 'plain',
      basePath: '/plain',
      target: document.createElement('main'),
      shellState,
    });
    void first.start().catch(() => {});
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    const secondStart = second.start();
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    await first.handle.dispose();
    expect(load.mock.calls[0]?.[0].signal.aborted).toBe(false);
    resolveLoad({ kind: 'app', id: 'plain' });
    await secondStart;

    expect(created).toHaveLength(1);
    expect(first.handle.state.status).toBe('disposed');
    expect(second.handle.state.status).toBe('mounted');
    await second.handle.dispose();
  });

  it('keeps a shared load alive for a staggered waiter after the first times out', async () => {
    let resolveLoad!: (definition: { kind: 'app'; id: string }) => void;
    const load = vi.fn<AppRegistration['load']>(
      ({ signal }) =>
        new Promise((resolve, reject) => {
          resolveLoad = resolve;
          signal.addEventListener('abort', () => reject(new Error('transport aborted')), {
            once: true,
          });
        }),
    );
    const created: AppAdapterOptions[] = [];
    const runtime = createAppRuntime({
      registry: [{ id: 'plain', kind: 'app', contractMajor: 1, adapter: 'dom', load }],
      adapters: [
        {
          id: 'dom',
          create(options) {
            created.push(options);
            return { mount: () => {} };
          },
        },
      ],
      reportError: vi.fn(),
      deadlines: { loadMs: 50 },
    });
    const first = runtime.mountApp({
      id: 'plain',
      basePath: '/first',
      target: document.createElement('main'),
      shellState,
    });
    const second = runtime.mountApp({
      id: 'plain',
      basePath: '/second',
      target: document.createElement('main'),
      shellState,
    });
    vi.useFakeTimers();
    try {
      const firstStart = first.start();
      for (let tick = 0; tick < 6; tick++) await Promise.resolve();
      expect(load).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(25);
      const secondStart = second.start();
      for (let tick = 0; tick < 6; tick++) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(26);
      await expect(firstStart).rejects.toMatchObject({ code: 'load/timeout' });
      expect(load.mock.calls[0]?.[0].signal.aborted).toBe(false);
      resolveLoad({ kind: 'app', id: 'plain' });
      await secondStart;
      expect(load).toHaveBeenCalledOnce();
      expect(created).toHaveLength(1);
      expect(first.handle.state.status).toBe('error');
      expect(second.handle.state.status).toBe('mounted');
    } finally {
      vi.useRealTimers();
      await second.handle.dispose();
      await first.handle.dispose();
    }
  });

  it('reports a loader deadline through the runtime as load/timeout', async () => {
    const load = vi.fn<AppRegistration['load']>(() => new Promise(() => {}));
    const runtime = createAppRuntime({
      registry: [{ id: 'plain', kind: 'app', contractMajor: 1, adapter: 'dom', load }],
      adapters: [{ id: 'dom', create: () => ({ mount: () => {} }) }],
      reportError: vi.fn(),
      deadlines: { loadMs: 20 },
    });
    const mount = runtime.mountApp({
      id: 'plain',
      basePath: '/plain',
      target: document.createElement('main'),
      shellState,
    });
    await expect(mount.start()).rejects.toMatchObject({ code: 'load/timeout' });
    expect(mount.handle.state.status).toBe('error');
    await mount.handle.dispose();
  });

  it('selects a non-React adapter and isolates state and disposal between simultaneous mounts', async () => {
    const fixture = setup();
    const first = fixture.mount();
    const second = fixture.mount();
    await Promise.all([first.start(), second.start()]);
    expect(first.handle.state.status).toBe('mounted');
    expect(first.placement.dataset.mfeScope).toBe('plain');
    expect(fixture.created).toHaveLength(2);
    await first.updateShellState({ ...shellState, theme: 'dark' });
    expect(first.placement.textContent).toBe('dark');
    expect(second.placement.textContent).toBe('light');
    await first.handle.dispose();
    await first.handle.dispose();
    await first.updateShellState(shellState);
    expect(fixture.disposal).toHaveBeenCalledTimes(1);
    expect(fixture.created[0]?.shellState.getTheme()).toBe('dark');
    expect(second.handle.state.status).toBe('mounted');
    await second.handle.dispose();
    expect(fixture.disposal).toHaveBeenCalledTimes(2);
  });

  it('retries a rejected loader through the shared lifecycle and transport retry flag', async () => {
    const load = vi.fn<AppRegistration['load']>(() =>
      Promise.resolve({ kind: 'app', id: 'plain' }),
    );
    load.mockRejectedValueOnce(new Error('offline'));
    const fixture = setup(load);
    const mount = fixture.mount();
    await expect(mount.start()).rejects.toMatchObject({ code: 'load/entry-failure' });
    expect(mount.handle.state.status).toBe('error');
    await mount.handle.retry();
    expect(load.mock.calls).toHaveLength(2);
    expect(load.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    expect(load.mock.calls[0]?.[0].retry).toBe(false);
    expect(load.mock.calls[1]?.[0].signal).toBeInstanceOf(AbortSignal);
    expect(load.mock.calls[1]?.[0].retry).toBe(true);
    expect(mount.handle.state.status).toBe('mounted');
    await mount.handle.dispose();
  });

  it('reuses driver resources and the state store when an adapter attempt fails', async () => {
    const load = vi.fn<AppRegistration['load']>(() =>
      Promise.resolve({ kind: 'app', id: 'plain' }),
    );
    const create = vi.fn((options: AppAdapterOptions) => ({
      mount: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('first render failed');
        })
        .mockImplementationOnce(() => {
          options.placement.textContent = options.shellState.getTheme();
        }),
    }));
    const runtime = createAppRuntime({
      registry: [{ id: 'plain', kind: 'app', contractMajor: 1, adapter: 'dom', load }],
      adapters: [{ id: 'dom', create }],
      reportError: vi.fn(),
    });
    const mount = runtime.mountApp({
      id: 'plain',
      basePath: '/plain',
      target: document.createElement('main'),
      shellState,
    });
    await expect(mount.start()).rejects.toMatchObject({ code: 'mount/failure' });
    await mount.updateShellState({ ...shellState, theme: 'dark' });
    await mount.handle.retry();
    expect(create).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(mount.placement.textContent).toBe('dark');
    await mount.handle.dispose();
  });

  it('forces a fresh load after descriptor or adapter validation rejects a module', async () => {
    const load = vi
      .fn<AppRegistration['load']>()
      .mockResolvedValueOnce({ kind: 'app', id: 'wrong' })
      .mockResolvedValueOnce({ kind: 'app', id: 'plain', broken: true })
      .mockResolvedValue({ kind: 'app', id: 'plain' });
    const create = vi
      .fn<AppAdapter['create']>()
      .mockImplementationOnce(() => {
        throw new Error('adapter contract mismatch');
      })
      .mockReturnValue({ mount: () => {} });
    const runtime = createAppRuntime({
      registry: [{ id: 'plain', kind: 'app', contractMajor: 1, adapter: 'dom', load }],
      adapters: [{ id: 'dom', create }],
      reportError: vi.fn(),
    });
    const mount = runtime.mountApp({
      id: 'plain',
      basePath: '/plain',
      target: document.createElement('main'),
      shellState,
    });
    await expect(mount.start()).rejects.toMatchObject({ code: 'registry/invalid-descriptor' });
    await expect(mount.handle.retry()).rejects.toMatchObject({ code: 'mount/failure' });
    await mount.handle.retry();
    expect(load.mock.calls.map(([options]) => options.retry)).toEqual([false, true, true]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(mount.handle.state.status).toBe('mounted');
    await mount.handle.dispose();
  });

  it('does not fail a newer attempt when an earlier state update rejects after retry', async () => {
    let activeAttempt: MountAttempt | undefined;
    let rejectUpdate!: (cause: unknown) => void;
    const update = new Promise<void>((_resolve, reject) => {
      rejectUpdate = reject;
    });
    const reportError = vi.fn();
    const runtime = createAppRuntime({
      registry: [
        {
          id: 'plain',
          kind: 'app',
          contractMajor: 1,
          adapter: 'dom',
          load: () => Promise.resolve({ kind: 'app', id: 'plain' }),
        },
      ],
      adapters: [
        {
          id: 'dom',
          create: () => ({
            mount(attempt) {
              activeAttempt = attempt;
            },
            updateShellState: () => update,
          }),
        },
      ],
      reportError,
    });
    const mount = runtime.mountApp({
      id: 'plain',
      basePath: '/plain',
      target: document.createElement('main'),
      shellState,
    });
    await mount.start();
    const updating = mount.updateShellState({ ...shellState, theme: 'dark' });
    const rejection = expect(updating).rejects.toThrow('stale update');
    activeAttempt?.fail(new Error('retire first attempt'));
    await mount.handle.retry();
    rejectUpdate(new Error('stale update'));
    await rejection;
    expect(mount.handle.state.status).toBe('mounted');
    expect(activeAttempt?.number).toBe(2);
    expect(reportError).toHaveBeenCalledOnce();
    await mount.handle.dispose();
  });

  it('fences a loader that resolves after disposal before constructing an adapter', async () => {
    let resolve!: (definition: { kind: string; id: string }) => void;
    const fixture = setup(
      vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    );
    const mount = fixture.mount();
    const starting = mount.start();
    const observed = starting.catch(() => {});
    await vi.waitFor(() => expect(fixture.load).toHaveBeenCalledOnce());
    await mount.handle.dispose();
    resolve({ kind: 'app', id: 'plain' });
    await observed;
    await Promise.resolve();
    expect(fixture.created).toHaveLength(0);
    expect(mount.placement.parentElement).toBeNull();
    expect(mount.handle.state.status).toBe('disposed');
  });

  it('quarantines a throwing registration accessor while retaining a healthy neighbor', async () => {
    const broken = {
      id: 'broken',
      kind: 'app' as const,
      contractMajor: 1,
      get adapter(): never {
        throw new Error('adapter getter failed');
      },
      load: vi.fn<AppRegistration['load']>(),
    };
    const healthyLoad = vi.fn<AppRegistration['load']>(() =>
      Promise.resolve({ kind: 'app', id: 'healthy' }),
    );
    const reportError = vi.fn();
    const runtime = createAppRuntime({
      registry: [
        broken,
        {
          id: 'healthy',
          kind: 'app',
          contractMajor: 1,
          adapter: 'dom',
          load: healthyLoad,
        },
      ] as unknown as AppRegistration[],
      adapters: [{ id: 'dom', create: () => ({ mount: () => {} }) }],
      reportError,
    });
    const mount = runtime.mountApp({
      id: 'healthy',
      basePath: '/healthy',
      target: document.createElement('main'),
      shellState,
    });
    await mount.start();
    expect(healthyLoad).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledOnce();
    await mount.handle.dispose();
  });

  it('quarantines malformed registry entries while retaining healthy neighbors', async () => {
    const healthyLoad = vi.fn<AppRegistration['load']>(() =>
      Promise.resolve({ kind: 'app', id: 'healthy' }),
    );
    const reportError = vi.fn();
    const runtime = createAppRuntime({
      registry: [
        null,
        { id: 'broken', kind: undefined, contractMajor: 1 },
        {
          id: 'healthy',
          kind: 'app',
          contractMajor: 1,
          adapter: 'dom',
          load: healthyLoad,
        },
      ] as unknown as AppRegistration[],
      adapters: [fixtureAdapter()],
      reportError,
    });
    const mount = runtime.mountApp({
      id: 'healthy',
      basePath: '/healthy',
      target: document.createElement('main'),
      shellState,
    });
    await mount.start();
    expect(healthyLoad).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledTimes(2);
    await mount.handle.dispose();

    function fixtureAdapter(): AppAdapter {
      return {
        id: 'dom',
        create: () => ({ mount: () => {} }),
      };
    }
  });

  it('rejects ambiguous registrations and mismatched loaded descriptors before adapter creation', async () => {
    const fixture = setup();
    const registration = {
      id: 'plain',
      kind: 'app' as const,
      contractMajor: 1,
      adapter: 'dom',
      load: fixture.load,
    };
    const duplicateErrors = vi.fn();
    const duplicateRuntime = createAppRuntime({
      registry: [registration, registration],
      adapters: [fixture.adapter],
      reportError: duplicateErrors,
    });
    expect(duplicateErrors).toHaveBeenCalledTimes(2);
    expect(() =>
      duplicateRuntime.mountApp({
        id: 'plain',
        basePath: '/plain',
        target: document.createElement('main'),
        shellState,
      }),
    ).toThrow(expect.objectContaining({ code: 'registry/invalid-descriptor' }));
    const invalid = setup(
      vi.fn<AppRegistration['load']>(() => Promise.resolve({ kind: 'app', id: 'other' })),
    );
    const mount = invalid.mount();
    await expect(mount.start()).rejects.toMatchObject({ code: 'registry/invalid-descriptor' });
    expect(invalid.created).toHaveLength(0);
    await mount.handle.dispose();
  });
});
