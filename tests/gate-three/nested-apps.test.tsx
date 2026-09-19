// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { createMemoryHistory } from '@tanstack/history';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDefinition, MfeRouterContext } from '@company/mfe-react';
import type { AnyRouter } from '@tanstack/react-router';
import type { AppRouterOptions } from '@company/mfe-react';
import { AppHost, createApp, mfeRoute } from '@company/mfe-react';
import { MfeHostProvider } from '@company/mfe-react/internal/host-context';
import { createReactAdapter } from '@company/mfe-react/internal';
import {
  createAppRuntime,
  createBrowserNavigation,
  createShellSession,
  createShellState,
  createWidgetRuntime,
} from '@company/mfe-host';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import type { AppRegistration, AppRuntime } from '@company/mfe-host';
import { MFE_HOST_CONTEXT } from '@company/mfe-react/internal/host-context';

beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function appContext() {
  const coordinator = createInternalStorageCoordinator({
    local: new StorageShim(),
    session: new StorageShim(),
    generation: 'nested-app-test',
  });
  const shellState = createShellState({ user: null, groups: [], theme: 'light' });
  return { coordinator, shellState };
}

class StorageShim implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

function childDefinition(loads: { count: number }, failFirst = false): AppDefinition<AnyRouter> {
  const root = createRootRouteWithContext<MfeRouterContext>()({
    component: () => (
      <>
        <div data-testid="child-root">child-root</div>
        <Outlet />
      </>
    ),
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: '/accounts/$accountId',
    validateSearch: (search: Record<string, unknown>) => ({
      tab: typeof search.tab === 'string' ? search.tab : 'summary',
    }),
    component: function Account() {
      const pathname = useRouterState({ select: (state) => state.location.pathname });
      return (
        <div data-testid="child-account">
          <span data-testid="child-path">{pathname}</span>
          <Link
            to="/accounts/$accountId"
            params={{ accountId: 'next' }}
            search={{ tab: 'activity' }}
          >
            Next account
          </Link>
        </div>
      );
    },
  });
  const routeTree = root.addChildren([account]);
  function createChildRouter(options: AppRouterOptions) {
    loads.count += 1;
    if (failFirst && loads.count === 1) throw new Error('child load failed');
    return createRouter({
      routeTree,
      basepath: options.basePath,
      history: options.history,
      context: options.context,
      defaultPendingMinMs: 0,
    });
  }
  return createApp({ id: 'child', version: '1.0.0', router: createChildRouter });
}

function parentDefinition() {
  const root = createRootRouteWithContext<MfeRouterContext>()({ component: () => <Outlet /> });
  const nestedRoute = mfeRoute({ appId: 'child' });
  const nested = createRoute({
    getParentRoute: () => root,
    path: '/reports/$',
    beforeLoad: nestedRoute.beforeLoad,
    component: nestedRoute.component,
    pendingComponent: nestedRoute.pendingComponent,
    errorComponent: nestedRoute.errorComponent,
    loader: nestedRoute.loader,
  });
  const routeTree = root.addChildren([nested]);
  function createParentRouter(options: AppRouterOptions) {
    return createRouter({
      routeTree,
      basepath: options.basePath,
      history: options.history,
      context: options.context,
      defaultPendingMinMs: 0,
    });
  }
  return createApp({ id: 'parent', version: '1.0.0', router: createParentRouter });
}

function harness(child: AppDefinition<AnyRouter>, parent = parentDefinition()) {
  const { coordinator, shellState } = appContext();
  const session = createShellSession({
    coordinator,
    createGeneration: () => 'nested-app-test-next',
    initial: shellState.getSnapshot(),
    store: shellState,
  });
  const registrations: AppRegistration[] = [
    {
      id: 'parent',
      kind: 'app',
      contractMajor: 1,
      adapter: 'react',
      load: () => Promise.resolve(parent),
    },
    {
      id: 'child',
      kind: 'app',
      contractMajor: 1,
      adapter: 'react',
      load: () => Promise.resolve(child),
    },
  ];
  // eslint-disable-next-line prefer-const -- Runtime/environment are mutually recursive by contract.
  let runtime!: AppRuntime;
  window.history.replaceState(null, '', '/workspace/reports/accounts/42?tab=summary');
  const navigation = createBrowserNavigation(window);
  const environment = {
    get runtime() {
      return runtime;
    },
    shellState,
    createNavigation: (basePath: string) => navigation.createBoundaryHistory(basePath),
    widgetRuntime: createWidgetRuntime({
      registry: [],
      adapter: { create: () => ({ mount: () => {} }) },
      reportError: () => {},
    }),
    session,
  };
  runtime = createAppRuntime({
    registry: registrations,
    adapters: [createReactAdapter(environment)],
    reportError: () => {},
    storage: { coordinator, session },
  });
  const view = render(
    <MfeHostProvider value={environment}>
      <Suspense fallback={<div>loading</div>}>
        <AppHost appId="parent" basePath="/workspace" />
      </Suspense>
    </MfeHostProvider>,
  );
  return { view, runtime, shellState, coordinator, navigation, session };
}

describe('native nested App routes', () => {
  it('preloads a child through the native route without activating an adapter', async () => {
    const loads = { count: 0 };
    const child = childDefinition(loads);
    const root = createRootRouteWithContext<MfeRouterContext>()({ component: () => null });
    const routeAdapter = mfeRoute({ appId: 'child' });
    const route = createRoute({
      getParentRoute: () => root,
      path: '/workspace/reports/$',
      beforeLoad: routeAdapter.beforeLoad,
      component: routeAdapter.component,
      pendingComponent: routeAdapter.pendingComponent,
      errorComponent: routeAdapter.errorComponent,
      loader: routeAdapter.loader,
    });
    const history = createMemoryHistory({ initialEntries: ['/'] });
    const { coordinator } = appContext();
    let adapterCreates = 0;
    let loadCalls = 0;
    const reportErrors: unknown[] = [];
    const runtime = createAppRuntime({
      registry: [
        {
          id: 'child',
          kind: 'app',
          contractMajor: 1,
          adapter: 'probe',
          load: () => {
            loadCalls += 1;
            return Promise.resolve(child);
          },
        },
      ],
      adapters: [
        {
          id: 'probe',
          create: () => {
            adapterCreates += 1;
            return { mount: () => {} };
          },
        },
      ],
      reportError: (error) => reportErrors.push(error),
      storage: { coordinator },
    });
    const preloadApp = (options: { id: string; signal: AbortSignal }) =>
      runtime.preloadApp(options);
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history,
      context: {
        mfe: {
          user: null,
          groups: [],
          theme: 'light',
          signal: new AbortController().signal,
          storage: coordinator.forDefinition('child'),
        },
        queryClient: new QueryClient(),
        [MFE_HOST_CONTEXT]: { preloadApp },
      } as MfeRouterContext,
    });
    await router.preloadRoute({ to: '/workspace/reports/$', params: { _splat: 'accounts/42' } });
    expect(router.state.location.pathname).toBe('/');
    expect(loads.count).toBe(0);
    expect(adapterCreates).toBe(0);
    expect(loadCalls).toBe(1);
    expect(reportErrors).toEqual([]);
    coordinator.dispose();
  });

  it('keeps the child router and root state across native param/search navigation', async () => {
    const loads = { count: 0 };
    const child = childDefinition(loads);
    const { view, coordinator, navigation, session } = harness(child);
    await waitFor(() => expect(screen.getByTestId('child-root')).toBeTruthy());
    const root = screen.getByTestId('child-root');
    fireEvent.click(screen.getByRole('link', { name: 'Next account' }));
    await waitFor(() =>
      expect(screen.getByTestId('child-path').textContent).toContain('/accounts/next'),
    );
    expect(screen.getByTestId('child-root')).toBe(root);
    session.update({ user: null, groups: [], theme: 'dark' });
    await waitFor(() => expect(screen.getByTestId('child-root')).toBeTruthy());
    expect(screen.getByTestId('child-root')).toBe(root);
    view.unmount();
    navigation.dispose();
    coordinator.dispose();
  });

  it('renders native retry after a failed child load and mounts a fresh attempt', async () => {
    const loads = { count: 0 };
    const child = childDefinition(loads, true);
    const { view, coordinator, navigation } = harness(child);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('child-root')).toBeTruthy());
    expect(loads.count).toBeGreaterThanOrEqual(2);
    view.unmount();
    navigation.dispose();
    coordinator.dispose();
  });
});
