import { createMfeError } from '@company/mfe-core';

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
