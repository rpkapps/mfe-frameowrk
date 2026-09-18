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
import { createCandidateMount } from './candidate-adapter';

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

function AuthorWrap({ children }: PropsWithChildren) {
  return <section data-testid="author-wrap">{children}</section>;
}

function makeRouter(options: AppRouterOptions) {
  const root = createRootRouteWithContext<AuthorContext>()({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: ContextView });
  return createRouter({
    routeTree: root.addChildren([index]),
    basepath: options.basePath,
    context: { ...options.context, authorService: 'kept author extension' },
    InnerWrap: AuthorWrap,
    defaultPendingMinMs: 0,
  });
}

const mounts: ReturnType<typeof createCandidateMount>[] = [];

function mountDefinition(definition: AppDefinition<AnyRouter>) {
  const reportError = vi.fn<(error: MfeError) => void>();
  const mount = createCandidateMount({
    definitions: new Map([[definition.id, definition]]),
    id: definition.id,
    basePath: '/tracer',
    target: document.body,
    reportError,
  });
  mounts.push(mount);
  return { ...mount, reportError };
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

describe('test-internal contract tracer; Gate 0 remains blocked', () => {
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
    expect(Object.keys(supplied ?? {}).sort()).toEqual(['basePath', 'context']);
    expect(supplied?.basePath).toBe('/tracer');
    expect(Object.keys(supplied?.context ?? {}).sort()).toEqual(['mfe', 'queryClient']);
    expect(supplied?.context.queryClient).toBe(mount.queryClient);
    expect(mount.getRouter()?.state.location.pathname).toBe('/');
    expect(mount.getRouter()?.buildLocation({ to: '/' }).href).toBe('/tracer/');
    expect(mount.getRootCount()).toBe(1);
    mount.queryClient.setQueryData(['owned'], 'cached');

    const disposal = mount.handle.dispose();
    expect(document.body.contains(mount.placement)).toBe(false);
    expect(supplied?.context.mfe.signal.aborted).toBe(true);
    expect(mount.getRouter()).toBeUndefined();
    expect(mount.handle.state.status).toBe('disposed');
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

  it('detects merged route replacement but records that the loader already observed it', async () => {
    const loader = vi.fn((theme: string) => theme);
    const definition = createApp({
      id: 'route-conflict',
      router(options) {
        const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
        const index = createRoute({
          getParentRoute: () => root,
          path: '/',
          beforeLoad: () => ({ mfe: { ...options.context.mfe, theme: 'dark' as const } }),
          loader: ({ context }) => loader(context.mfe.theme),
          component: ContextView,
        });
        return createRouter({
          routeTree: root.addChildren([index]),
          basepath: options.basePath,
          context: options.context,
        });
      },
    });
    const mount = mountDefinition(definition);
    await expect(mount.start()).rejects.toMatchObject({ code: 'app/invalid-router' });
    expect(mount.reportError.mock.calls[0]?.[0]).toHaveProperty(
      'message',
      expect.stringContaining('route / context.mfe'),
    );
    expect(loader).toHaveBeenCalledWith('dark');
    expect(mount.getRootCount()).toBe(0);
    expect(mount.getRouter()).toBeUndefined();
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

  it('detects later conflicts through InnerWrap but cannot settle the retired navigation', async () => {
    const definition = createApp({
      id: 'later-route-conflict',
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
          beforeLoad: () => ({ mfe: { ...options.context.mfe, theme: 'dark' as const } }),
          component: ContextView,
        });
        return createRouter({
          routeTree: root.addChildren([index, conflict]),
          basepath: options.basePath,
          context: { ...options.context, authorService: 'preserved' },
          defaultPendingMinMs: 0,
        });
      },
    });
    const mount = mountDefinition(definition);
    await act(async () => {
      await mount.start();
    });
    expect(mount.handle.state.status).toBe('mounted');

    let navigationCompleted = false;
    const navigationErrors: unknown[] = [];
    await act(async () => {
      mount
        .getRouter()
        ?.navigate({ to: '/conflict' })
        .then(
          () => {
            navigationCompleted = true;
          },
          (cause: unknown) => {
            navigationErrors.push(cause);
          },
        );
      await Promise.resolve();
    });
    await waitFor(() => expect(mount.handle.state.status).toBe('error'));
    expect(mount.reportError).toHaveBeenCalledOnce();
    expect(mount.reportError.mock.calls[0]?.[0]).toMatchObject({ code: 'app/invalid-router' });
    expect(mount.reportError.mock.calls[0]?.[0].message).toContain('route /conflict context.mfe');
    expect(mount.getRouter()).toBeUndefined();
    expect(mount.placement.childElementCount).toBe(0);
    expect(screen.queryByRole('heading')).toBeNull();
    await act(async () => {
      await mount.handle.dispose();
    });
    expect(navigationErrors).toHaveLength(0);
    // The rejected presentation never completes native navigation. This
    // characterization is a limitation of the candidate, not gate acceptance.
    expect(navigationCompleted).toBe(false);
  });
});
