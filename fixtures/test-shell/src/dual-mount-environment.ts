import { createAppRuntime, createShellSession, createShellState } from '@company/mfe-host';
import type { AppRuntime, BoundaryHistory, ShellSessionBoundary } from '@company/mfe-host';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import type { InternalStorageCoordinator } from '@company/mfe-host/internal';
import type { ShellState, ShellStateStore } from '@company/mfe-core';
import { createReactAdapter } from '@company/mfe-react/internal';
import type { MfeHostEnvironment } from '@company/mfe-react/internal';
import { registry } from './registry';
import { createWidgetScalingRuntime, scalingWidgetIds } from './widget-storage-scaling';

/** A deliberately private Storage implementation for one synthetic mount. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}

export interface DualMountEnvironment {
  readonly host: MfeHostEnvironment;
  readonly updateTheme: (theme: ShellState['theme']) => void;
  readonly dispose: () => void;
}

export function createDualMountEnvironment(options: {
  readonly mountId: 'first' | 'second';
  readonly user: NonNullable<ShellState['user']>;
  readonly groups: readonly string[];
  readonly theme: ShellState['theme'];
  readonly createNavigation: (basePath: string) => BoundaryHistory;
}): DualMountEnvironment {
  const shellState: ShellStateStore = createShellState({
    user: options.user,
    groups: options.groups,
    theme: options.theme,
  });
  // Each simulated identity gets its own coordinator and generation. Keeping
  // these in memory prevents one synthetic user from retiring the other's
  // session records in the browser's shared storage namespace.
  const storage: InternalStorageCoordinator = createInternalStorageCoordinator({
    local: memoryStorage(),
    session: memoryStorage(),
    generation: `dual-discovery:${options.mountId}:0`,
    knownDefinitionIds: ['discovery', ...scalingWidgetIds],
  });
  let generation = 0;
  const createGeneration = () => `dual-discovery:${options.mountId}:${++generation}`;
  const session: ShellSessionBoundary = createShellSession({
    coordinator: storage,
    createGeneration,
    initial: shellState.getSnapshot(),
    store: shellState,
  });
  const widgetFixture = createWidgetScalingRuntime(shellState, storage, session);

  const host: MfeHostEnvironment = {
    get runtime() {
      return runtime;
    },
    shellState,
    createNavigation: options.createNavigation,
    widgetRuntime: widgetFixture.runtime,
    session,
  };
  const runtime: AppRuntime = createAppRuntime({
    registry,
    adapters: [createReactAdapter(host)],
    reportError() {},
    storage: { coordinator: storage, createGeneration, session },
  });

  let disposed = false;
  return {
    host,
    updateTheme(theme) {
      if (disposed) return;
      session.update({ user: options.user, groups: options.groups, theme });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      widgetFixture.dispose();
      session.dispose();
      storage.dispose();
    },
  };
}
