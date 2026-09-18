import { createMfeError, isMfeError } from '@company/mfe-core';
import type { MfeDescriptor, MfeError, MountHandle, MountState } from '@company/mfe-core';

type Cleanup = () => void | Promise<void>;

/** Shell-controlled total waits for lifecycle phases and teardown. */
export interface MountDeadlines {
  readonly loadMs: number;
  readonly mountMs: number;
  readonly disposeMs: number;
}

export const DEFAULT_MOUNT_DEADLINES: MountDeadlines = Object.freeze({
  loadMs: 30_000,
  mountMs: 30_000,
  disposeMs: 5_000,
});

/** Maximum delay accepted by the platform timer APIs used by this lifecycle. */
export const MAX_MOUNT_DEADLINE_MS = 2_147_483_647;

/** Adapter-only ownership for resources acquired by one attempt. */
export interface MountAttempt {
  readonly number: number;
  /** Aborted when this attempt fails, is retired, or its mount is disposed. */
  readonly signal: AbortSignal;
  /** Stable across retries; aborted only when the mount is disposed. */
  readonly mountSignal: AbortSignal;
  readonly isCurrent: () => boolean;
  /** Gate side effects after each await; a retired attempt cannot attach UI. */
  readonly commit: (effect: () => void) => boolean;
  /** Register immediately after acquisition. Runs synchronously at retirement. */
  readonly onDetach: (detach: () => void) => void;
  /** Register immediately after acquisition. Every cleanup is attempted once. */
  readonly onCleanup: (cleanup: Cleanup) => void;
  /** Render/error boundaries report an owned failure through this single path. */
  readonly fail: (cause: unknown) => void;
}

export interface MountLifecycleOptions {
  readonly definition: MfeDescriptor;
  /** Loading/config/bootstrap work, before the actual mount phase. */
  readonly load?: (attempt: MountAttempt) => void | Promise<void>;
  readonly mount: (attempt: MountAttempt) => void | Promise<void>;
  /** Shell-configured finite total deadlines. */
  readonly deadlines?: Partial<MountDeadlines>;
  /** Mount-lifetime placement, retained across retries and detached on disposal. */
  readonly detach?: () => void;
  readonly cleanup?: Cleanup;
  /** Sink failures cannot replace the lifecycle failure or interrupt teardown. */
  readonly reportError: (error: MfeError) => void;
}

export interface MountLifecycle {
  readonly handle: MountHandle;
  /** Starts once. The promise rejects on failure; state and diagnostics also observe it. */
  readonly start: () => Promise<void>;
}

interface Completion {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (cause: unknown) => void;
}

interface AttemptRecord {
  readonly number: number;
  readonly controller: AbortController;
  readonly completion: Completion;
  readonly detachers: Set<() => void>;
  readonly cleanups: Set<Cleanup>;
  phaseTimer: ReturnType<typeof setTimeout> | undefined;
  closed: boolean;
}

function createCompletion(): Completion {
  let resolve = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function resolveMountDeadlines(
  deadlines: Partial<MountDeadlines> | undefined,
): MountDeadlines {
  const resolved = {
    loadMs: deadlines?.loadMs ?? DEFAULT_MOUNT_DEADLINES.loadMs,
    mountMs: deadlines?.mountMs ?? DEFAULT_MOUNT_DEADLINES.mountMs,
    disposeMs: deadlines?.disposeMs ?? DEFAULT_MOUNT_DEADLINES.disposeMs,
  };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value < 0 || value > MAX_MOUNT_DEADLINE_MS) {
      throw new TypeError(
        `${name} must be a finite number from 0 through ${MAX_MOUNT_DEADLINE_MS}`,
      );
    }
  }
  return Object.freeze(resolved);
}

/**
 * One owner for state, attempt fencing, subscriptions and disposal. This internal
 * seam contains no loader selection or renderer; adapters supply those effects.
 */
export function createMountLifecycle(options: MountLifecycleOptions): MountLifecycle {
  const { definition } = options;
  const deadlines = resolveMountDeadlines(options.deadlines);
  const mountController = new AbortController();
  const listeners = new Set<() => void>();
  const cleanupTasks = new Set<Promise<void>>();
  const cleanupErrors: unknown[] = [];
  let snapshot: MountState = Object.freeze({ status: 'pending', attempt: 1 });
  let current: AttemptRecord | undefined;
  let initialPromise: Promise<void> | undefined;
  let disposal: Completion | undefined;
  let attemptNumber = 0;

  function errorDetails() {
    return {
      id: definition.id,
      ...(definition.version === undefined ? {} : { definitionVersion: definition.version }),
    };
  }

  const subject = definition.kind === 'widget' ? 'Widget' : 'App';

  function report(error: MfeError): void {
    try {
      options.reportError(error);
    } catch {
      // State/rejected operation promises remain authoritative if the sink fails.
      // Telemetry transport recovery is the shell's responsibility, not a retry.
    }
  }

  function notify(): void {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener();
      } catch (cause) {
        report(
          createMfeError({
            ...errorDetails(),
            code: 'mount/failure',
            operation: 'notify lifecycle subscriber',
            resource: 'host subscription',
            expected: 'a listener that returns without throwing',
            observed: 'a listener exception',
            owner: 'the subscribing host',
            repair: 'Repair the subscription callback. Other subscribers remain active.',
            cause,
          }),
        );
      }
    }
  }

  function publish(next: MountState): void {
    if (snapshot.status === next.status) {
      if (snapshot.status === 'pending' && next.status === 'pending') {
        if (snapshot.attempt === next.attempt) return;
      } else if (snapshot.status === 'error' && next.status === 'error') {
        if (snapshot.error === next.error) return;
      } else {
        return;
      }
    }
    snapshot = Object.freeze(next);
    notify();
  }

  function cleanupError(cause: unknown, resource: string): MfeError {
    return createMfeError({
      ...errorDetails(),
      code: 'dispose/failure',
      operation: 'dispose',
      resource,
      expected: 'all owned resources to release successfully',
      observed: 'a cleanup exception',
      owner: 'the mounting adapter',
      repair:
        'Inspect the original cause and repair the failing cleanup. Every other cleanup was attempted.',
      cause,
    });
  }

  function recordCleanupFailure(cause: unknown, resource: string): void {
    const error = cleanupError(cause, resource);
    cleanupErrors.push(error);
    report(error);
  }

  function detach(detachResource: () => void, resource: string): void {
    try {
      detachResource();
    } catch (cause) {
      recordCleanupFailure(cause, resource);
    }
  }

  function scheduleCleanup(cleanup: Cleanup, resource: string): void {
    // Observe every completion, including a resource registered by late work.
    // Individual failures never stop the other resources from being released.
    const task = Promise.resolve()
      .then(cleanup)
      .catch((cause: unknown) => {
        recordCleanupFailure(cause, resource);
      });
    cleanupTasks.add(task);
    void task.then(
      () => cleanupTasks.delete(task),
      () => cleanupTasks.delete(task),
    );
  }

  function retire(record: AttemptRecord): void {
    if (record.closed) return;
    record.closed = true;
    if (record.phaseTimer !== undefined) {
      clearTimeout(record.phaseTimer);
      record.phaseTimer = undefined;
    }
    record.controller.abort();
    for (const detachResource of [...record.detachers].reverse()) {
      detach(detachResource, `attempt ${record.number} UI/subscription`);
    }
    record.detachers.clear();
    for (const cleanup of [...record.cleanups].reverse()) {
      scheduleCleanup(cleanup, `attempt ${record.number} resource`);
    }
    record.cleanups.clear();
  }

  function isCurrent(record: AttemptRecord): boolean {
    return current === record && !record.closed && !mountController.signal.aborted;
  }

  function attributeError(error: MfeError): MfeError {
    if (
      error.id !== definition.id ||
      error.definitionVersion !== undefined ||
      definition.version === undefined
    ) {
      return error;
    }
    // Adapter errors may be frozen or shared. Enrich this mount's observation
    // without mutating the original or assigning a parent's version to a child.
    const attributed = Object.assign(new Error(error.message, { cause: error.cause }), {
      name: error.name,
      code: error.code,
      id: error.id,
      definitionVersion: definition.version,
      operation: error.operation,
      ...(error.direction === undefined ? {} : { direction: error.direction }),
      ...(error.path === undefined ? {} : { path: error.path }),
    });
    if (error.stack !== undefined) attributed.stack = error.stack;
    return attributed;
  }

  function fail(record: AttemptRecord, cause: unknown): void {
    if (!isCurrent(record)) return;
    const error = isMfeError(cause)
      ? attributeError(cause)
      : createMfeError({
          ...errorDetails(),
          code: 'mount/failure',
          operation: snapshot.status === 'mounted' ? 'render mounted App' : 'mount',
          resource: `attempt ${record.number}`,
          expected: `the ${subject} adapter to render and remain usable`,
          observed:
            snapshot.status === 'mounted'
              ? 'an exception in an active mount'
              : 'an exception before a usable mount was established',
          owner: `the ${subject} adapter or ${subject} implementation`,
          repair: `Inspect the original cause, correct the ${subject}, and explicitly retry this mount.`,
          cause,
        });
    retire(record);
    if (disposal || current !== record) {
      report(error);
      return;
    }
    record.completion.reject(error);
    publish({ status: 'error', error });
    report(error);
  }

  function createAttempt(record: AttemptRecord): MountAttempt {
    return {
      number: record.number,
      signal: record.controller.signal,
      mountSignal: mountController.signal,
      isCurrent: () => isCurrent(record),
      commit(effect) {
        if (!isCurrent(record)) return false;
        effect();
        return true;
      },
      onDetach(detachResource) {
        if (record.closed) {
          detach(detachResource, `retired attempt ${record.number} UI/subscription`);
        } else {
          record.detachers.add(detachResource);
        }
      },
      onCleanup(cleanup) {
        if (record.closed) {
          scheduleCleanup(cleanup, `retired attempt ${record.number} resource`);
        } else {
          record.cleanups.add(cleanup);
        }
      },
      fail: (cause) => fail(record, cause),
    };
  }

  function timeoutError(record: AttemptRecord, phase: 'load' | 'mount', elapsed: number): MfeError {
    const deadline = deadlines[`${phase}Ms`];
    return createMfeError({
      ...errorDetails(),
      code: phase === 'load' ? 'load/timeout' : 'mount/timeout',
      operation: `${phase} ${subject}`,
      resource: `attempt ${record.number} ${phase}`,
      expected: `${phase} work to finish within ${deadline}ms`,
      observed: `the ${phase} deadline expired after ${elapsed}ms`,
      owner: 'the shell lifecycle coordinator',
      repair: 'Inspect the remote and retry the mount.',
    });
  }

  async function runPhase(
    record: AttemptRecord,
    phase: 'load' | 'mount',
    action: () => void | Promise<void>,
  ): Promise<void> {
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = Promise.resolve().then(action);
    // The operation may ignore abort; observing it prevents an unhandled rejection
    // after the timeout has fenced this attempt.
    const observed = operation.then(
      () => ({ kind: 'done' as const }),
      (cause: unknown) => ({ kind: 'error' as const, cause }),
    );
    let removeAbortListener = () => {};
    const aborted = new Promise<{ readonly kind: 'aborted' }>((resolve) => {
      const onAbort = () => resolve({ kind: 'aborted' });
      if (record.controller.signal.aborted) {
        onAbort();
      } else {
        record.controller.signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => record.controller.signal.removeEventListener('abort', onAbort);
      }
    });
    const timeout = new Promise<{ readonly kind: 'timeout' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), deadlines[`${phase}Ms`]);
      record.phaseTimer = timer;
    });
    const result = await Promise.race([observed, timeout, aborted]);
    removeAbortListener();
    if (timer !== undefined) clearTimeout(timer);
    if (record.phaseTimer === timer) record.phaseTimer = undefined;
    if (result.kind === 'aborted') return;
    if (result.kind === 'timeout') {
      const error = timeoutError(record, phase, Date.now() - startedAt);
      // The outer failure path aborts and detaches before rejecting the attempt.
      throw error;
    }
    if (result.kind === 'error') throw result.cause;
  }

  function beginAttempt(): Promise<void> {
    const record: AttemptRecord = {
      number: ++attemptNumber,
      controller: new AbortController(),
      completion: createCompletion(),
      detachers: new Set(),
      cleanups: new Set(),
      phaseTimer: undefined,
      closed: false,
    };
    current = record;
    publish({ status: 'pending', attempt: record.number });
    // Error state and diagnostics remain observable when a UI starts an attempt
    // without awaiting it. Awaiting the original promise still rejects normally.
    void record.completion.promise.catch(() => {});
    void Promise.resolve()
      .then(async () => {
        if (!isCurrent(record)) return;
        const attempt = createAttempt(record);
        if (options.load) {
          await runPhase(record, 'load', async () => {
            await drainCleanups();
            if (!isCurrent(record)) return;
            await options.load?.(attempt);
          });
        }
        if (!isCurrent(record)) return;
        await runPhase(record, 'mount', async () => {
          await drainCleanups();
          if (!isCurrent(record)) return;
          await options.mount(attempt);
        });
      })
      .then(() => {
        if (!isCurrent(record)) return;
        publish({ status: 'mounted' });
        record.completion.resolve();
      })
      .catch((cause: unknown) => fail(record, cause));
    return record.completion.promise;
  }

  function start(): Promise<void> {
    if (disposal) return disposal.promise;
    initialPromise ??= beginAttempt();
    return initialPromise;
  }

  function retry(): Promise<void> {
    if (disposal) return disposal.promise;
    if (snapshot.status === 'error') return beginAttempt();
    return current?.completion.promise ?? start();
  }

  async function drainCleanups(): Promise<void> {
    // Cleanup may register another owned cleanup before settling. Drain those
    // tasks too; arbitrary unresolved mount code is fenced, never awaited here.
    while (cleanupTasks.size > 0) await Promise.all([...cleanupTasks]);
  }

  async function finishDisposal(completion: Completion): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, deadlines.disposeMs);
    });
    await Promise.race([drainCleanups(), timeout]);
    if (timer !== undefined) clearTimeout(timer);
    if (timedOut) {
      const error = createMfeError({
        ...errorDetails(),
        code: 'dispose/timeout',
        operation: 'dispose',
        resource: 'mount resources',
        expected: `all asynchronous cleanup to finish within ${deadlines.disposeMs}ms`,
        observed: `cleanup remained unfinished after ${deadlines.disposeMs}ms`,
        owner: 'the mounting adapter',
        repair: 'Inspect the unfinished cleanup; the mount is disposed.',
      });
      report(error);
      completion.reject(error);
      return;
    }
    if (cleanupErrors.length > 0) {
      completion.reject(
        cleanupError(
          new AggregateError(cleanupErrors, 'Mount resource cleanup failed'),
          'mount resources',
        ),
      );
    } else {
      completion.resolve();
    }
  }

  function dispose(): Promise<void> {
    if (disposal) return disposal.promise;
    disposal = createCompletion();
    // Assign disposal before invoking callbacks so reentrant dispose returns the
    // same promise. Abort/fence and detach all UI before returning to the caller.
    mountController.abort();
    if (current) {
      retire(current);
      current.completion.resolve();
    }
    if (options.detach) detach(options.detach, 'mount placement');
    if (options.cleanup) scheduleCleanup(options.cleanup, 'mount placement');
    publish({ status: 'disposed' });
    listeners.clear();
    const completion = disposal;
    // A detacher can reenter dispose while retirement is still registering its
    // remaining cleanup. Let that synchronous stack finish before draining it.
    void Promise.resolve()
      .then(() => finishDisposal(completion))
      .catch((cause: unknown) => completion.reject(cause));
    return disposal.promise;
  }

  const handle: MountHandle = {
    get state() {
      return snapshot;
    },
    getState: () => snapshot,
    subscribe(listener) {
      if (disposal) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    retry,
    dispose,
  };
  return { handle, start };
}
