// @vitest-environment jsdom
import { createMemoryHistory } from '@tanstack/history';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  useRouteContext,
} from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import { act, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MfeError, MountState } from '@company/mfe-core';
import { createApp } from '@company/mfe-react';
import type { AppDefinition, AppRouterOptions, MfeRouterContext } from '@company/mfe-react';
import { createTracerMount } from './in-process-host';
import { readHistoryMethods } from '../router-probe';

interface AuthorContext extends MfeRouterContext {
  readonly authorService: string;
}

function ContextView() {
  const name = useRouteContext({
    from: '__root__',
    select: (context: AuthorContext) => context.mfe.user?.name,
  });
  const theme = useRouteContext({
    from: '__root__',
    select: (context: AuthorContext) => context.mfe.theme,
  });
  const authorService = useRouteContext({
    from: '__root__',
    select: (context: AuthorContext) => context.authorService,
  });
  const routeClient = useRouteContext({
    from: '__root__',
    select: (context: AuthorContext) => context.queryClient,
  });
  const componentClient = useQueryClient();
  return (
    <div>
      <h1>{name}</h1>
      <span data-testid="theme">{theme}</span>
      <span data-testid="author-service">{authorService}</span>
      <span data-testid="same-client">{String(routeClient === componentClient)}</span>
    </div>
  );
}

function BrokenFeature(): never {
  throw new Error('Expected feature render failure');
}

function NativeFallback() {
  return <h1>Native error fallback</h1>;
}

function AuthorWrap({ children }: PropsWithChildren) {
  return <section data-testid="author-wrap">{children}</section>;
}

function makeRouter(options: AppRouterOptions) {
  const root = createRootRouteWithContext<AuthorContext>()({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: ContextView });
  return createRouter({
    routeTree: root.addChildren([index]),
    basepath: options.basePath,
    history: options.history,
    context: { ...options.context, authorService: 'kept author extension' },
    InnerWrap: AuthorWrap,
    defaultPendingMinMs: 0,
  });
}

const mounts: ReturnType<typeof createTracerMount>[] = [];

function mountDefinition(definition: AppDefinition<AnyRouter>) {
  const reportError = vi.fn<(error: MfeError) => void>();
  const mount = createTracerMount({
    definitions: new Map([[definition.id, definition]]),
    id: definition.id,
    basePath: '/tracer',
    target: document.body,
    reportError,
  });
  mounts.push(mount);
  return Object.assign(mount, { reportError });
}

beforeEach(() => {
  // JSDOM supplies no layout or scrolling implementation; neither is asserted
  // by this in-process lifecycle fixture.
  vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
});

afterEach(async () => {
  await act(async () => {
    await Promise.all(mounts.splice(0).map((mount) => mount.handle.dispose()));
  });
  document.body.replaceChildren();
});

describe('Gate 0 adapter contract tracer', () => {
  it('isolates two mounts that share one generated-style route tree', async () => {
    const root = createRootRouteWithContext<AuthorContext>()({ component: Outlet });
    const index = createRoute({ getParentRoute: () => root, path: '/', component: ContextView });
    const sharedTree = root.addChildren([index]);
    const factory = vi.fn((options: AppRouterOptions) =>
      createRouter({
        routeTree: sharedTree,
        basepath: options.basePath,
        history: options.history,
        context: { ...options.context, authorService: 'shared-tree' },
        defaultPendingMinMs: 0,
      }),
    );
    const definition = createApp({ id: 'shared-tree', router: factory });
    const first = createTracerMount({
      definitions: new Map([[definition.id, definition]]),
      id: definition.id,
      basePath: '/first',
      target: document.body,
      reportError: vi.fn(),
    });
    const second = createTracerMount({
      definitions: new Map([[definition.id, definition]]),
      id: definition.id,
      basePath: '/second',
      target: document.body,
      reportError: vi.fn(),
    });
    mounts.push(first, second);
    await act(async () => Promise.all([first.start(), second.start()]));
    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.getRouter()).not.toBe(second.getRouter());
    expect(first.getRouter()?.options.history).not.toBe(second.getRouter()?.options.history);
    expect(first.getRouter()?.options.context).not.toBe(second.getRouter()?.options.context);
    expect(first.getRouter()?.state.location.pathname).toBe('/');
    expect(second.getRouter()?.state.location.pathname).toBe('/');
    await first.handle.dispose();
    expect(first.getRouter()).toBeUndefined();
    expect(second.getRouter()?.state.status).toBe('idle');
    expect(second.getRootCount()).toBe(1);
  });

  it('loads by stable id, renders native context, and disposes the actual React root', async () => {
    const factory = vi.fn(makeRouter);
    const definition = createApp({ id: 'tracer', version: '0.0.1', router: factory });
    const mount = mountDefinition(definition);
    const states: MountState['status'][] = [];
    mount.handle.subscribe(() => states.push(mount.handle.state.status));
    expect(factory).not.toHaveBeenCalled();
    expect(mount.handle.state).toEqual({ status: 'pending', attempt: 1 });

    await act(async () => {
      await mount.start();
    });

    expect(screen.getByRole('heading').textContent).toBe('Tracer author');
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('author-service').textContent).toBe('kept author extension');
    expect(screen.getByTestId('same-client').textContent).toBe('true');
    expect(screen.getByTestId('author-wrap')).toBeTruthy();
    expect(factory).toHaveBeenCalledTimes(1);
    const supplied = factory.mock.calls[0]?.[0];
    expect(supplied).toBeDefined();
    expect(Object.keys(supplied ?? {}).sort()).toEqual(['basePath', 'context', 'history']);
    expect(supplied?.basePath).toBe('/tracer');
    expect(Object.keys(supplied?.context ?? {}).sort()).toEqual(['mfe', 'queryClient']);
    expect(supplied?.context.queryClient).toBe(mount.queryClient);
    expect(mount.getRouter()?.state.location.pathname).toBe('/');
    expect(mount.getRouter()?.options.history).toBe(supplied?.history);
    expect(mount.getRouter()?.history).toBe(supplied?.history);
    expect(mount.getRouter()?.buildLocation({ to: '/' }).href).toBe('/tracer/');
    expect(mount.getRootCount()).toBe(1);
    mount.queryClient.setQueryData(['owned'], 'cached');

    const disposal = mount.handle.dispose();
    expect(document.body.contains(mount.placement)).toBe(false);
    expect(supplied?.context.mfe.signal.aborted).toBe(true);
    expect(mount.getRouter()).toBeUndefined();
    expect(mount.handle.state.status).toBe('disposed');
    expect(supplied?.history.subscribers.size).toBe(0);
    expect(mount.handle.dispose()).toBe(disposal);
    await act(async () => {
      await disposal;
    });

    expect(mount.getRootCount()).toBe(0);
    expect(mount.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(states).toEqual(['mounted', 'disposed']);
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it('reports an invalid boundary and explicitly retries in the same placement', async () => {
    let correctBoundary = false;
    const factory = vi.fn((options: AppRouterOptions) =>
      makeRouter({
        ...options,
        basePath: correctBoundary ? options.basePath : '/wrong',
      }),
    );
    const mount = mountDefinition(
      createApp({ id: 'retry-tracer', version: '2.0.0', router: factory }),
    );
    const placement = mount.placement;
    await expect(mount.start()).rejects.toMatchObject({
      code: 'app/invalid-base-path',
      id: 'retry-tracer',
      definitionVersion: '2.0.0',
    });
    expect(mount.handle.state.status).toBe('error');
    expect(mount.reportError).toHaveBeenCalledTimes(1);
    expect(mount.getRootCount()).toBe(0);
    expect(mount.getRouter()).toBeUndefined();
    correctBoundary = true;
    expect(factory).toHaveBeenCalledTimes(1);
    await mount.updateShellState({
      user: { id: 'fixture-user', name: 'Tracer author' },
      groups: ['readers'],
      theme: 'dark',
    });

    const retry = mount.handle.retry();
    expect(mount.handle.state).toEqual({ status: 'pending', attempt: 2 });
    await act(async () => {
      await retry;
    });
    expect(mount.handle.state.status).toBe('mounted');
    expect(mount.placement).toBe(placement);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[0]?.[0].context.mfe.signal).toBe(
      factory.mock.calls[1]?.[0].context.mfe.signal,
    );
    expect(screen.getByRole('heading').textContent).toBe('Tracer author');
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(factory.mock.calls[0]?.[0].history).not.toBe(factory.mock.calls[1]?.[0].history);
    expect(factory.mock.calls[0]?.[0].history.subscribers.size).toBe(0);
    expect(factory.mock.calls[0]?.[0].context.queryClient).toBe(
      factory.mock.calls[1]?.[0].context.queryClient,
    );
  });

  it.each(['mfe', 'queryClient'] as const)(
    'rejects a factory replacing reserved %s',
    async (key) => {
      const substituteClient = new QueryClient();
      const definition = createApp({
        id: `invalid-${key}`,
        router(options) {
          return makeRouter({
            ...options,
            context: {
              ...options.context,
              ...(key === 'mfe'
                ? { mfe: { ...options.context.mfe, theme: 'dark' as const } }
                : { queryClient: substituteClient }),
            },
          });
        },
      });
      const mount = mountDefinition(definition);
      await expect(mount.start()).rejects.toMatchObject({ code: 'app/invalid-router' });
      expect(mount.reportError.mock.calls[0]?.[0]).toHaveProperty(
        'message',
        expect.stringContaining(`context.${key}`),
      );
      expect(mount.getRootCount()).toBe(0);
      substituteClient.clear();
    },
  );

  it('rejects author history based on the explicit options, before rendering', async () => {
    const authorHistory = createMemoryHistory({ initialEntries: ['/tracer/'] });
    const definition = createApp({
      id: 'author-history',
      router(options) {
        const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
        return createRouter({
          routeTree: root,
          basepath: options.basePath,
          context: { ...options.context },
          history: authorHistory,
        });
      },
    });
    const mount = mountDefinition(definition);
    try {
      await expect(mount.start()).rejects.toMatchObject({ code: 'app/invalid-router' });
      expect(mount.reportError.mock.calls[0]?.[0]).toHaveProperty(
        'message',
        expect.stringContaining('router.options.history'),
      );
      expect(mount.getRootCount()).toBe(0);
    } finally {
      authorHistory.destroy();
    }
  });

  it('rejects omitted history and releases the invalid native default history', async () => {
    const originalHistory = readHistoryMethods();
    const definition = createApp({
      id: 'omitted-history',
      router(options) {
        const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
        return createRouter({
          routeTree: root,
          basepath: options.basePath,
          context: options.context,
        });
      },
    });
    const mount = mountDefinition(definition);
    await expect(mount.start()).rejects.toMatchObject({ code: 'app/invalid-router' });
    expect(mount.reportError.mock.calls[0]?.[0].message).toContain('router.options.history');
    expect(mount.getRootCount()).toBe(0);
    expect(readHistoryMethods()).toEqual(originalHistory);
  });

  it.each(['loader', 'render'] as const)(
    'preserves native error handling for an author %s failure',
    async (failure) => {
      // Native React/Router error boundaries log caught render errors in development.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const definition = createApp({
        id: `native-error-${failure}`,
        router(options) {
          const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
          const index = createRoute({
            getParentRoute: () => root,
            path: '/',
            loader: () => {
              if (failure === 'loader') throw new Error('Expected feature loader failure');
            },
            component: failure === 'render' ? BrokenFeature : ContextView,
            errorComponent: NativeFallback,
          });
          return createRouter({
            routeTree: root.addChildren([index]),
            basepath: options.basePath,
            history: options.history,
            context: options.context,
          });
        },
      });
      const mount = mountDefinition(definition);
      await act(async () => {
        await mount.start();
      });
      expect(screen.getByRole('heading').textContent).toBe('Native error fallback');
      expect(mount.handle.state.status).toBe('mounted');
      expect(mount.getRootCount()).toBe(1);
      expect(mount.reportError).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['mfe', 'beforeLoad'],
    ['queryClient', 'beforeLoad'],
    ['mfe', 'context'],
    ['queryClient', 'context'],
  ] as const)('diagnoses a route %s replacement from %s after loading', async (key, source) => {
    const loader = vi.fn<(value: unknown) => void>();
    const substituteClient = new QueryClient();
    const definition = createApp({
      id: `route-conflict-${key}-${source}`,
      router(options) {
        const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
        const replacement =
          key === 'mfe'
            ? { mfe: { ...options.context.mfe, theme: 'dark' as const } }
            : { queryClient: substituteClient };
        const index = createRoute({
          getParentRoute: () => root,
          path: '/',
          context: () => (source === 'context' ? replacement : {}),
          beforeLoad: async () => {
            await Promise.resolve();
            return source === 'beforeLoad' ? replacement : {};
          },
          loader: ({ context }) => loader(context[key]),
          component: ContextView,
        });
        return createRouter({
          routeTree: root.addChildren([index]),
          basepath: options.basePath,
          history: options.history,
          context: options.context,
        });
      },
    });
    const mount = mountDefinition(definition);
    await expect(mount.start()).rejects.toMatchObject({ code: 'app/invalid-router' });
    expect(mount.reportError.mock.calls[0]?.[0].message).toContain(`route / context.${key}`);
    // The integration diagnoses author conflicts; it is not a sandbox that
    // prevents invalid author callbacks from executing before the diagnostic.
    expect(loader).toHaveBeenCalledWith(
      key === 'mfe' ? expect.objectContaining({ theme: 'dark' }) : substituteClient,
    );
    expect(mount.getRootCount()).toBe(0);
    expect(mount.getRouter()).toBeUndefined();
    substituteClient.clear();
  });

  it('accepts exact reserved values and preserves native author route extensions', async () => {
    const authorService = Object.freeze({ name: 'author service' });
    const loader = vi.fn<(value: unknown) => void>();
    const definition = createApp({
      id: 'forwarded-route-context',
      router(options) {
        const root = createRootRouteWithContext<
          MfeRouterContext & { authorService: typeof authorService }
        >()({ component: Outlet });
        const index = createRoute({
          getParentRoute: () => root,
          path: '/',
          context: ({ context }) => ({ mfe: context.mfe, queryClient: context.queryClient }),
          beforeLoad: async ({ context }) => {
            await Promise.resolve();
            return {
              mfe: context.mfe,
              queryClient: context.queryClient,
              user: 'author route data',
            };
          },
          loader: ({ context }) => loader(context),
          component: () => <h1>Forwarded context</h1>,
        });
        return createRouter({
          routeTree: root.addChildren([index]),
          basepath: options.basePath,
          history: options.history,
          context: { ...options.context, authorService },
        });
      },
    });
    const mount = mountDefinition(definition);
    await act(async () => {
      await mount.start();
    });
    const router = mount.getRouter();
    const context = router?.options.context as MfeRouterContext | undefined;
    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({
        mfe: context?.mfe,
        queryClient: mount.queryClient,
        authorService,
        user: 'author route data',
      }),
    );
    expect(mount.handle.state.status).toBe('mounted');
    expect(mount.reportError).not.toHaveBeenCalled();
    expect(screen.getByRole('heading').textContent).toBe('Forwarded context');
  });

  it('fences a pending loader after disposal and never attaches its late result', async () => {
    let finishLoader: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finishLoader = resolve;
    });
    const loader = vi.fn(() => pending);
    const factory = vi.fn((options: AppRouterOptions) => {
      const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
      const index = createRoute({
        getParentRoute: () => root,
        path: '/',
        loader,
        component: ContextView,
      });
      return createRouter({
        routeTree: root.addChildren([index]),
        basepath: options.basePath,
        history: options.history,
        context: options.context,
      });
    });
    const mount = mountDefinition(createApp({ id: 'pending-tracer', router: factory }));
    const start = mount.start();
    await waitFor(() => expect(loader).toHaveBeenCalledOnce());
    expect(mount.handle.state.status).toBe('pending');
    expect(mount.getRouter()).toBeDefined();

    await mount.handle.dispose();
    expect(factory.mock.calls[0]?.[0].context.mfe.signal.aborted).toBe(true);
    expect(mount.getRouter()).toBeUndefined();
    finishLoader?.();
    await start;
    await act(async () => {
      await pending;
    });
    expect(mount.handle.state.status).toBe('disposed');
    expect(mount.getRootCount()).toBe(0);
    expect(document.body.childElementCount).toBe(0);
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it.each(['mfe', 'queryClient'] as const)(
    'settles native navigation and retires a later async %s conflict',
    async (key) => {
      const substituteClient = new QueryClient();
      const loader = vi.fn<(value: unknown) => void>();
      const definition = createApp({
        id: `later-route-conflict-${key}`,
        router(options) {
          const root = createRootRouteWithContext<AuthorContext>()({ component: Outlet });
          const index = createRoute({
            getParentRoute: () => root,
            path: '/',
            component: ContextView,
          });
          const conflict = createRoute({
            getParentRoute: () => root,
            path: '/conflict',
            beforeLoad: async () => {
              await Promise.resolve();
              return key === 'mfe'
                ? { mfe: { ...options.context.mfe, theme: 'dark' as const } }
                : { queryClient: substituteClient };
            },
            loader: ({ context }) => loader(context[key]),
            component: ContextView,
          });
          return createRouter({
            routeTree: root.addChildren([index, conflict]),
            basepath: options.basePath,
            history: options.history,
            context: { ...options.context, authorService: 'preserved' },
            defaultPendingMinMs: 0,
          });
        },
      });
      const mount = mountDefinition(definition);
      await act(async () => {
        await mount.start();
      });
      const router = mount.getRouter();
      expect(router).toBeDefined();
      let navigation: Promise<void> | undefined;
      let navigationCompleted = false;
      await act(async () => {
        navigation = router?.navigate({ to: '/conflict' }).then(() => {
          navigationCompleted = true;
        });
        await Promise.resolve();
      });
      await waitFor(() => expect(navigationCompleted).toBe(true));
      await navigation;
      await waitFor(() => expect(mount.handle.state.status).toBe('error'));
      expect(mount.reportError).toHaveBeenCalledOnce();
      expect(mount.reportError.mock.calls[0]?.[0]).toMatchObject({ code: 'app/invalid-router' });
      expect(mount.reportError.mock.calls[0]?.[0].message).toContain(
        `route /conflict context.${key}`,
      );
      expect(loader).toHaveBeenCalledWith(
        key === 'mfe' ? expect.objectContaining({ theme: 'dark' }) : substituteClient,
      );
      expect(mount.getRouter()).toBeUndefined();
      expect(mount.placement.childElementCount).toBe(0);
      expect(screen.queryByRole('heading')).toBeNull();
      await act(async () => {
        await mount.handle.dispose();
      });
      expect(mount.getRootCount()).toBe(0);
      substituteClient.clear();
    },
  );
});
