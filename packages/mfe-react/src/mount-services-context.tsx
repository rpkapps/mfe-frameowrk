import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type {
  MfeDefinitionStorage,
  InternalMfeDefinitionStorage,
  InternalMfeStorage,
  InternalMfeStorageKey,
} from '@company/mfe-host/internal';
import type {
  MfeStorage,
  ShellStateStore,
  StorageKeyOptions,
  StorageSchema,
} from '@company/mfe-core';
import type { ShellSessionBoundary } from '@company/mfe-host';

export interface MfeMountServices {
  readonly id: string;
  readonly kind: 'app' | 'widget';
  readonly storage: MfeDefinitionStorage;
  readonly internalStorage: InternalMfeDefinitionStorage;
  readonly signal: AbortSignal;
  readonly basePath?: string;
}

export interface MfeReactMountEnvironment {
  readonly shellState: ShellStateStore;
  readonly services: MfeMountServices;
  /** Shell-owned session boundary shared by App and Widget mounts. */
  readonly session: ShellSessionBoundary;
}

const MountServicesContext = createContext<MfeMountServices | null>(null);

export function MountServicesProvider({
  services,
  children,
}: {
  readonly services: MfeMountServices;
  readonly children: ReactNode;
}) {
  return <MountServicesContext value={services}>{children}</MountServicesContext>;
}

export function useMfeMountServices(): MfeMountServices {
  const services = useContext(MountServicesContext);
  if (services === null)
    throw new Error('MFE service hooks require a framework mount with its service provider.');
  return services;
}

export function useMfeStorage(store: 'local' | 'session'): MfeStorage {
  return useMfeMountServices().storage[store];
}

export function useMfeSignal(): AbortSignal {
  return useMfeMountServices().signal;
}

export function useBasePath(): string {
  const services = useMfeMountServices();
  if (services.kind !== 'app' || services.basePath === undefined)
    throw new Error('useBasePath is available only to App mounts.');
  return services.basePath;
}

interface StoredStateOptions<T> extends StorageKeyOptions<T> {
  readonly defaultValue: T;
  readonly storage?: 'local' | 'session';
}

export function useStoredState<T>(
  name: string,
  schema: StorageSchema<T>,
  options: StoredStateOptions<T>,
): readonly [T, (next: T | ((current: T) => T)) => void] {
  const services = useMfeMountServices();
  const store = options.storage ?? 'local';
  const internal: InternalMfeStorage = services.internalStorage[store];
  const binding = useMemo<InternalMfeStorageKey<T>>(
    () => internal.subscribeKey(name, schema, options),
    // Individual option fields define the storage binding identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid recreating a binding for a new options object with equal fields.
    [
      internal,
      name,
      schema,
      options.defaultValue,
      options.retention,
      options.version,
      options.migrate,
    ],
  );
  const getSnapshot = useCallback((): T => binding.getSnapshot() as T, [binding]);
  const value = useSyncExternalStore(binding.subscribe, getSnapshot, getSnapshot);
  const setValue = useCallback(
    (next: T | ((current: T) => T)) =>
      typeof next === 'function'
        ? binding.set((current) => (next as (current: T) => T)(current as T))
        : binding.set(next),
    [binding],
  );
  return [value, setValue] as const;
}
