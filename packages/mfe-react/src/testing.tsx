/**
 * Test-only author support.
 *
 * This entry is intentionally outside the production root.  It assembles the
 * same neutral host runtime and React adapters used by the shell, while giving
 * tests deterministic in-memory storage and history boundaries.
 */
import { createMemoryHistory } from '@tanstack/history';
import type { RouterHistory } from '@tanstack/history';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { getQueriesForElement } from '@testing-library/dom';
import type { BoundFunctions } from '@testing-library/dom';
import type * as domQueries from '@testing-library/dom';
import type { ShellState } from '@company/mfe-core';
import { MFE_CONTRACT_MAJOR } from '@company/mfe-core';
import { createAppRuntime, createWidgetRuntime } from '@company/mfe-host';
import type { InternalStorageCoordinator } from '@company/mfe-host/internal';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import { createShellSession } from '@company/mfe-host';
import type { MfeRouterContext } from './router-context';
import type { AppDefinition } from './index';
import { createReactDriver } from './app-mount';
import type { MfeHostEnvironment } from './host-context';
import { MountServicesProvider } from './mount-services-context';
import type { MfeMountServices, MfeReactMountEnvironment } from './mount-services-context';
import { ShellStateProvider } from './shell-state-context';
import { MfeHostProvider } from './host-context';
import { createReactWidgetAdapter } from './widget-adapter';
import type { WidgetDefinition } from './widget-definition';

type TestQueries = BoundFunctions<typeof domQueries.queries>;

const activeDisposers = new Set<() => Promise<void>>();

/** Await cleanup for every helper created by the current test. */
export async function cleanupMfeTests(): Promise<void> {
  const disposers = [...activeDisposers];
  await Promise.all(disposers.map((dispose) => dispose()));
}

export interface TestStorageFixtures {
  readonly local: Storage;
  readonly session: Storage;
  readonly coordinator: InternalStorageCoordinator;
}

export function createTestStorageCoordinator(
  options: {
    readonly local?: Storage;
    readonly session?: Storage;
    readonly generation?: string;
    readonly knownDefinitionIds?: Iterable<string>;
  } = {},
): InternalStorageCoordinator {
  return createInternalStorageCoordinator({
    local: options.local ?? new MemoryStorage(),
    session: options.session ?? new MemoryStorage(),
    generation: options.generation ?? 'test-generation-0',
    ...(options.knownDefinitionIds === undefined
      ? {}
      : { knownDefinitionIds: options.knownDefinitionIds }),
  });
}

export interface MfeTestEnvironmentOptions<TRouter extends AnyRouter = AnyRouter> {
  readonly id: string;
  /** Optional for hook/provider tests; renderApp requires a definition. */
  readonly definition?: AppDefinition<TRouter>;
  readonly shellState?: ShellState;
  readonly basePath?: string;
  readonly history?: RouterHistory;
  readonly localStorage?: Storage;
  readonly sessionStorage?: Storage;
  /** Reuse this coordinator only when a test explicitly models sharing. */
  readonly storageCoordinator?: InternalStorageCoordinator;
  /** Alias retained for explicit shared-coordinator fixtures. */
  readonly storageGeneration?: string;
  readonly onError?: (error: unknown) => void;
}

export interface MfeTestEnvironment {
  readonly id: string;
  readonly target: HTMLDivElement;
  readonly wrapper: (props: { readonly children?: ReactNode }) => ReactElement;
  readonly queryClient: QueryClient;
  readonly storage: TestStorageFixtures;
  readonly routerContext: MfeRouterContext;
  readonly setShellState: (patch: Partial<ShellState> | ShellState) => Promise<void>;
  readonly dispose: () => Promise<void>;
  readonly getQueries: () => TestQueries;
  readonly ready: Promise<void>;
}

const initialShellState: ShellState = Object.freeze({
  user: null,
  groups: Object.freeze([]),
  theme: 'light',
});

/** A deterministic browser-storage implementation for unit tests and fixtures. */
export class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(String(key)) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(String(key));
  }
  setItem(key: string, value: string) {
    this.values.set(String(key), String(value));
  }
}

function mergeShellState(current: ShellState, patch: Partial<ShellState> | ShellState): ShellState {
  return Object.freeze({
    user: patch.user === undefined ? current.user : patch.user,
    groups: patch.groups === undefined ? current.groups : [...patch.groups],
    theme: patch.theme === undefined ? current.theme : patch.theme,
  });
}

function freshHistory(source: RouterHistory | undefined, basePath: string): () => RouterHistory {
  let supplied = source;
  return () => {
    if (supplied !== undefined) {
      const result = supplied;
      supplied = undefined;
      return result;
    }
    return createMemoryHistory({ initialEntries: [basePath || '/'] });
  };
}

/**
 * Creates an isolated provider environment.  `definition` is deliberately
 * optional: component and hook tests should not need to manufacture a router.
 */
export function createMfeTestEnvironment<TRouter extends AnyRouter = AnyRouter>(
  options: MfeTestEnvironmentOptions<TRouter>,
): MfeTestEnvironment {
  if (!options.id.trim()) throw new Error('createMfeTestEnvironment requires a non-empty id.');
  const target = document.createElement('div');
  document.body.append(target);
  const local = options.localStorage ?? new MemoryStorage();
  const session = options.sessionStorage ?? new MemoryStorage();
  const coordinatorOwned = options.storageCoordinator === undefined;
  const coordinator =
    options.storageCoordinator ??
    createInternalStorageCoordinator({
      local,
      session,
      generation: options.storageGeneration ?? 'test-generation-0',
      knownDefinitionIds: [options.id],
    });
  if (coordinatorOwned) coordinator.setKnownDefinitionIds([options.id]);
  const initial = options.shellState ?? initialShellState;
  const storageSession = createShellSession({
    coordinator,
    createGeneration: (() => {
      let counter = 0;
      return () => `${options.storageGeneration ?? 'test-generation-0'}:component:${++counter}`;
    })(),
    initial,
  });
  const shellState = storageSession.store;
  const componentShellState = shellState;
  const queryClient = new QueryClient();
  const mountController = new AbortController();
  const basePath = options.basePath ?? '/';
  const definitionStorage = coordinator.forDefinitionInternal(options.id);
  const services: MfeMountServices = {
    id: options.id,
    kind: 'app',
    storage: coordinator.forDefinition(options.id),
    internalStorage: definitionStorage,
    signal: mountController.signal,
    basePath,
  };

  const hostEnvironment = {
    get runtime() {
      return appRuntime;
    },
    shellState,
    createNavigation: () => {
      throw new Error('The test App driver owns its supplied memory history.');
    },
    get widgetRuntime() {
      return widgetRuntime;
    },
    session: storageSession,
  } satisfies MfeHostEnvironment;

  const makeHistory = freshHistory(options.history, basePath);
  const registrations = options.definition
    ? [
        {
          id: options.definition.id,
          kind: 'app' as const,
          contractMajor: MFE_CONTRACT_MAJOR,
          adapter: 'react',
          load: () => Promise.resolve(options.definition),
        },
      ]
    : [];
  const appRuntime = createAppRuntime({
    registry: registrations,
    adapters: [
      {
        id: 'react',
        create(adapterOptions) {
          return createReactDriver(adapterOptions, makeHistory, queryClient, hostEnvironment);
        },
      },
    ],
    reportError: (error) => options.onError?.(error),
    storage: {
      coordinator,
      createGeneration: (() => {
        let counter = 0;
        return () => `${options.storageGeneration ?? 'test-generation-0'}:${++counter}`;
      })(),
      session: storageSession,
    },
  });
  // A widget runtime is built for the environment so nested App tests can use
  // the public host context without supplying a test-local adapter.
  const widgetRuntime = createWidgetRuntime({
    registry: [],
    adapter: createReactWidgetAdapter({
      shellState,
      services,
      session: storageSession,
    } satisfies MfeReactMountEnvironment),
    reportError: (error) => options.onError?.(error),
  });

  const mount = options.definition
    ? appRuntime.mountApp({
        id: options.definition.id,
        basePath,
        target,
        shellState: shellState.getSnapshot(),
      })
    : undefined;
  const unregisterQueryRetirer = storageSession.registerQueryRetirer(() => {
    void queryClient.cancelQueries().catch(() => {});
    queryClient.clear();
  });
  let current = shellState.getSnapshot();
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  const routerContext = {
    get mfe() {
      return Object.freeze({
        ...current,
        signal: mountController.signal,
        storage: coordinator.forDefinition(options.id),
      });
    },
    queryClient,
  } as MfeRouterContext;

  const setShellState = async (patch: Partial<ShellState> | ShellState) => {
    if (disposed) return;
    const next = mergeShellState(current, patch);
    if (mount !== undefined) {
      await mount.updateShellState(next);
    } else {
      storageSession.update(next);
    }
    current = next;
  };

  const ready = mount?.start() ?? Promise.resolve();
  const environment: MfeTestEnvironment = {
    id: options.id,
    target,
    wrapper: ({ children }) => (
      <ShellStateProvider store={componentShellState}>
        <QueryClientProvider client={queryClient}>
          <MountServicesProvider services={services}>
            <MfeHostProvider value={hostEnvironment}>{children}</MfeHostProvider>
          </MountServicesProvider>
        </QueryClientProvider>
      </ShellStateProvider>
    ),
    queryClient,
    storage: { local, session, coordinator },
    routerContext,
    setShellState,
    ready,
    getQueries: () => getQueriesForElement(target),
    async dispose() {
      if (disposePromise !== undefined) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        mountController.abort();
        if (mount !== undefined) await mount.handle.dispose();
        await queryClient.cancelQueries();
        queryClient.clear();
        unregisterQueryRetirer();
        if (coordinatorOwned) coordinator.dispose();
        storageSession.dispose();
        activeDisposers.delete(environment.dispose);
        target.remove();
      })();
      return disposePromise;
    },
  };
  activeDisposers.add(environment.dispose);
  return environment;
}

export interface RenderAppOptions<
  TRouter extends AnyRouter = AnyRouter,
> extends MfeTestEnvironmentOptions<TRouter> {
  readonly definition: AppDefinition<TRouter>;
}

/** Mount an actual App definition through the neutral host runtime and React adapter. */
export async function renderApp<TRouter extends AnyRouter = AnyRouter>(
  options: RenderAppOptions<TRouter>,
) {
  const environment = createMfeTestEnvironment(options);
  await environment.ready;
  const queries = environment.getQueries();
  return {
    ...environment,
    ...queries,
    container: environment.target,
    baseElement: environment.target.ownerDocument.body,
    // App definitions own their mounted React tree. Rerender is retained as a
    // Testing Library-compatible operation for callers that rerender the same tree.
    rerender: () => undefined,
    unmount: environment.dispose,
  };
}

export interface RenderWidgetOptions {
  readonly definition: WidgetDefinition;
  readonly inputs?: Record<string, unknown>;
  readonly handlers?: Readonly<Record<string, unknown>>;
  readonly shellState?: ShellState;
  readonly localStorage?: Storage;
  readonly sessionStorage?: Storage;
  readonly storageCoordinator?: InternalStorageCoordinator;
  readonly storageGeneration?: string;
  readonly onError?: (error: unknown) => void;
}

/** Mount an actual Widget definition through the neutral widget runtime/adapter. */
export async function renderWidget(options: RenderWidgetOptions) {
  if (!options.definition.id.trim())
    throw new Error('renderWidget requires a non-empty definition ID.');
  const local = options.localStorage ?? new MemoryStorage();
  const session = options.sessionStorage ?? new MemoryStorage();
  const coordinatorOwned = options.storageCoordinator === undefined;
  const coordinator =
    options.storageCoordinator ??
    createInternalStorageCoordinator({
      local,
      session,
      generation: options.storageGeneration ?? 'widget-test-generation',
      knownDefinitionIds: [options.definition.id],
    });
  if (coordinatorOwned) coordinator.setKnownDefinitionIds([options.definition.id]);
  const storageSession = createShellSession({
    coordinator,
    createGeneration: (() => {
      let counter = 0;
      return () => `${options.storageGeneration ?? 'widget-test-generation'}:${++counter}`;
    })(),
    initial: options.shellState ?? initialShellState,
  });
  const shellState = storageSession.store;
  const controller = new AbortController();
  const services: MfeMountServices = {
    id: options.definition.id,
    kind: 'widget',
    storage: coordinator.forDefinition(options.definition.id),
    internalStorage: coordinator.forDefinitionInternal(options.definition.id),
    signal: controller.signal,
  };
  const runtime = createWidgetRuntime({
    registry: [
      {
        id: options.definition.id,
        kind: 'widget',
        contractMajor: MFE_CONTRACT_MAJOR,
        load: () => Promise.resolve(options.definition),
      },
    ],
    adapter: createReactWidgetAdapter({ shellState, services, session: storageSession }),
    reportError: (error) => options.onError?.(error),
  });
  const target = document.createElement('div');
  document.body.append(target);
  const mount = runtime.mountWidget({
    id: options.definition.id,
    target,
    inputs: options.inputs ?? {},
    ...(options.handlers === undefined ? {} : { handlers: options.handlers }),
  });
  await mount.start();
  let disposed = false;
  let current = shellState.getSnapshot();
  let disposePromise: Promise<void> | undefined;
  const result = {
    container: target,
    baseElement: target.ownerDocument.body,
    ...getQueriesForElement(target),
    storage: { local, session, coordinator },
    shellState,
    setShellState(patch: Partial<ShellState> | ShellState) {
      if (disposed) return;
      const next = mergeShellState(current, patch);
      storageSession.update(next);
      current = next;
    },
    update(inputs: Record<string, unknown>, handlers = {}) {
      if (!disposed) mount.update(inputs, handlers);
    },
    rerender(
      next: {
        readonly inputs?: Record<string, unknown>;
        readonly handlers?: Readonly<Record<string, unknown>>;
      } = {},
    ) {
      if (!disposed)
        mount.update(next.inputs ?? options.inputs ?? {}, next.handlers ?? options.handlers ?? {});
    },
    async dispose() {
      if (disposePromise !== undefined) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        controller.abort();
        await mount.handle.dispose();
        if (coordinatorOwned) coordinator.dispose();
        storageSession.dispose();
        // The callback is registered after result creation so cleanup remains idempotent.
        // eslint-disable-next-line @typescript-eslint/unbound-method -- retain the returned disposer identity.
        activeDisposers.delete(result.dispose);
        target.remove();
      })();
      return disposePromise;
    },
    unmount() {
      return this.dispose();
    },
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- retain the returned disposer identity.
  activeDisposers.add(result.dispose);
  return result;
}
