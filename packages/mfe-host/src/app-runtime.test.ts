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
    registry: [{ id: 'plain', adapter: 'dom', load }],
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
      registry: [{ id: 'plain', adapter: 'dom', load }],
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
      registry: [{ id: 'plain', adapter: 'dom', load }],
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
        { id: 'plain', adapter: 'dom', load: () => Promise.resolve({ kind: 'app', id: 'plain' }) },
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

  it('rejects ambiguous registrations and mismatched loaded descriptors before adapter creation', async () => {
    const fixture = setup();
    const registration = { id: 'plain', adapter: 'dom', load: fixture.load };
    expect(() =>
      createAppRuntime({
        registry: [registration, registration],
        adapters: [fixture.adapter],
        reportError: vi.fn(),
      }),
    ).toThrow(expect.objectContaining({ code: 'registry/duplicate-id' }));
    const invalid = setup(
      vi.fn<AppRegistration['load']>(() => Promise.resolve({ kind: 'app', id: 'other' })),
    );
    const mount = invalid.mount();
    await expect(mount.start()).rejects.toMatchObject({ code: 'registry/invalid-descriptor' });
    expect(invalid.created).toHaveLength(0);
    await mount.handle.dispose();
  });
});
