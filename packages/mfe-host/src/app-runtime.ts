import { createMfeError, isMfeError } from '@company/mfe-core';
import type { MfeError, ShellState, ShellStateStore } from '@company/mfe-core';

import { normalizeRegistry, selectAdapter } from './registry';

import type { BoundaryHistory } from './boundary-history';
import { createMountLifecycle } from './mount-lifecycle';
import { resolveMountDeadlines } from './mount-lifecycle';
import type { MountAttempt, MountDeadlines, MountLifecycle } from './mount-lifecycle';
import { createShellState } from './shell-state';
import type {
  InternalMfeDefinitionStorage,
  InternalStorageCoordinator,
  MfeDefinitionStorage,
} from './storage';
import type { ShellSessionBoundary } from './storage-session';

export interface AppRegistration {
  readonly id: string;
  readonly kind: 'app';
  readonly contractMajor: number;
  readonly version?: string;
  /** Host implementation adapter identity; never copied into neutral records. */
  readonly adapter: string;
  readonly load: (options: {
    readonly signal: AbortSignal;
    readonly retry: boolean;
  }) => Promise<unknown>;
}

export interface AppAdapterOptions {
  readonly definition: unknown;
  readonly id: string;
  readonly basePath: string;
  readonly placement: HTMLElement;
  readonly shellState: ShellStateStore;
  readonly createNavigation?: () => BoundaryHistory;
  /** Runtime-owned namespaced services shared by all mounts of this definition. */
  readonly storage?: InternalMfeDefinitionStorage;
  /** Public read/write facade paired with `storage` by the shell coordinator. */
  readonly publicStorage?: MfeDefinitionStorage;
}

/** The host owns lifecycle; adapters register attempt resources on MountAttempt. */
export interface AppDriver {
  readonly mount: (attempt: MountAttempt) => void | Promise<void>;
  readonly updateShellState?: (next: ShellState) => void | Promise<void>;
  readonly detach?: () => void;
  readonly dispose?: () => void | Promise<void>;
}

export interface AppAdapter {
  readonly id: string;
  readonly create: (options: AppAdapterOptions) => AppDriver;
}

export interface AppMountOptions {
  readonly id: string;
  readonly basePath: string;
  readonly target: HTMLElement;
  readonly shellState: ShellState;
  readonly createNavigation?: () => BoundaryHistory;
}

export interface AppMount extends MountLifecycle {
  readonly placement: HTMLElement;
  readonly updateShellState: (next: ShellState) => Promise<void>;
}

export interface StorageRuntimeOptions {
  readonly coordinator: InternalStorageCoordinator;
  /** Deprecated compatibility field; session retirement belongs to the shell boundary. */
  readonly createGeneration?: () => string;
  /** Explicit shell boundary retires session storage before App state publication. */
  readonly session?: ShellSessionBoundary;
}

export interface AppRuntime {
  readonly mountApp: (options: AppMountOptions) => AppMount;
  /** Load and validate an App definition without creating placement or lifecycle state. */
  readonly preloadApp: (options: {
    readonly id: string;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
}

function report(sink: (error: MfeError) => void, error: MfeError): void {
  try {
    sink(error);
  } catch {
    // Diagnostics must not prevent valid registry entries from being usable.
  }
}

function safeRegistration(value: unknown): AppRegistration | undefined {
  try {
    if (typeof value !== 'object' || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const id = record.id;
    const kind = record.kind;
    const contractMajor = record.contractMajor;
    const version = record.version;
    const adapter = record.adapter;
    const load = record.load;
    if (
      typeof id !== 'string' ||
      kind !== 'app' ||
      typeof contractMajor !== 'number' ||
      (version !== undefined && typeof version !== 'string') ||
      typeof adapter !== 'string' ||
      typeof load !== 'function'
    ) {
      return undefined;
    }
    return {
      id,
      kind: 'app',
      contractMajor,
      ...(version === undefined ? {} : { version }),
      adapter,
      load: load as AppRegistration['load'],
    };
  } catch {
    return undefined;
  }
}

function isLoadedDefinition(value: unknown, id: string, kind: 'app' | 'widget'): boolean {
  try {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as { readonly kind?: unknown; readonly id?: unknown };
    return record.kind === kind && record.id === id;
  } catch {
    return false;
  }
}

function invalidRegistry(id: string, observed: string, duplicate = false): MfeError {
  return createMfeError({
    id,
    code: duplicate ? 'registry/duplicate-id' : 'registry/invalid-descriptor',
    operation: 'normalize app registry',
    resource: 'app registration',
    expected: 'a unique nonempty ID, registered adapter, and loader',
    observed,
    owner: 'the shell registry',
    repair: 'Correct the registration before mounting the app.',
  });
}

interface PendingLoad {
  readonly controller: AbortController;
  readonly owners: Set<symbol>;
  readonly promise: Promise<unknown>;
  done: boolean;
}

/** Shares one in-flight transport load while retaining per-mount cancellation. */
function createSharedLoader() {
  const pending = new Map<string, PendingLoad>();

  function load(
    entry: { readonly registration: AppRegistration },
    signal: AbortSignal,
    retry: boolean,
  ): Promise<unknown> {
    if (signal.aborted) {
      return Promise.reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('App load aborted', 'AbortError'),
      );
    }
    let operation = pending.get(entry.registration.id);
    if (!operation) {
      const controller = new AbortController();
      const source = Promise.resolve().then(() =>
        entry.registration.load({ signal: controller.signal, retry }),
      );
      const promise = source.finally(() => {
        const current = pending.get(entry.registration.id);
        if (current?.promise === promise) {
          current.done = true;
          pending.delete(entry.registration.id);
        }
      });
      const created: PendingLoad = {
        controller,
        owners: new Set(),
        promise,
        done: false,
      };
      operation = created;
      pending.set(entry.registration.id, operation);
      // A caller may dispose before the transport settles. Keep the rejection observed.
      void operation.promise.catch(() => {});
    }

    const active = operation;
    const owner = Symbol(entry.registration.id);
    active.owners.add(owner);
    return new Promise((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        active.owners.delete(owner);
        if (active.owners.size === 0 && !active.done) {
          active.controller.abort(new DOMException('No active load owners', 'AbortError'));
          if (pending.get(entry.registration.id) === active) pending.delete(entry.registration.id);
        }
      };
      const onAbort = () => {
        release();
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('App load aborted', 'AbortError'),
        );
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      active.promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          release();
          if (!signal.aborted) resolve(value);
        },
        (cause: unknown) => {
          signal.removeEventListener('abort', onAbort);
          release();
          if (!signal.aborted) {
            reject(cause instanceof Error ? cause : new Error('App load failed', { cause }));
          }
        },
      );
    });
  }

  return { load };
}

/** Neutral registry selection, state, attempt fencing and placement ownership. */
export function createAppRuntime(options: {
  readonly registry: readonly AppRegistration[];
  readonly adapters: readonly AppAdapter[];
  readonly reportError: (error: MfeError) => void;
  /** Shell-owned total deadlines for load, mount, and disposal phases. */
  readonly deadlines?: Partial<MountDeadlines>;
  /** One coordinator is shared by every definition and mount in this runtime. */
  readonly storage?: StorageRuntimeOptions;
}): AppRuntime {
  const adapters = new Map<string, AppAdapter>();
  for (const adapter of options.adapters) {
    if (!adapter.id.trim() || typeof adapter.create !== 'function') {
      throw invalidRegistry(adapter.id, 'invalid adapter');
    }
    if (adapters.has(adapter.id)) throw invalidRegistry(adapter.id, 'duplicate adapter ID', true);
    adapters.set(adapter.id, adapter);
  }
  const deadlines = resolveMountDeadlines(options.deadlines);
  const sharedLoader = createSharedLoader();
  const failedLoads = new Set<string>();
  async function preloadBounded(
    entry: { readonly registration: AppRegistration },
    signal: AbortSignal,
    retry: boolean,
  ): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort(signal.reason);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('App preload timed out', 'TimeoutError'));
    }, deadlines.loadMs);
    if (signal.aborted) forwardAbort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
    try {
      return await sharedLoader.load(entry, controller.signal, retry);
    } catch (cause) {
      if (timedOut) {
        throw createMfeError({
          id: entry.registration.id,
          code: 'load/timeout',
          operation: 'preload app',
          resource: 'registered app loader',
          expected: `the App loader to settle within ${deadlines.loadMs}ms`,
          observed: 'the preload deadline elapsed',
          owner: 'the neutral host runtime',
          repair: 'Check the remote availability, then retry the App.',
          cause,
        });
      }
      throw cause;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', forwardAbort);
    }
  }
  const registry = new Map<string, { registration: AppRegistration; adapter: AppAdapter }>();
  const normalized = normalizeRegistry(options.registry);
  for (const { error } of normalized.quarantined) report(options.reportError, error);
  const registrations = new Map<string, AppRegistration>();
  for (const candidate of options.registry as readonly unknown[]) {
    const registration = safeRegistration(candidate);
    if (registration) registrations.set(registration.id, registration);
  }
  for (const record of normalized.entries) {
    // This runtime mounts Apps. Other neutral kinds remain available to a future
    // runtime without being coerced into an App adapter.
    if (selectAdapter(record) !== 'app') {
      report(
        options.reportError,
        invalidRegistry(record.id, `unsupported runtime kind ${record.kind}`),
      );
      continue;
    }
    const registration = registrations.get(record.id);
    const adapter = registration ? adapters.get(registration.adapter) : undefined;
    if (!registration || !adapter || typeof registration.load !== 'function') {
      report(options.reportError, invalidRegistry(record.id, 'invalid loader or unknown adapter'));
      continue;
    }
    registry.set(record.id, { registration: { ...registration }, adapter });
  }

  return {
    async preloadApp(preloadOptions) {
      const entry = registry.get(preloadOptions.id);
      if (!entry) throw invalidRegistry(preloadOptions.id, 'unregistered app ID');
      let definition: unknown;
      try {
        definition = await preloadBounded(
          entry,
          preloadOptions.signal,
          failedLoads.has(preloadOptions.id),
        );
      } catch (cause) {
        if (!preloadOptions.signal.aborted) failedLoads.add(preloadOptions.id);
        throw cause;
      }
      if (!isLoadedDefinition(definition, preloadOptions.id, 'app')) {
        failedLoads.add(preloadOptions.id);
        throw invalidRegistry(
          preloadOptions.id,
          'loaded definition has an incompatible kind or ID',
        );
      }
      failedLoads.delete(preloadOptions.id);
      return definition;
    },
    mountApp(mountOptions): AppMount {
      const entry = registry.get(mountOptions.id);
      if (!entry) throw invalidRegistry(mountOptions.id, 'unregistered app ID');
      const placement = mountOptions.target.ownerDocument.createElement('div');
      placement.dataset.mfeScope = mountOptions.id;
      // Structural sizing belongs to the owned mount, independent of shell CSS.
      Object.assign(placement.style, { width: '100%', height: '100%', minHeight: '0' });
      mountOptions.target.append(placement);
      const shellState = createShellState(mountOptions.shellState);
      const definitionStorage = options.storage?.coordinator.forDefinitionInternal(mountOptions.id);
      const publicStorage = options.storage?.coordinator.forDefinition(mountOptions.id);
      let driver: AppDriver | undefined;
      let disposed = false;
      let retryLoad = false;
      let activeAttempt: MountAttempt | undefined;
      const lifecycle = createMountLifecycle({
        definition: {
          kind: 'app',
          id: mountOptions.id,
          ...(entry.registration.version === undefined
            ? {}
            : { version: entry.registration.version }),
        },
        reportError: options.reportError,
        deadlines,
        detach() {
          disposed = true;
          placement.remove();
          shellState.dispose();
          driver?.detach?.();
        },
        cleanup: () => driver?.dispose?.(),
        async load(attempt) {
          activeAttempt = attempt;
          if (driver) return;
          let definition: unknown;
          const retry = retryLoad || failedLoads.has(mountOptions.id);
          // Keep retry enabled until both the descriptor and adapter accept the module.
          retryLoad = true;
          try {
            definition = await sharedLoader.load(entry, attempt.signal, retry);
          } catch (cause) {
            if (!attempt.signal.aborted) failedLoads.add(mountOptions.id);
            if (isMfeError(cause)) throw cause;
            throw createMfeError({
              id: mountOptions.id,
              code: 'load/entry-failure',
              operation: 'load app',
              resource: 'registered app loader',
              expected: 'a compatible app definition',
              observed: 'the loader rejected',
              owner: 'the registered transport',
              repair: 'Check the remote availability, then retry.',
              cause,
            });
          }
          if (!attempt.isCurrent()) return;
          if (!isLoadedDefinition(definition, mountOptions.id, 'app')) {
            failedLoads.add(mountOptions.id);
            throw invalidRegistry(
              mountOptions.id,
              'loaded definition has an incompatible kind or ID',
            );
          }
          driver = entry.adapter.create({
            definition,
            id: mountOptions.id,
            basePath: mountOptions.basePath,
            placement,
            shellState,
            ...(mountOptions.createNavigation
              ? { createNavigation: mountOptions.createNavigation }
              : {}),
            ...(definitionStorage ? { storage: definitionStorage } : {}),
            ...(publicStorage ? { publicStorage } : {}),
          });
          failedLoads.delete(mountOptions.id);
          retryLoad = false;
        },
        async mount(attempt) {
          activeAttempt = attempt;
          if (!driver) {
            throw createMfeError({
              id: mountOptions.id,
              code: 'mount/failure',
              operation: 'mount app',
              resource: 'registered app adapter',
              expected: 'the adapter to be created during the load phase',
              observed: 'no adapter driver was available',
              owner: 'the neutral host runtime',
              repair: 'Inspect the registry loader and retry the mount.',
            });
          }
          await driver.mount(attempt);
        },
      });
      return {
        ...lifecycle,
        placement,
        async updateShellState(next) {
          if (disposed) return;
          const attempt = activeAttempt;
          try {
            if (options.storage?.session) {
              options.storage.session.update(next);
            }
            if (driver?.updateShellState) await driver.updateShellState(next);
            else shellState.update(next);
          } catch (cause) {
            attempt?.fail(cause);
            throw cause;
          }
        },
      };
    },
  };
}
