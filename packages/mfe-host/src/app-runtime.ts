import { createMfeError, isMfeError } from '@company/mfe-core';
import type { MfeError, ShellState, ShellStateStore } from '@company/mfe-core';

import type { BoundaryHistory } from './boundary-history';
import { createMountLifecycle } from './mount-lifecycle';
import type { MountAttempt, MountLifecycle } from './mount-lifecycle';
import { createShellState } from './shell-state';

export interface AppRegistration {
  readonly id: string;
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

export interface AppRuntime {
  readonly mountApp: (options: AppMountOptions) => AppMount;
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

/** Neutral registry selection, state, attempt fencing and placement ownership. */
export function createAppRuntime(options: {
  readonly registry: readonly AppRegistration[];
  readonly adapters: readonly AppAdapter[];
  readonly reportError: (error: MfeError) => void;
}): AppRuntime {
  const adapters = new Map<string, AppAdapter>();
  for (const adapter of options.adapters) {
    if (!adapter.id.trim() || typeof adapter.create !== 'function') {
      throw invalidRegistry(adapter.id, 'invalid adapter');
    }
    if (adapters.has(adapter.id)) throw invalidRegistry(adapter.id, 'duplicate adapter ID', true);
    adapters.set(adapter.id, adapter);
  }
  const registry = new Map<string, { registration: AppRegistration; adapter: AppAdapter }>();
  for (const registration of options.registry) {
    const adapter = adapters.get(registration.adapter);
    if (!registration.id.trim() || !adapter || typeof registration.load !== 'function') {
      throw invalidRegistry(registration.id, 'invalid ID, loader, or unknown adapter');
    }
    if (registry.has(registration.id)) {
      throw invalidRegistry(registration.id, 'duplicate app ID', true);
    }
    registry.set(registration.id, { registration: { ...registration }, adapter });
  }

  return {
    mountApp(mountOptions): AppMount {
      const entry = registry.get(mountOptions.id);
      if (!entry) throw invalidRegistry(mountOptions.id, 'unregistered app ID');
      const placement = mountOptions.target.ownerDocument.createElement('div');
      placement.dataset.mfeScope = mountOptions.id;
      placement.className = 'mfe-placement';
      mountOptions.target.append(placement);
      const shellState = createShellState(mountOptions.shellState);
      let driver: AppDriver | undefined;
      let disposed = false;
      let retryLoad = false;
      let activeAttempt: MountAttempt | undefined;
      const lifecycle = createMountLifecycle({
        definition: { kind: 'app', id: mountOptions.id },
        reportError: options.reportError,
        detach() {
          disposed = true;
          placement.remove();
          shellState.dispose();
          driver?.detach?.();
        },
        cleanup: () => driver?.dispose?.(),
        async mount(attempt) {
          activeAttempt = attempt;
          if (!driver) {
            let definition: unknown;
            const retry = retryLoad;
            // Keep retry enabled until both the descriptor and adapter accept the module.
            retryLoad = true;
            try {
              definition = await entry.registration.load({
                signal: attempt.signal,
                retry,
              });
            } catch (cause) {
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
            if (
              typeof definition !== 'object' ||
              definition === null ||
              !('kind' in definition) ||
              definition.kind !== 'app' ||
              !('id' in definition) ||
              definition.id !== mountOptions.id
            ) {
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
            });
            retryLoad = false;
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
