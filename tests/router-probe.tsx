import { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  useRouteContext,
} from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/history';
import type { MfeRouterContext } from '@company/mfe-react';
import { createStorageCoordinator } from '@company/mfe-host';

// Characterization routers need the same concrete public storage shape as a
// mounted App. The fixture owns one explicit coordinator for its probe handles;
// production shells supply their shared coordinator at the host boundary.
const probeStorage = createStorageCoordinator({ generation: 'router-probe' });

export function createProbeContext(theme: 'light' | 'dark' = 'light'): MfeRouterContext {
  return {
    mfe: {
      user: { id: 'user-1', name: 'Test author' },
      groups: ['readers'],
      theme,
      signal: new AbortController().signal,
      storage: probeStorage.forDefinition('router-probe'),
    },
    queryClient: new QueryClient(),
  };
}

/** Characterizes the original history-free factory, with supplied history as its control. */
export function createProbeRouter(options: {
  context: MfeRouterContext;
  history?: RouterHistory;
  loader?: () => Promise<string>;
}) {
  const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
  const index = options.loader
    ? createRoute({
        getParentRoute: () => root,
        path: '/',
        loader: options.loader,
        component: Theme,
      })
    : createRoute({
        getParentRoute: () => root,
        path: '/',
        component: Theme,
      });
  return createRouter({
    routeTree: root.addChildren([index]),
    basepath: '/tracer',
    context: options.context,
    ...(options.history ? { history: options.history } : {}),
    defaultPendingMinMs: 0,
  });
}

/** Opaque references are compared for identity, never called without their owner. */
export function readHistoryMethods(): { readonly push: unknown; readonly replace: unknown } {
  return {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Identity probe; never invokes this captured method.
    push: window.history.pushState,
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Identity probe; never invokes this captured method.
    replace: window.history.replaceState,
  };
}

function Theme() {
  const theme = useRouteContext({
    from: '__root__',
    select: (context: MfeRouterContext) => context.mfe.theme,
  });
  return <span data-testid="theme">{theme}</span>;
}
