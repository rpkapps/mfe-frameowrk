import type { ZodType } from 'zod';

export type StorageStore = 'local' | 'session';
export type StorageRetention = 'session' | 'preference';
export type StorageSchema<T> = ZodType<T>;

export interface StorageKeyOptions<T> {
  readonly retention?: StorageRetention;
  readonly version?: number;
  readonly migrate?: (value: unknown, fromVersion: number) => T;
}

/** Options used by a subscribed value. The default is validated at binding time. */
export interface StorageSubscriptionOptions<T> extends StorageKeyOptions<T> {
  readonly defaultValue: T;
}

export type StorageUpdater<T> = T | ((current: T | null) => T);

export interface MfeStorageKey<T> {
  readonly get: () => T | null;
  readonly getSnapshot: () => T | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (value: StorageUpdater<T>) => void;
  readonly remove: () => void;
}

export interface MfeStorage {
  readonly key: <T>(
    name: string,
    schema: StorageSchema<T>,
    options?: StorageKeyOptions<T>,
  ) => MfeStorageKey<T>;
  readonly subscribeKey: <T>(
    name: string,
    schema: StorageSchema<T>,
    options: StorageSubscriptionOptions<T>,
  ) => MfeStorageKey<T>;
  readonly remove: (name: string) => void;
  readonly clear: () => void;
}
