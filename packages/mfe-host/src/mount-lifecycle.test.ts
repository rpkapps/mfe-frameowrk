import { describe, expect, it, vi } from 'vitest';
import { createMfeError } from '@company/mfe-core';
import type { MountState } from '@company/mfe-core';
import {
  createMountLifecycle,
  MAX_MOUNT_DEADLINE_MS,
  resolveMountDeadlines,
} from './mount-lifecycle';
import type { MountAttempt } from './mount-lifecycle';

const definition = { kind: 'app', id: 'operations', version: '2.1.0' } as const;

function deferred() {
  let resolve = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('mount lifecycle ownership', () => {
  it('rejects non-finite and platform-overflowing deadlines before starting work', () => {
    expect(() => resolveMountDeadlines({ loadMs: Number.POSITIVE_INFINITY })).toThrow(
      /finite number/,
    );
    expect(() => resolveMountDeadlines({ mountMs: MAX_MOUNT_DEADLINE_MS + 1 })).toThrow(
      /finite number/,
    );
    expect(() =>
      createMountLifecycle({
        definition,
        deadlines: { disposeMs: -1 },
        mount: vi.fn(),
        reportError: vi.fn(),
      }),
    ).toThrow(/finite number/);
  });

  it('clears phase and disposal timers on success and failure paths', async () => {
    vi.useFakeTimers();
    try {
      const successful = createMountLifecycle({
        definition,
        deadlines: { loadMs: 10, mountMs: 10, disposeMs: 10 },
        load: vi.fn(),
        mount: vi.fn(),
        reportError: vi.fn(),
      });
      await successful.start();
      expect(vi.getTimerCount()).toBe(0);
      await successful.handle.dispose();
      expect(vi.getTimerCount()).toBe(0);

      const failed = createMountLifecycle({
        definition,
        deadlines: { loadMs: 10, mountMs: 10, disposeMs: 10 },
        mount: () => {
          throw new Error('mount failed');
        },
        reportError: vi.fn(),
      });
      await expect(failed.start()).rejects.toMatchObject({ code: 'mount/failure' });
      expect(vi.getTimerCount()).toBe(0);
      await failed.handle.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds loading with a structured timeout and fences its late result', async () => {
    vi.useFakeTimers();
    try {
      const late = deferred();
      const attached = vi.fn();
      const runtime = createMountLifecycle({
        definition,
        deadlines: { loadMs: 10, mountMs: 10, disposeMs: 10 },
        load: () => late.promise,
        mount: (attempt) => {
          attempt.commit(attached);
        },
        reportError: vi.fn(),
      });
      const started = runtime.start();
      await vi.advanceTimersByTimeAsync(10);
      await expect(started).rejects.toMatchObject({
        code: 'load/timeout',
        id: definition.id,
      });
      expect(runtime.handle.state.status).toBe('error');
      expect(vi.getTimerCount()).toBe(0);
      late.resolve();
      await Promise.resolve();
      expect(attached).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds the actual mount separately and fences a late mount commit', async () => {
    vi.useFakeTimers();
    try {
      const late = deferred();
      const attached = vi.fn();
      const entered = deferred();
      const runtime = createMountLifecycle({
        definition,
        deadlines: { loadMs: 10, mountMs: 10, disposeMs: 10 },
        load: () => undefined,
        mount: async (attempt) => {
          entered.resolve();
          await late.promise;
          attempt.commit(attached);
        },
        reportError: vi.fn(),
      });
      const started = runtime.start();
      await entered.promise;
      await vi.advanceTimersByTimeAsync(10);
      await expect(started).rejects.toMatchObject({ code: 'mount/timeout' });
      expect(vi.getTimerCount()).toBe(0);
      late.resolve();
      await Promise.resolve();
      expect(attached).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects disposal at its deadline while observing eventual cleanup', async () => {
    vi.useFakeTimers();
    try {
      const late = deferred();
      const cleanup = vi.fn(() => late.promise);
      const runtime = createMountLifecycle({
        definition,
        deadlines: { loadMs: 10, mountMs: 10, disposeMs: 10 },
        mount: (attempt) => {
          attempt.onCleanup(cleanup);
        },
        reportError: vi.fn(),
      });
      await runtime.start();
      const disposed = runtime.handle.dispose();
      expect(runtime.handle.state).toEqual({ status: 'disposed' });
      const rejection = expect(disposed).rejects.toMatchObject({ code: 'dispose/timeout' });
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
      expect(vi.getTimerCount()).toBe(0);
      late.resolve();
      await Promise.resolve();
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let stale cleanup hold a retry pending forever', async () => {
    vi.useFakeTimers();
    try {
      const late = deferred();
      const mount = vi.fn((attempt: MountAttempt) => {
        if (attempt.number === 1) {
          attempt.onCleanup(() => late.promise);
          throw new Error('first attempt failed');
        }
      });
      const runtime = createMountLifecycle({
        definition,
        deadlines: { loadMs: 10, mountMs: 10, disposeMs: 10 },
        mount,
        reportError: vi.fn(),
      });
      await expect(runtime.start()).rejects.toMatchObject({ code: 'mount/failure' });
      const retried = runtime.handle.retry();
      await vi.advanceTimersByTimeAsync(10);
      await expect(retried).rejects.toMatchObject({ code: 'mount/timeout' });
      expect(mount).toHaveBeenCalledTimes(1);
      late.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(mount).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts once, caches snapshots and avoids notifications for unchanged mounted state', async () => {
    const mount = vi.fn();
    const runtime = createMountLifecycle({ definition, mount, reportError: vi.fn() });
    const listener = vi.fn();
    const pending = runtime.handle.state;
    runtime.handle.subscribe(listener);

    const ready = runtime.start();
    expect(runtime.start()).toBe(ready);
    expect(runtime.handle.getState()).toBe(pending);
    expect(Object.isFrozen(pending)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    await ready;

    const mounted = runtime.handle.state;
    expect(mounted).toEqual({ status: 'mounted' });
    expect(runtime.handle.getState()).toBe(mounted);
    await runtime.handle.retry();
    expect(runtime.handle.state).toBe(mounted);
    expect(mount).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    await runtime.handle.dispose();
  });

  it('reports a failed initial mount with attribution and retries using current values', async () => {
    let value = 'invalid';
    const cause = new Error('invalid current value');
    const reportError = vi.fn();
    const observed: string[] = [];
    const runtime = createMountLifecycle({
      definition,
      reportError,
      mount() {
        observed.push(value);
        if (value === 'invalid') throw cause;
      },
    });
    const transitions: MountState[] = [];
    runtime.handle.subscribe(() => transitions.push(runtime.handle.state));

    await expect(runtime.start()).rejects.toMatchObject({
      code: 'mount/failure',
      id: 'operations',
      definitionVersion: '2.1.0',
      cause,
    });
    expect(runtime.handle.state.status).toBe('error');
    expect(reportError).toHaveBeenCalledOnce();
    value = 'corrected';
    expect(runtime.handle.state.status).toBe('error');
    await runtime.handle.retry();

    expect(observed).toEqual(['invalid', 'corrected']);
    expect(transitions.map((state) => state.status)).toEqual(['error', 'pending', 'mounted']);
    expect(transitions[1]).toEqual({ status: 'pending', attempt: 2 });
    await runtime.handle.dispose();
  });

  it('preserves actionable adapter errors rather than replacing their field and operation', async () => {
    const error = createMfeError({
      id: definition.id,
      definitionVersion: definition.version,
      code: 'app/invalid-router',
      operation: 'validate factory context',
      resource: 'context.mfe',
      expected: 'the supplied namespace',
      observed: 'a replacement namespace',
      owner: 'the App factory',
      repair: 'Spread the supplied context without replacing mfe.',
    });
    const reportError = vi.fn();
    const runtime = createMountLifecycle({
      definition,
      reportError,
      mount() {
        throw error;
      },
    });

    await expect(runtime.start()).rejects.toBe(error);
    expect(runtime.handle.state).toEqual({ status: 'error', error });
    expect(reportError).toHaveBeenCalledWith(error);
    await runtime.handle.dispose();
  });

  it('adds known version attribution without mutating an adapter error or losing its details', async () => {
    const cause = new Error('original failure');
    const error = createMfeError({
      id: definition.id,
      code: 'app/invalid-router',
      operation: 'validate route context',
      resource: 'context.mfe',
      expected: 'the supplied namespace',
      observed: 'a replacement',
      owner: 'the App route',
      repair: 'Forward the supplied namespace.',
      path: ['mfe'],
      cause,
    });
    Object.freeze(error);
    const runtime = createMountLifecycle({
      definition,
      reportError: vi.fn(),
      mount() {
        throw error;
      },
    });

    await expect(runtime.start()).rejects.toMatchObject({
      code: error.code,
      id: definition.id,
      definitionVersion: definition.version,
      operation: error.operation,
      message: error.message,
      path: ['mfe'],
      cause,
    });
    expect(error.definitionVersion).toBeUndefined();
    await runtime.handle.dispose();
  });

  it('never assigns the parent version to an error attributed to a child definition', async () => {
    const error = createMfeError({
      id: 'child',
      code: 'mount/failure',
      operation: 'mount child',
      resource: 'child App',
      expected: 'a usable mount',
      observed: 'a child failure',
      owner: 'the child App',
      repair: 'Repair the child App.',
    });
    const runtime = createMountLifecycle({
      definition,
      reportError: vi.fn(),
      mount() {
        throw error;
      },
    });

    await expect(runtime.start()).rejects.toBe(error);
    expect(error.definitionVersion).toBeUndefined();
    await runtime.handle.dispose();
  });

  it('fences late work from the first attempt after explicit failure and successful retry', async () => {
    const late = deferred();
    const entered = deferred();
    const attached: number[] = [];
    const attempts: MountAttempt[] = [];
    const reportError = vi.fn();
    const runtime = createMountLifecycle({
      definition,
      reportError,
      async mount(attempt) {
        attempts.push(attempt);
        if (attempt.number === 1) {
          entered.resolve();
          await late.promise;
        }
        attempt.commit(() => attached.push(attempt.number));
      },
    });
    const first = runtime.start();
    await entered.promise;
    const initialAttempt = attempts[0];
    expect(initialAttempt).toBeDefined();
    initialAttempt?.fail(new Error('render boundary failure'));
    await expect(first).rejects.toMatchObject({ code: 'mount/failure' });
    await runtime.handle.retry();
    const mounted = runtime.handle.state;
    late.resolve();
    await late.promise;
    await Promise.resolve();

    expect(initialAttempt?.signal.aborted).toBe(true);
    expect(initialAttempt?.mountSignal.aborted).toBe(false);
    expect(attached).toEqual([2]);
    expect(runtime.handle.state).toBe(mounted);
    expect(reportError).toHaveBeenCalledOnce();
    expect(attempts[1]?.mountSignal).toBe(initialAttempt?.mountSignal);
    await runtime.handle.dispose();
  });

  it('waits for retired resources before invoking the next attempt', async () => {
    const released = deferred();
    const mount = vi.fn((attempt: MountAttempt) => {
      if (attempt.number === 1) {
        attempt.onCleanup(() => released.promise);
        throw new Error('first attempt fails');
      }
    });
    const runtime = createMountLifecycle({ definition, mount, reportError: vi.fn() });
    await expect(runtime.start()).rejects.toMatchObject({ code: 'mount/failure' });

    const retried = runtime.handle.retry();
    expect(runtime.handle.state).toEqual({ status: 'pending', attempt: 2 });
    await Promise.resolve();
    expect(mount).toHaveBeenCalledOnce();
    released.resolve();
    await retried;
    expect(mount).toHaveBeenCalledTimes(2);
    await runtime.handle.dispose();
  });

  it('drains cleanup registered by another retired cleanup before mounting a retry', async () => {
    const parentReleased = deferred();
    const childReleased = deferred();
    const childRegistered = deferred();
    const mount = vi.fn((attempt: MountAttempt) => {
      if (attempt.number !== 1) return;
      attempt.onCleanup(async () => {
        await parentReleased.promise;
        attempt.onCleanup(() => childReleased.promise);
        childRegistered.resolve();
      });
      throw new Error('first mount failed');
    });
    const runtime = createMountLifecycle({ definition, mount, reportError: vi.fn() });
    await expect(runtime.start()).rejects.toMatchObject({ code: 'mount/failure' });
    const retried = runtime.handle.retry();
    parentReleased.resolve();
    await childRegistered.promise;
    // Finish current microtasks; the unresolved child cleanup remains owned.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mount).toHaveBeenCalledOnce();
    expect(runtime.handle.state).toEqual({ status: 'pending', attempt: 2 });

    childReleased.resolve();
    await retried;
    expect(mount).toHaveBeenCalledTimes(2);
    await runtime.handle.dispose();
  });

  it('detaches synchronously and returns one promise while all async cleanup completes', async () => {
    const released = deferred();
    const detached: string[] = [];
    const cleanup = vi.fn(() => released.promise);
    let mountSignal: AbortSignal | undefined;
    const runtime = createMountLifecycle({
      definition,
      reportError: vi.fn(),
      detach: () => detached.push('placement'),
      mount(attempt) {
        mountSignal = attempt.mountSignal;
        attempt.onDetach(() => detached.push('root'));
        attempt.onDetach(() => detached.push('subscription'));
        attempt.onCleanup(cleanup);
      },
    });
    await runtime.start();

    const disposed = runtime.handle.dispose();
    expect(runtime.handle.dispose()).toBe(disposed);
    expect(detached).toEqual(['subscription', 'root', 'placement']);
    expect(mountSignal?.aborted).toBe(true);
    expect(runtime.handle.state).toEqual({ status: 'disposed' });
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();
    released.resolve();
    await disposed;
    expect(runtime.handle.dispose()).toBe(disposed);
  });

  it('never allows a disposed pending attempt to attach or publish a late failure', async () => {
    const pending = deferred();
    const entered = deferred();
    const attached = vi.fn();
    const reportError = vi.fn();
    const runtime = createMountLifecycle({
      definition,
      reportError,
      async mount(attempt) {
        entered.resolve();
        await pending.promise;
        attempt.commit(attached);
        throw new Error('obsolete failure');
      },
    });
    const started = runtime.start();
    await entered.promise;
    await runtime.handle.dispose();
    const disposed = runtime.handle.state;
    pending.resolve();
    await pending.promise;
    await started;
    await Promise.resolve();

    expect(attached).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    expect(runtime.handle.state).toBe(disposed);
  });

  it('attempts every cleanup after synchronous and asynchronous cleanup failures', async () => {
    const firstCause = new Error('failed unsubscribe');
    const secondCause = new Error('failed async root cleanup');
    const completed = vi.fn();
    const reportError = vi.fn();
    const runtime = createMountLifecycle({
      definition,
      reportError,
      cleanup: completed,
      mount(attempt) {
        attempt.onDetach(() => {
          throw firstCause;
        });
        attempt.onCleanup(() => Promise.reject(secondCause));
        attempt.onCleanup(completed);
      },
    });
    await runtime.start();

    const disposed = runtime.handle.dispose();
    await expect(disposed).rejects.toMatchObject({ code: 'dispose/failure', id: definition.id });
    expect(completed).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(runtime.handle.state).toEqual({ status: 'disposed' });
    expect(runtime.handle.dispose()).toBe(disposed);
  });

  it('isolates a broken diagnostics sink from state and teardown', async () => {
    const cause = new Error('mount failure');
    const cleanup = vi.fn();
    const runtime = createMountLifecycle({
      definition,
      reportError() {
        throw new Error('broken monitoring transport');
      },
      mount(attempt) {
        attempt.onCleanup(cleanup);
        throw cause;
      },
    });

    await expect(runtime.start()).rejects.toMatchObject({ code: 'mount/failure', cause });
    expect(runtime.handle.state.status).toBe('error');
    await runtime.handle.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('retains failed-attempt cleanup errors even after a later attempt succeeds', async () => {
    const runtime = createMountLifecycle({
      definition,
      reportError: vi.fn(),
      mount(attempt) {
        if (attempt.number !== 1) return;
        attempt.onCleanup(() => {
          throw new Error('first attempt failed to release a resource');
        });
        throw new Error('first attempt failed to mount');
      },
    });
    await expect(runtime.start()).rejects.toMatchObject({ code: 'mount/failure' });
    await runtime.handle.retry();
    expect(runtime.handle.state).toEqual({ status: 'mounted' });

    await expect(runtime.handle.dispose()).rejects.toMatchObject({ code: 'dispose/failure' });
    expect(runtime.handle.state).toEqual({ status: 'disposed' });
  });

  it('releases late registered resources without reviving a disposed mount', async () => {
    let saved: MountAttempt | undefined;
    const reportError = vi.fn();
    const runtime = createMountLifecycle({
      definition,
      reportError,
      mount(attempt) {
        saved = attempt;
      },
    });
    await runtime.start();
    await runtime.handle.dispose();
    const detach = vi.fn();
    const cleanup = vi.fn(() => Promise.reject(new Error('late cleanup failed')));
    saved?.onDetach(detach);
    saved?.onCleanup(cleanup);
    expect(detach).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledOnce());
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.handle.state).toEqual({ status: 'disposed' });
  });

  it('does not invoke the adapter if disposal wins before initial execution', async () => {
    const mount = vi.fn();
    const runtime = createMountLifecycle({ definition, mount, reportError: vi.fn() });
    const ready = runtime.start();
    await runtime.handle.dispose();
    await ready;
    await runtime.handle.retry();

    expect(mount).not.toHaveBeenCalled();
    expect(runtime.handle.state).toEqual({ status: 'disposed' });
  });

  it('isolates sibling mounts and stops notifying after unsubscription or disposal', async () => {
    const first = createMountLifecycle({ definition, mount: vi.fn(), reportError: vi.fn() });
    const second = createMountLifecycle({ definition, mount: vi.fn(), reportError: vi.fn() });
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribe = first.handle.subscribe(firstListener);
    second.handle.subscribe(secondListener);
    unsubscribe();
    unsubscribe();
    await first.start();
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();

    await second.start();
    expect(secondListener).toHaveBeenCalledOnce();
    await second.handle.dispose();
    expect(secondListener).toHaveBeenCalledTimes(2);
    second.handle.subscribe(secondListener);
    await second.handle.retry();
    expect(secondListener).toHaveBeenCalledTimes(2);
    await first.handle.dispose();
  });

  it('handles reentrant disposal during failure detachment without publishing error afterward', async () => {
    let reentrantDisposal: Promise<void> | undefined;
    const released = deferred();
    const cleanup = vi.fn(() => released.promise);
    const runtime = createMountLifecycle({
      definition,
      reportError: vi.fn(),
      mount(attempt) {
        attempt.onCleanup(cleanup);
        attempt.onDetach(() => {
          reentrantDisposal = runtime.handle.dispose();
        });
        throw new Error('mount failed');
      },
    });
    const transitions: string[] = [];
    runtime.handle.subscribe(() => transitions.push(runtime.handle.state.status));
    await runtime.start();
    let settled = false;
    const settlement = reentrantDisposal?.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    released.resolve();
    await reentrantDisposal;
    await settlement;
    await runtime.handle.dispose();

    expect(transitions).toEqual(['disposed']);
    expect(runtime.handle.state).toEqual({ status: 'disposed' });
  });
});
