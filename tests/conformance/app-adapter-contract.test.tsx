import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  useRouteContext,
} from '@tanstack/react-router';
import { act, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, useGroups, useTheme, useUser } from '@company/mfe-react';
import type { AppRouterOptions, MfeRouterContext } from '@company/mfe-react';
import { readHistoryMethods } from '../router-probe';
import { createTracerMount } from '../tracer/in-process-host';

interface TracerContext extends MfeRouterContext {
  readonly authorService: {
    readonly fetch: () => Promise<string>;
    readonly commit: (consumer: string) => void;
  };
  readonly authorRouteLabel?: string;
}

function useCommit(consumer: string) {
  const commit = useRouteContext({
    from: '__root__',
    select: (context: TracerContext) => context.authorService.commit,
  });
  useEffect(() => {
    commit(consumer);
  });
}

function ThemeView() {
  const theme = useTheme();
  useCommit('theme');
  return <span data-testid="theme">{theme}</span>;
}

function UserView() {
  const user = useUser();
  useCommit('user');
  return <span data-testid="user">{user?.name}</span>;
}

function GroupsView() {
  const groups = useGroups();
  useCommit('groups');
  return <span data-testid="groups">{groups.join(',')}</span>;
}

function QueryView() {
  const service = useRouteContext({
    from: '__root__',
    select: (context: TracerContext) => context.authorService,
  });
  const routeClient = useRouteContext({
    from: '__root__',
    select: (context: TracerContext) => context.queryClient,
  });
  const providerClient = useQueryClient();
  const result = useQuery(
    queryOptions({
      queryKey: ['app-adapter-contract'],
      queryFn: service.fetch,
      staleTime: Infinity,
    }),
  );
  return (
    <span data-testid="query">
      {result.data}:{String(routeClient === providerClient)}
    </span>
  );
}

function Feature() {
  return (
    <>
      <ThemeView />
      <UserView />
      <GroupsView />
      <QueryView />
    </>
  );
}

const mounts: ReturnType<typeof createTracerMount>[] = [];

function setup() {
  const originalHistory = readHistoryMethods();
  const factoryHistory: ReturnType<typeof readHistoryMethods>[] = [];
  const commit = vi.fn<(consumer: string) => void>();
  const fetch = vi.fn(() => Promise.resolve('cached query data'));
  const authorService = Object.freeze({ fetch, commit });
  const beforeLoad = vi.fn<(context: TracerContext) => void>();
  const loader = vi.fn<(context: TracerContext) => void>();
  const factory = vi.fn((options: AppRouterOptions) => {
    const root = createRootRouteWithContext<TracerContext>()({
      component: Outlet,
      beforeLoad: ({ context }) => {
        beforeLoad(context);
        return {
          mfe: context.mfe,
          queryClient: context.queryClient,
          authorRouteLabel: 'retained native extension',
        };
      },
    });
    const routeOptions = {
      getParentRoute: () => root,
      component: Feature,
      loader: async ({ context }: { context: TracerContext }) => {
        loader(context);
        return context.queryClient.ensureQueryData(
          queryOptions({
            queryKey: ['app-adapter-contract'],
            queryFn: context.authorService.fetch,
            staleTime: Infinity,
          }),
        );
      },
    };
    const index = createRoute({ ...routeOptions, path: '/' });
    const next = createRoute({ ...routeOptions, path: '/next' });
    const router = createRouter({
      routeTree: root.addChildren([index, next]),
      basepath: options.basePath,
      history: options.history,
      context: { ...options.context, authorService },
      defaultPendingMinMs: 0,
    });
    factoryHistory.push(readHistoryMethods());
    return router;
  });
  const definition = createApp({ id: 'app-adapter-contract', router: factory });
  const reportError = vi.fn();
  const mount = createTracerMount({
    definitions: new Map([[definition.id, definition]]),
    id: definition.id,
    basePath: '/tracer',
    target: document.body,
    reportError,
  });
  mounts.push(mount);
  return {
    mount,
    factory,
    factoryHistory,
    originalHistory,
    authorService,
    beforeLoad,
    loader,
    fetch,
    commit,
    reportError,
  };
}

beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}));
afterEach(async () => {
  await act(async () => {
    await Promise.all(mounts.splice(0).map((mount) => mount.handle.dispose()));
  });
  document.body.replaceChildren();
});

// The approved revisions replace the original factory/history and live native
// match-context promises. These assertions exercise the actual React adapter;
// The in-process loader and memory boundary do not prove the browser navigation bridge.
describe('approved app-adapter contracts', () => {
  it('forwards owned history at construction and mounts without changing global History methods', async () => {
    const fixture = setup();
    const { mount, factory, originalHistory, factoryHistory } = fixture;
    await act(async () => {
      await mount.start();
    });
    const supplied = factory.mock.calls[0]?.[0];
    const router = mount.getRouter();
    expect(supplied?.history).toBeDefined();
    expect(router?.options.history).toBe(supplied?.history);
    expect(router?.history).toBe(supplied?.history);
    expect(factoryHistory).toEqual([originalHistory]);
    expect(readHistoryMethods()).toEqual(originalHistory);
    expect(screen.getByTestId('user').textContent).toBe('Tracer author');
    expect(mount.getRootCount()).toBe(1);
    if (!supplied) throw new Error('Factory was not invoked');
    const destroy = vi.spyOn(supplied.history, 'destroy');
    await act(async () => {
      await mount.handle.dispose();
    });
    expect(destroy).toHaveBeenCalledOnce();
    expect(supplied.history.subscribers.size).toBe(0);
    expect(readHistoryMethods()).toEqual(originalHistory);
    expect(mount.getRootCount()).toBe(0);
    expect(fixture.reportError).not.toHaveBeenCalled();
  });

  it('publishes live theme without unrelated work and supplies the current immutable snapshot on next navigation', async () => {
    const fixture = setup();
    const { mount, factory, beforeLoad, loader, fetch, commit, authorService } = fixture;
    await act(async () => {
      await mount.start();
    });
    await waitFor(() =>
      expect(screen.getByTestId('query').textContent).toBe('cached query data:true'),
    );
    const router = mount.getRouter();
    expect(router).toBeDefined();
    const routeTree: unknown = router?.routeTree;
    const client = mount.queryClient;
    const initial = factory.mock.calls[0]?.[0].context;
    expect(initial).toBeDefined();
    const initialBeforeLoad = beforeLoad.mock.calls.length;
    const initialLoaders = loader.mock.calls.length;
    const initialQueryWork = fetch.mock.calls.length;
    const commits = (consumer: string) =>
      commit.mock.calls.filter(([name]) => name === consumer).length;
    const initialUserCommits = commits('user');
    const initialGroupsCommits = commits('groups');
    const initialThemeCommits = commits('theme');
    const shellState = {
      user: { id: 'fixture-user', name: 'Tracer author' },
      groups: ['readers'],
      theme: 'dark' as const,
    };

    await act(async () => {
      await mount.updateShellState(shellState);
    });

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(commits('theme')).toBe(initialThemeCommits + 1);
    expect(commits('user')).toBe(initialUserCommits);
    expect(commits('groups')).toBe(initialGroupsCommits);
    expect(beforeLoad).toHaveBeenCalledTimes(initialBeforeLoad);
    expect(loader).toHaveBeenCalledTimes(initialLoaders);
    expect(fetch).toHaveBeenCalledTimes(initialQueryWork);
    expect(factory).toHaveBeenCalledOnce();
    expect(mount.getRouter()).toBe(router);
    expect(router?.routeTree).toBe(routeTree);
    expect(mount.queryClient).toBe(client);
    expect(client.getQueryData(['app-adapter-contract'])).toBe('cached query data');
    const current = router?.options.context as TracerContext;
    expect(current.authorService).toBe(authorService);
    expect(current.queryClient).toBe(client);
    expect(current.mfe.signal).toBe(initial?.mfe.signal);
    expect(current.mfe.user).toBe(initial?.mfe.user);
    expect(current.mfe.groups).toBe(initial?.mfe.groups);
    expect(current.mfe.theme).toBe('dark');
    expect(initial?.mfe.theme).toBe('light');
    expect(Object.isFrozen(initial?.mfe)).toBe(true);
    expect(Object.isFrozen(current.mfe)).toBe(true);
    expect(Object.isFrozen(current.mfe.user)).toBe(true);
    expect(Object.isFrozen(current.mfe.groups)).toBe(true);

    const afterUpdateCommits = commit.mock.calls.length;
    await act(async () => {
      await mount.updateShellState(shellState);
    });
    expect(commit).toHaveBeenCalledTimes(afterUpdateCommits);
    expect(router?.options.context).toBe(current);
    expect(beforeLoad).toHaveBeenCalledTimes(initialBeforeLoad);
    expect(loader).toHaveBeenCalledTimes(initialLoaders);

    let navigation: Promise<void> | undefined;
    let settled = false;
    await act(async () => {
      navigation = router?.navigate({ to: '/next' }).then(() => {
        settled = true;
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(settled).toBe(true));
    await navigation;
    expect(beforeLoad.mock.lastCall?.[0].mfe).toBe(current.mfe);
    expect(loader.mock.lastCall?.[0].mfe).toBe(current.mfe);
    expect(loader.mock.lastCall?.[0].authorService).toBe(authorService);
    expect(loader.mock.lastCall?.[0].authorRouteLabel).toBe('retained native extension');
    expect(loader.mock.lastCall?.[0].queryClient).toBe(client);
    expect(fetch).toHaveBeenCalledTimes(initialQueryWork);
    expect(initial?.mfe.theme).toBe('light');
    expect(mount.handle.state.status).toBe('mounted');
    expect(fixture.reportError).not.toHaveBeenCalled();

    await act(async () => {
      await mount.handle.dispose();
    });
    const finalWork = [
      beforeLoad.mock.calls.length,
      loader.mock.calls.length,
      fetch.mock.calls.length,
      commit.mock.calls.length,
    ];
    await mount.updateShellState({ ...shellState, theme: 'light' });
    expect([
      beforeLoad.mock.calls.length,
      loader.mock.calls.length,
      fetch.mock.calls.length,
      commit.mock.calls.length,
    ]).toEqual(finalWork);
    expect(mount.handle.state.status).toBe('disposed');
    expect(mount.getRouter()).toBeUndefined();
    expect(mount.getRootCount()).toBe(0);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
