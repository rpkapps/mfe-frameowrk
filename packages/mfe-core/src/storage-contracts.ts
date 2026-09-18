import type { ZodType } from 'zod';

export type StorageStore = 'local' | 'session';
export type StorageRetention = 'session' | 'preference';
export type StorageSchema<T> = ZodType<T>;

export interface StorageKeyOptions<T> {
  readonly retention?: StorageRetention;
  readonly version?: number;
  readonly migrate?: (value: unknown, fromVersion: number) => T;
}

export interface MfeStorageKey<T> {
  readonly get: () => T | null;
  readonly set: (value: T) => void;
  readonly remove: () => void;
}

export interface MfeStorage {
  readonly key: <T>(
    name: string,
    schema: StorageSchema<T>,
    options?: StorageKeyOptions<T>,
  ) => MfeStorageKey<T>;
  readonly remove: (name: string) => void;
  readonly clear: () => void;
}
