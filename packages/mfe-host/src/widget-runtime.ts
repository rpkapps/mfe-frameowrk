import { createMfeError } from '@company/mfe-core';
import type { MfeError, WidgetContract } from '@company/mfe-core';
import { normalizeRegistry } from './registry';
import type { MountAttempt } from './mount-lifecycle';
import { createMountLifecycle } from './mount-lifecycle';
import { resolveMountDeadlines } from './mount-lifecycle';
import type { MountDeadlines, MountLifecycle } from './mount-lifecycle';
import type { StorageRuntimeOptions } from './app-runtime';
import type { InternalMfeDefinitionStorage, MfeDefinitionStorage } from './storage';

export interface WidgetRegistration {
  readonly id: string;
  readonly kind: 'widget';
  readonly contractMajor: number;
  readonly version?: string;
  readonly load: (options: {
    readonly signal: AbortSignal;
    readonly retry: boolean;
  }) => Promise<unknown>;
}
export interface WidgetAdapterOptions {
  readonly definition: unknown;
  readonly id: string;
  readonly target: HTMLElement;
  readonly reportError: (error: MfeError) => void;
  /** Consumer-side event schemas supplied by lazyWidget, when present. */
  readonly contract?: WidgetContract;
  /** Paired public and internal views from the shell-owned coordinator. */
  readonly storage?: InternalMfeDefinitionStorage;
  readonly publicStorage?: MfeDefinitionStorage;
}
export interface WidgetDriver {
  readonly mount: (attempt: MountAttempt) => void | Promise<void>;
  readonly update?: (
    inputs: unknown,
    handlers: Readonly<Record<string, unknown>>,
    contract?: WidgetContract,
  ) => void;
  readonly dispose?: () => void | Promise<void>;
}
export interface WidgetMountOptions {
  readonly id: string;
  readonly target: HTMLElement;
  readonly inputs: unknown;
  readonly handlers?: Readonly<Record<string, unknown>>;
  readonly contract?: WidgetContract;
}
export interface WidgetMount extends MountLifecycle {
  readonly placement: HTMLElement;
  readonly update: (
    inputs: unknown,
    handlers?: Readonly<Record<string, unknown>>,
    contract?: WidgetContract,
  ) => void;
}
export interface WidgetRuntime {
  readonly mountWidget: (options: WidgetMountOptions) => WidgetMount;
  readonly preloadWidget: (options: {
    readonly id: string;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
}

function invalid(id: string, observed: string): MfeError {
  return createMfeError({
    id,
    code: 'registry/invalid-descriptor',
    operation: 'mount Widget',
    resource: 'Widget registration',
    expected: 'a registered Widget with a compatible definition',
    observed,
    owner: 'the shell registry',
    repair: 'Correct the Widget registration and retry.',
  });
}

interface PendingLoad {
  readonly controller: AbortController;
  readonly promise: Promise<unknown>;
  readonly owners: Set<symbol>;
  done: boolean;
}

function createSharedLoader() {
  const pending = new Map<string, PendingLoad>();
  return (entry: WidgetRegistration, signal: AbortSignal, retry: boolean) => {
    if (signal.aborted) {
      return Promise.reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Widget load aborted', 'AbortError'),
      );
    }
    let operation = pending.get(entry.id);
    if (!operation) {
      const controller = new AbortController();
      const promise = Promise.resolve().then(() =>
        entry.load({ signal: controller.signal, retry }),
      );
      operation = { controller, promise, owners: new Set(), done: false };
      pending.set(entry.id, operation);
      void promise
        .finally(() => {
          operation!.done = true;
          if (pending.get(entry.id) === operation) pending.delete(entry.id);
        })
        .catch(() => {});
    }
    const active = operation;
    const owner = Symbol(entry.id);
    active.owners.add(owner);
    return new Promise<unknown>((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        active.owners.delete(owner);
        if (active.owners.size === 0 && !active.done) {
          active.controller.abort(new DOMException('No active load owners', 'AbortError'));
          if (pending.get(entry.id) === active) pending.delete(entry.id);
        }
      };
      const abort = () => {
        release();
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Widget load aborted', 'AbortError'),
        );
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      active.promise.then(
        (value) => {
          signal.removeEventListener('abort', abort);
          release();
          if (!signal.aborted) resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          release();
          if (!signal.aborted)
            reject(
              error instanceof Error ? error : new Error('Widget load failed', { cause: error }),
            );
        },
      );
    });
  };
}

function isLoadedWidget(value: unknown, id: string): boolean {
  try {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as { readonly kind?: unknown; readonly id?: unknown };
    return record.kind === 'widget' && record.id === id;
  } catch {
    return false;
  }
}

export function createWidgetRuntime(options: {
  readonly registry: readonly WidgetRegistration[];
  readonly adapter: { readonly create: (options: WidgetAdapterOptions) => WidgetDriver };
  readonly reportError: (error: MfeError) => void;
  readonly deadlines?: Partial<MountDeadlines>;
  readonly storage?: StorageRuntimeOptions;
}): WidgetRuntime {
  const normalized = normalizeRegistry(options.registry);
  for (const { error } of normalized.quarantined) options.reportError(error);
  const entries = new Map<string, WidgetRegistration>();
  const validIds = new Set(
    normalized.entries.filter((entry) => entry.kind === 'widget').map((entry) => entry.id),
  );
  for (const candidate of options.registry as readonly unknown[]) {
    try {
      if (typeof candidate !== 'object' || candidate === null) continue;
      const entry = candidate as {
        readonly id?: unknown;
        readonly kind?: unknown;
        readonly load?: unknown;
      };
      if (
        typeof entry.id !== 'string' ||
        !validIds.has(entry.id) ||
        entry.kind !== 'widget' ||
        typeof entry.load !== 'function'
      )
        continue;
      entries.set(entry.id, candidate as WidgetRegistration);
    } catch {
      // normalizeRegistry already reported this descriptor. Host getters must
      // not escape while building a runtime lookup table.
    }
  }
  const loadShared = createSharedLoader();
  const failedLoads = new Set<string>();
  async function preloadBounded(
    entry: WidgetRegistration,
    signal: AbortSignal,
    retry: boolean,
  ): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort(signal.reason);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('Widget preload timed out', 'TimeoutError'));
    }, resolveMountDeadlines(options.deadlines).loadMs);
    if (signal.aborted) forwardAbort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
    try {
      return await loadShared(entry, controller.signal, retry);
    } catch (cause) {
      if (timedOut) {
        throw createMfeError({
          id: entry.id,
          code: 'load/timeout',
          operation: 'preload Widget',
          resource: 'registered Widget loader',
          expected: 'the Widget loader to settle before the load deadline',
          observed: 'the preload deadline elapsed',
          owner: 'the neutral host runtime',
          repair: 'Check the remote availability, then retry the Widget.',
          cause,
        });
      }
      throw cause;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', forwardAbort);
    }
  }
  return {
    async preloadWidget(preloadOptions) {
      const entry = entries.get(preloadOptions.id);
      if (!entry) throw invalid(preloadOptions.id, 'an unknown or quarantined ID');
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
      if (!isLoadedWidget(definition, preloadOptions.id)) {
        failedLoads.add(preloadOptions.id);
        throw invalid(preloadOptions.id, 'loaded definition has an incompatible kind or ID');
      }
      failedLoads.delete(preloadOptions.id);
      return definition;
    },
    mountWidget(mountOptions) {
      const entry = entries.get(mountOptions.id);
      if (!entry) throw invalid(mountOptions.id, 'an unknown or quarantined ID');
      const placement = mountOptions.target.ownerDocument.createElement('div');
      placement.dataset.mfeScope = mountOptions.id;
      mountOptions.target.append(placement);
      let activeDriver: { readonly driver: WidgetDriver; disposed: boolean } | undefined;
      let latestInputs = mountOptions.inputs;
      let latestHandlers = mountOptions.handlers ?? {};
      let latestContract = mountOptions.contract;
      let retry = false;
      let disposed = false;
      const definitionStorage = options.storage?.coordinator.forDefinitionInternal(entry.id);
      const publicStorage = options.storage?.coordinator.forDefinition(entry.id);
      const disposeDriver = async (record: typeof activeDriver): Promise<void> => {
        if (record === undefined || record.disposed) return;
        record.disposed = true;
        await record.driver.dispose?.();
      };
      const updateDriver = () => {
        const driver = activeDriver?.driver;
        if (!driver) return;
        if (latestContract === undefined) driver.update?.(latestInputs, latestHandlers);
        else driver.update?.(latestInputs, latestHandlers, latestContract);
      };
      const lifecycle = createMountLifecycle({
        definition: {
          kind: 'widget',
          id: entry.id,
          ...(entry.version === undefined ? {} : { version: entry.version }),
        },
        reportError: options.reportError,
        ...(options.deadlines === undefined ? {} : { deadlines: options.deadlines }),
        detach: () => {
          disposed = true;
          placement.remove();
        },
        cleanup: () => disposeDriver(activeDriver),
        async load(attempt) {
          const loadRetry = retry || failedLoads.has(entry.id);
          retry = true;
          let definition: unknown;
          try {
            definition = await loadShared(entry, attempt.signal, loadRetry);
          } catch (cause) {
            if (!attempt.signal.aborted) failedLoads.add(entry.id);
            throw cause;
          }
          if (!attempt.isCurrent()) return;
          if (!isLoadedWidget(definition, entry.id)) {
            failedLoads.add(entry.id);
            throw invalid(entry.id, 'loaded definition has an incompatible kind or ID');
          }
          await disposeDriver(activeDriver);
          const driver = options.adapter.create({
            definition,
            id: entry.id,
            target: placement,
            reportError: options.reportError,
            ...(latestContract === undefined ? {} : { contract: latestContract }),
            ...(definitionStorage ? { storage: definitionStorage } : {}),
            ...(publicStorage ? { publicStorage } : {}),
          });
          const record = { driver, disposed: false };
          activeDriver = record;
          attempt.onCleanup(() => disposeDriver(record));
          updateDriver();
          failedLoads.delete(entry.id);
        },
        async mount(attempt) {
          const driver = activeDriver?.driver;
          if (!driver) throw invalid(entry.id, 'the adapter driver was not created');
          await driver.mount(attempt);
        },
      });
      return {
        ...lifecycle,
        placement,
        update(inputs, handlers, contract = latestContract) {
          if (disposed) return;
          latestInputs = inputs;
          if (handlers !== undefined) latestHandlers = handlers;
          latestContract = contract;
          updateDriver();
        },
      };
    },
  };
}
