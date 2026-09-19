import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import type { MfeRouterContext } from './router-context';
import { mfeRoute } from './mfe-route';
import { MFE_APP_BASE_PATH, MFE_HOST_CONTEXT } from '@company/mfe-react/internal/host-context';

describe('mfeRoute', () => {
  it('binds the exact splat boundary, including encoded path data', () => {
    const route = mfeRoute({ appId: 'reports' });
    const context = route.beforeLoad({
      location: { pathname: '/workspace/reports/accounts%2F42' },
      params: { _splat: 'accounts/42' },
    });
    const binding = (context as Record<PropertyKey, unknown>)[
      Object.getOwnPropertySymbols(context)[0]!
    ] as { basePath: string };
    expect(binding.basePath).toBe('/workspace/reports');
  });

  it('composes empty splats and similar prefixes at the shell boundary', () => {
    const route = mfeRoute({ appId: 'reports' });
    const empty = route.beforeLoad({
      location: { pathname: '/reports/' },
      params: { _splat: '' },
      context: { [MFE_APP_BASE_PATH]: '/workspace' },
    });
    const similar = route.beforeLoad({
      location: { pathname: '/workspaceX/reports/item' },
      params: { _splat: 'item' },
      context: { [MFE_APP_BASE_PATH]: '/workspace' },
    });
    const bindingOf = (value: object) =>
      (value as Record<PropertyKey, unknown>)[Object.getOwnPropertySymbols(value)[0]!] as {
        basePath: string;
      };
    expect(bindingOf(empty).basePath).toBe('/workspace/reports');
    expect(bindingOf(similar).basePath).toBe('/workspace/workspaceX/reports');
  });

  it('preloads through the private bounded host bridge without mounting React', async () => {
    const preloadApp = vi.fn(() => Promise.resolve({ kind: 'app', id: 'reports' }));
    const route = mfeRoute({ appId: 'reports' });
    const controller = new AbortController();
    await route.loader({
      context: { [MFE_HOST_CONTEXT]: { preloadApp } },
      abortController: controller,
    });
    expect(preloadApp).toHaveBeenCalledWith({ id: 'reports', signal: controller.signal });
  });

  it('runs the native route preload without activating the child component', async () => {
    const preloadApp = vi.fn(() => Promise.resolve({ kind: 'app', id: 'reports' }));
    const root = createRootRouteWithContext<MfeRouterContext>()({ component: () => null });
    const routeAdapter = mfeRoute({ appId: 'reports' });
    const child = createRoute({
      getParentRoute: () => root,
      path: '/reports/$',
      beforeLoad: routeAdapter.beforeLoad,
      component: routeAdapter.component,
      pendingComponent: routeAdapter.pendingComponent,
      errorComponent: routeAdapter.errorComponent,
      loader: routeAdapter.loader,
    });
    const context = {
      mfe: {
        user: null,
        groups: [],
        theme: 'light' as const,
        signal: new AbortController().signal,
        storage: {} as never,
      },
      queryClient: new QueryClient(),
      [MFE_HOST_CONTEXT]: { preloadApp },
    } as MfeRouterContext;
    const router = createRouter({
      routeTree: root.addChildren([child]),
      basepath: '/',
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context,
    });
    await router.preloadRoute({ to: '/reports/foo' } as never);
    expect(preloadApp).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe('/');
  });
});
