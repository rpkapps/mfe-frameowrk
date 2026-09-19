import { createMfeError } from '@company/mfe-core';
import type { ShellState, ShellStateStore } from '@company/mfe-core';
import { createShellState } from './shell-state';

/** Identity and authorization values that define a storage session. */
export interface StorageSessionMetadata {
  readonly principalId: string | null;
  readonly accountId: string | null;
  readonly tenantId: string | null;
  readonly groups: readonly string[];
}

export interface StorageSessionTransitionOptions {
  readonly coordinator: {
    readonly transition: (generation: string) => boolean;
  };
  readonly previous: StorageSessionMetadata;
  readonly next: StorageSessionMetadata;
  /** The shell owns generation stability and supplies a fresh value on change. */
  readonly generation: string;
  /** Publishes shell state after session-retained values have been retired. */
  readonly publish: () => void;
}

function sameGroupSet(previous: readonly string[], next: readonly string[]): boolean {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  if (previousSet.size !== nextSet.size) return false;
  for (const group of previousSet) {
    if (!nextSet.has(group)) return false;
  }
  return true;
}

/** Returns whether a metadata change starts a new storage session. */
export function hasStorageSessionChanged(
  previous: StorageSessionMetadata,
  next: StorageSessionMetadata,
): boolean {
  return (
    !Object.is(previous.principalId, next.principalId) ||
    !Object.is(previous.accountId, next.accountId) ||
    !Object.is(previous.tenantId, next.tenantId) ||
    !sameGroupSet(previous.groups, next.groups)
  );
}

/** Retires session storage before publishing a semantically new shell session. */
export function transitionStorageSession(options: StorageSessionTransitionOptions): boolean {
  const changed = hasStorageSessionChanged(options.previous, options.next);
  if (changed) {
    const retired = options.coordinator.transition(options.generation);
    if (retired !== true) {
      throw createMfeError({
        code: 'storage/failure',
        id: 'storage',
        operation: 'transition storage session',
        resource: 'session generation',
        expected: 'a fresh generation for a semantic session transition',
        observed: 'the coordinator retained the current generation',
        owner: 'the shell session coordinator',
        repair: 'Supply a fresh shell-owned generation before publishing the new session.',
      });
    }
  }
  options.publish();
  return changed;
}

/** Shared shell boundary for retiring one coordinator before publishing a new session snapshot. */
export interface StorageSessionBoundary {
  readonly getSnapshot: () => StorageSessionMetadata;
  readonly update: (next: StorageSessionMetadata) => boolean;
}

export function createStorageSession(options: {
  readonly coordinator: { readonly transition: (generation: string) => boolean };
  readonly createGeneration: () => string;
  readonly initial: StorageSessionMetadata;
}): StorageSessionBoundary {
  let current = options.initial;
  return {
    getSnapshot: () => current,
    update(next: StorageSessionMetadata) {
      const changed = hasStorageSessionChanged(current, next);
      if (changed) {
        const retired = options.coordinator.transition(options.createGeneration());
        if (!retired) {
          throw createMfeError({
            code: 'storage/failure',
            id: 'storage',
            operation: 'transition storage session',
            resource: 'session generation',
            expected: 'a fresh generation for a semantic session transition',
            observed: 'the coordinator retained the current generation',
            owner: 'the shell session coordinator',
            repair: 'Supply a fresh shell-owned generation before publishing the new session.',
          });
        }
      }
      current = next;
      return changed;
    },
  };
}

/**
 * Shell-owned session boundary. It coordinates one storage coordinator and all
 * mounted Query clients before publishing a semantic identity/group update.
 * Query retirement is deliberately synchronous to the boundary: callbacks
 * start cancellation/reset work and must not make state publication awaitable.
 */
export interface ShellSessionBoundary {
  readonly store: ShellStateStore;
  readonly getSnapshot: () => ShellState;
  readonly registerQueryRetirer: (retire: () => void) => () => void;
  readonly update: (next: ShellState) => boolean;
  readonly dispose: () => void;
}

export interface ShellSessionOptions {
  readonly coordinator: { readonly transition: (generation: string) => boolean };
  readonly createGeneration: () => string;
  readonly initial: ShellState;
  /** Supply the shell's existing store when one already owns the snapshot. */
  readonly store?: ShellStateStore;
}

/** Creates the single shell session boundary shared by App and Widget mounts. */
export function createShellSession(options: ShellSessionOptions): ShellSessionBoundary {
  const store = options.store ?? createShellState(options.initial);
  const retirees = new Set<() => void>();
  let disposed = false;

  return Object.freeze({
    store,
    getSnapshot: () => store.getSnapshot(),
    registerQueryRetirer(retire: () => void) {
      if (disposed) return () => {};
      retirees.add(retire);
      return () => retirees.delete(retire);
    },
    update(next: ShellState) {
      if (disposed) return false;
      const previous = store.getSnapshot();
      const metadataChanged =
        previous.user?.id !== next.user?.id || !sameGroupSet(previous.groups, next.groups);
      if (metadataChanged) {
        let retirementFailed = false;
        let retirementFailure: unknown;
        for (const retire of [...retirees]) {
          if (!retirees.has(retire)) continue;
          try {
            retire();
          } catch (cause) {
            retirementFailed = true;
            retirementFailure ??= cause;
          }
        }
        if (retirementFailed) {
          throw createMfeError({
            code: 'storage/failure',
            id: 'storage',
            operation: 'retire shell session resources',
            resource: 'registered query retiree',
            expected: 'all mounted resources to retire before a session publish',
            observed: 'a mounted resource retirement failed',
            owner: 'the shell session boundary',
            repair: 'Repair the failed mount cleanup before changing the shell session.',
            cause: retirementFailure,
          });
        }
        if (!options.coordinator.transition(options.createGeneration())) {
          throw createMfeError({
            code: 'storage/failure',
            id: 'storage',
            operation: 'transition shell session',
            resource: 'session generation',
            expected: 'a fresh generation for a semantic session transition',
            observed: 'the coordinator retained the current generation',
            owner: 'the shell session boundary',
            repair: 'Supply a fresh shell-owned generation before publishing the new session.',
          });
        }
      }
      return store.update(next);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      retirees.clear();
      store.dispose();
    },
  });
}
