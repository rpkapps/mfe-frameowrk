import type { RouterHistory } from '@tanstack/history';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import { Component } from 'react';
import type { PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MFE_CONTRACT_MAJOR } from '@company/mfe-core';
import type { MfeError, ShellState } from '@company/mfe-core';
import { createAppRuntime, untilAttemptRetires } from '@company/mfe-host';
import type { AppAdapterOptions, AppDriver, MountAttempt } from '@company/mfe-host';
import type { InternalStorageCoordinator } from '@company/mfe-host/internal';
import type { AppDefinition } from './index';
import type { MfeRouterContext } from './router-context';
import { createContextValidator, invalidRouter } from './reserved-context';
import { createNavigationHistory } from './navigation-history';
import { ShellStateProvider } from '@company/mfe-react/internal/shell-state-context';
import { MountServicesProvider } from '@company/mfe-react/internal/mount-services-context';
import type { MfeMountServices } from '@company/mfe-react/internal/mount-services-context';
import { MfeHostProvider } from '@company/mfe-react/internal/host-context';
import { MFE_HOST_CONTEXT } from '@company/mfe-react/internal/host-context';
import { MFE_APP_BASE_PATH } from '@company/mfe-react/internal/host-context';
import type { MfeHostEnvironment } from '@company/mfe-react/internal/host-context';
import { retireQueryClientNow } from './query-session';

class MountErrorBoundary extends Component<
  PropsWithChildren<{ readonly onError: (cause: unknown) => void }>,
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface AppMountOptions {
  readonly definition: AppDefinition<AnyRouter>;
  readonly basePath: string;
  readonly target: HTMLElement;
  readonly shellState: ShellState;
  /** The bridge supplies a fresh owned history for every mount attempt. */
  readonly createHistory: () => RouterHistory;
  readonly reportError: (error: MfeError) => void;
  /** Test-owned coordinator; production mounts receive one from the shell runtime. */
  readonly storage: InternalStorageCoordinator;
}

/** React resources only; the host owns lifecycle, placement and shell state. */
export function createReactDriver(
  options: AppAdapterOptions,
  createHistory?: () => RouterHistory,
  queryClient = new QueryClient(),
  environment?: MfeHostEnvironment,
) {
  const candidate = options.definition;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('router' in candidate) ||
    typeof candidate.router !== 'function'
  ) {
    throw new Error(`React App ${options.id} must provide a router factory.`);
  }
  // The host validates common descriptor fields before selecting this adapter.
  const definition = candidate as AppDefinition<AnyRouter>;
  const storage = options.storage;
  const publicStorage = options.publicStorage;
  if (storage === undefined || publicStorage === undefined)
    throw new Error(`React App ${options.id} requires host storage services.`);
  const { placement, shellState } = options;
  let activeRouter: AnyRouter | undefined;
  let activeAttemptSignal: AbortSignal | undefined;
  let failActiveAttempt: ((cause: unknown) => void) | undefined;
  let content: HTMLDivElement | undefined;
  let rootCount = 0;
  let sessionGeneration = 0;
  let disposed = false;
  let unregisterQueryRetirer: (() => void) | undefined;

  const driver = {
    detach() {
      disposed = true;
      sessionGeneration++;
    },
    async dispose() {
      unregisterQueryRetirer?.();
      unregisterQueryRetirer = undefined;
      await queryClient.cancelQueries();
      queryClient.clear();
    },
    async mount(attempt: MountAttempt) {
      const history = createHistory
        ? createHistory()
        : createNavigationHistory(requireNavigation());
      // This history belongs exclusively to this attempt. Native memory-history
      // destroy does not remove subscribers, and root cleanup happens later.
      attempt.onDetach(() => {
        history.subscribers.clear();
        history.destroy();
      });
      attempt.onCleanup(async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
      });
      const routeHost = environment
        ? Object.freeze({
            preloadApp: (preload: { readonly id: string; readonly signal: AbortSignal }) =>
              environment.runtime.preloadApp(preload),
          })
        : undefined;
      const context = Object.freeze({
        ...(routeHost === undefined ? {} : { [MFE_HOST_CONTEXT]: routeHost }),
        [MFE_APP_BASE_PATH]: options.basePath,
        mfe: Object.freeze({
          ...shellState.getSnapshot(),
          signal: attempt.mountSignal,
          storage: publicStorage,
        }),
        queryClient,
      });
      const services: MfeMountServices = {
        id: options.id,
        kind: 'app',
        storage: publicStorage,
        internalStorage: storage,
        signal: attempt.mountSignal,
        basePath: options.basePath,
      };
      if (environment !== undefined && unregisterQueryRetirer === undefined) {
        unregisterQueryRetirer = environment.session.registerQueryRetirer(() => {
          void retireQueryClientNow(queryClient).catch((cause: unknown) => {
            failActiveAttempt?.(cause);
          });
        });
      }
      const routerContext = context as MfeRouterContext;
      const validator = createContextValidator(definition, routerContext);
      const router = definition.router({
        basePath: options.basePath,
        context: routerContext,
        history,
      });
      if (router.options.history !== history || router.history !== history) {
        if (router.options.history === undefined) {
          // Release a nonconforming factory's native default history before
          // rejection. This does not excuse its construction-time global patch.
          const defaultHistory = router.history as RouterHistory;
          defaultHistory.destroy();
        }
        throw invalidRouter(
          definition,
          'router.options.history',
          'missing or substituted framework history',
          'Forward the supplied history unchanged into createRouter({ history }).',
        );
      }
      if (router.options.basepath !== options.basePath) {
        throw invalidRouter(
          definition,
          'router.options.basepath',
          String(router.options.basepath),
          'Pass basePath unchanged as createRouter({ basepath: basePath }).',
          'app/invalid-base-path',
        );
      }
      validator.validate(router.options.context, 'router factory context');
      attempt.onCleanup(() => router.clearCache());
      activeRouter = router;
      activeAttemptSignal = attempt.signal;
      failActiveAttempt = attempt.fail;
      attempt.onDetach(() => {
        activeRouter = undefined;
        activeAttemptSignal = undefined;
        failActiveAttempt = undefined;
        sessionGeneration++;
      });
      attempt.onDetach(
        shellState.subscribe(() => {
          const next = Object.freeze({
            ...(routeHost === undefined ? {} : { [MFE_HOST_CONTEXT]: routeHost }),
            [MFE_APP_BASE_PATH]: options.basePath,
            mfe: Object.freeze({
              ...shellState.getSnapshot(),
              signal: attempt.mountSignal,
              storage: publicStorage,
            }),
            queryClient,
          });
          validator.register(next);
          validator.validate(router.options.context, 'router context update');
          // AnyRouter erases the author's extension type. Validation above
          // establishes an object; its arbitrary top-level keys stay intact.
          const authorContext = router.options.context as object;
          router.update({ context: { ...authorContext, ...next } });
        }),
      );

      let conflict: unknown;
      let retirementScheduled = false;
      const inspectContext = () => {
        if (conflict !== undefined || !attempt.isCurrent()) return;
        try {
          validator.validateMatches(router);
        } catch (cause) {
          conflict = cause;
        }
      };
      const retireConflictingMount = () => {
        if (conflict === undefined || retirementScheduled) return;
        retirementScheduled = true;
        // Let native presentation acknowledge and settle navigation first.
        // Guarding InnerWrap would prevent that acknowledgement indefinitely.
        queueMicrotask(() => {
          retirementScheduled = false;
          if (router.state.status === 'idle' && !router.state.isLoading) attempt.fail(conflict);
        });
      };
      attempt.onDetach(router.subscribe('onLoad', inspectContext));
      attempt.onDetach(router.subscribe('onResolved', retireConflictingMount));
      attempt.onDetach(router.subscribe('onRendered', retireConflictingMount));

      await router.load();
      if (!attempt.isCurrent()) return;
      validator.validateMatches(router);
      attempt.commit(() => {
        const element = document.createElement('div');
        Object.assign(element.style, { width: '100%', height: '100%', minHeight: '0' });
        content = element;
        placement.append(element);
        attempt.onDetach(() => {
          content = undefined;
          element.remove();
        });
        const root = createRoot(element, {
          onUncaughtError: attempt.fail,
        });
        rootCount++;
        attempt.onCleanup(() => {
          root.unmount();
          rootCount--;
        });
        flushSync(() => {
          root.render(
            <MountErrorBoundary onError={attempt.fail}>
              <ShellStateProvider store={shellState}>
                <QueryClientProvider client={queryClient}>
                  <MountServicesProvider services={services}>
                    {environment ? (
                      <MfeHostProvider value={environment}>
                        <RouterProvider router={router} />
                      </MfeHostProvider>
                    ) : (
                      <RouterProvider router={router} />
                    )}
                  </MountServicesProvider>
                </QueryClientProvider>
              </ShellStateProvider>
            </MountErrorBoundary>,
          );
        });
      });
    },
  } satisfies AppDriver;

  function requireNavigation() {
    if (!options.createNavigation) throw new Error('React App requires a navigation boundary.');
    return options.createNavigation();
  }

  async function updateShellState(next: ShellState): Promise<void> {
    if (disposed) return;
    const previous = shellState.getSnapshot();
    const nextGroups = new Set(next.groups);
    const sessionChanged =
      previous.user?.id !== next.user?.id ||
      previous.groups.length !== nextGroups.size ||
      previous.groups.some((group) => !nextGroups.has(group));
    const router = activeRouter;
    const signal = activeAttemptSignal;
    if (!sessionChanged || !router || !signal) {
      try {
        shellState.update(next);
      } catch (cause) {
        failActiveAttempt?.(cause);
        throw cause;
      }
      return;
    }

    const generation = ++sessionGeneration;
    const element = content;
    // Keep component identity while retiring old-session data. Native rendering
    // still acknowledges navigation while the owned container is hidden.
    if (element) element.hidden = true;
    try {
      const cancellation =
        environment === undefined ? retireQueryClientNow(queryClient) : Promise.resolve();
      // Authorization transitions are synchronous. Query-only observers were
      // reset above; keyed consumers now commit their current session options.
      flushSync(() => shellState.update(next));
      queryClient.removeQueries({ predicate: (query) => query.getObserversCount() === 0 });
      const queryReset = queryClient.refetchQueries({ type: 'active' });
      const transition = Promise.all([
        cancellation,
        queryReset,
        router.invalidate({ sync: true, forcePending: true }),
      ]).then(
        () =>
          new Promise<void>((resolve) => {
            // Query batches observer notifications independently of Router.
            // In particular a disabled observer has no request to wait for.
            // Commit those queued updates before revealing the new session.
            notifyManager.schedule(() => {
              if (signal.aborted || generation !== sessionGeneration) resolve();
              else flushSync(resolve);
            });
          }),
      );
      await untilAttemptRetires(transition, signal);
    } catch (cause) {
      if (activeRouter === router) failActiveAttempt?.(cause);
      throw cause;
    } finally {
      if (generation === sessionGeneration && element && activeRouter === router)
        element.hidden = false;
    }
  }

  return {
    ...driver,
    placement,
    queryClient,
    updateShellState,
    /** Internal bridge/diagnostic access; not exported from the author facade. */
    getRouter: () => activeRouter,
    getRootCount: () => rootCount,
  };
}

/** Internal native-history harness; production and tests use the same host lifecycle. */
export function createAppMount(options: AppMountOptions) {
  const queryClient = new QueryClient();
  let driver: ReturnType<typeof createReactDriver> | undefined;
  const runtime = createAppRuntime({
    registry: [
      {
        id: options.definition.id,
        kind: 'app',
        contractMajor: MFE_CONTRACT_MAJOR,
        adapter: 'react',
        load: () => Promise.resolve(options.definition),
      },
    ],
    adapters: [
      {
        id: 'react',
        create(context) {
          driver = createReactDriver(context, options.createHistory, queryClient);
          return driver;
        },
      },
    ],
    reportError: options.reportError,
    storage: {
      coordinator: options.storage,
      createGeneration: (() => {
        let sequence = 0;
        return () => `test-generation:${++sequence}`;
      })(),
    },
  });
  const mount = runtime.mountApp({
    id: options.definition.id,
    basePath: options.basePath,
    target: options.target,
    shellState: options.shellState,
  });
  return {
    ...mount,
    queryClient,
    getRouter: () => driver?.getRouter(),
    getRootCount: () => driver?.getRootCount() ?? 0,
  };
}
