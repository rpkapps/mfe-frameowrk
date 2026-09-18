// @vitest-environment jsdom
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  useRouteContext,
  useRouterState,
} from '@tanstack/react-router';
import type { RouteComponent } from '@tanstack/react-router';
import { act, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MfeError } from '@company/mfe-core';
import { createApp, useGroups, useTheme, useUser } from '@company/mfe-react';
import type { AppRouterOptions, MfeRouterContext } from '@company/mfe-react';
import { createTracerMount } from './in-process-host';

type ShellState = Pick<MfeRouterContext['mfe'], 'user' | 'groups' | 'theme'>;

interface FixtureContext extends MfeRouterContext {
  readonly onMount: () => void;
  readonly onUnmount: () => void;
}

function SessionView() {
  const user = useUser();
  const groups = useGroups();
  const theme = useTheme();
  const context: FixtureContext = useRouteContext({ from: '__root__' });
  const client = useQueryClient();
  const loaderData = useRouterState({
    select: (state) => state.matches.at(-1)?.loaderData as string | undefined,
  });
  const { onMount, onUnmount } = context;
  useEffect(() => {
    onMount();
    return onUnmount;
  }, [onMount, onUnmount]);
  return (
    <section>
      <h1>{user?.id ?? 'anonymous'}</h1>
      <span data-testid="groups">{groups.join(',')}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="loader-data">{loaderData}</span>
      <span data-testid="same-client">{String(client === context.queryClient)}</span>
    </section>
  );
}

const queryOnlyRequest = vi.fn<() => Promise<string>>();
const disabledQueryRequest = vi.fn<() => Promise<string>>();
const keyedQueryRequest = vi.fn<(id: string) => Promise<string>>();

function QueryOnlyView() {
  // Deliberately no shell-state or route-context subscription and no route loader.
  const query = useQuery({
    queryKey: ['permission-dependent-view'],
    queryFn: queryOnlyRequest,
    staleTime: Infinity,
  });
  return <h1>{query.data ?? 'Loading current permissions'}</h1>;
}

function DisabledQueryView() {
  const query = useQuery({
    queryKey: ['disabled-permission-view'],
    queryFn: disabledQueryRequest,
    enabled: false,
    staleTime: Infinity,
  });
  return <h1>{query.data ?? 'No current permission result'}</h1>;
}

function UserKeyedQueryView() {
  const id = useUser((user) => user?.id ?? 'anonymous');
  const query = useQuery({
    queryKey: ['profile', id],
    queryFn: () => keyedQueryRequest(id),
    staleTime: Infinity,
  });
  return <h1>{query.data ?? `Loading ${id}`}</h1>;
}

function deferred() {
  let resolve: (value: string) => void = () => {};
  const promise = new Promise<string>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function shellState(id: string, groups = ['readers']): ShellState {
  return { user: { id, name: id }, groups, theme: 'light' };
}

const mounts: ReturnType<typeof createTracerMount>[] = [];

function createQueryFixture(component: RouteComponent) {
  const reportError = vi.fn<(error: MfeError) => void>();
  const definition = createApp({
    id: 'query-session',
    router(options) {
      const root = createRootRouteWithContext<MfeRouterContext>()({ component: Outlet });
      const index = createRoute({ getParentRoute: () => root, path: '/', component });
      return createRouter({
        routeTree: root.addChildren([index]),
        basepath: options.basePath,
        history: options.history,
        context: options.context,
        defaultPendingMinMs: 0,
      });
    },
  });
  const mount = createTracerMount({
    definitions: new Map([[definition.id, definition]]),
    id: definition.id,
    basePath: '/session',
    target: document.body,
    shellState: shellState('first'),
    reportError,
  });
  mounts.push(mount);
  return Object.assign(mount, { reportError });
}

function createFixture(
  load: (state: ShellState) => string | Promise<string> = (state) => state.user?.id ?? 'anonymous',
  beforeRootLoad?: (state: ShellState) => void | Promise<void>,
) {
  const onMount = vi.fn();
  const onUnmount = vi.fn();
  const beforeLoad = vi.fn<(state: ShellState) => void>();
  const loader = vi.fn(load);
  const reportError = vi.fn<(error: MfeError) => void>();
  const factory = vi.fn((options: AppRouterOptions) => {
    const root = createRootRouteWithContext<FixtureContext>()({
      component: Outlet,
      beforeLoad: ({ context }) => beforeRootLoad?.(context.mfe),
    });
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      beforeLoad: ({ context }) => beforeLoad(context.mfe),
      loader: ({ context }) => loader(context.mfe),
      component: SessionView,
    });
    return createRouter({
      routeTree: root.addChildren([index]),
      basepath: options.basePath,
      history: options.history,
      context: { ...options.context, onMount, onUnmount },
      defaultPendingMinMs: 0,
    });
  });
  const definition = createApp({ id: 'session-transition', router: factory });
  const mount = createTracerMount({
    definitions: new Map([[definition.id, definition]]),
    id: definition.id,
    basePath: '/session',
    target: document.body,
    shellState: shellState('first'),
    reportError,
  });
  mounts.push(mount);
  return Object.assign(mount, { beforeLoad, loader, factory, reportError, onMount, onUnmount });
}

async function startTransition(
  mount: ReturnType<typeof createTracerMount>,
  next: ShellState,
  onSettled?: () => void,
) {
  let transition: Promise<void> | undefined;
  let settled = false;
  await act(async () => {
    transition = mount.updateShellState(next).then(() => {
      onSettled?.();
      settled = true;
    });
    await Promise.resolve();
  });
  // Returning an object avoids awaiting native acknowledgement inside act.
  return { transition, isSettled: () => settled };
}

beforeEach(() => {
  // These tests exercise ownership and mocked requests, not browser layout or auth.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => {
    await Promise.all(mounts.splice(0).map((mount) => mount.handle.dispose()));
  });
  document.body.replaceChildren();
});

describe('mount-owned session transitions', () => {
  it('refreshes a Query-only view on changed permissions without exposing the previous result', async () => {
    const currentRequest = deferred();
    let externalSession = 'readers';
    queryOnlyRequest
      .mockReset()
      .mockImplementation(() =>
        externalSession === 'readers'
          ? Promise.resolve('Previous permissions')
          : currentRequest.promise,
      );
    const mount = createQueryFixture(QueryOnlyView);
    await act(async () => {
      await mount.start();
    });
    const heading = await screen.findByRole('heading', { name: 'Previous permissions' });
    const router = mount.getRouter();
    const client = mount.queryClient;
    const content = mount.placement.firstElementChild as HTMLDivElement;
    expect(queryOnlyRequest).toHaveBeenCalledOnce();

    // Same user and query key; permission-sensitive server results have changed.
    externalSession = 'editors';
    const transition = await startTransition(mount, shellState('first', ['editors']));
    await waitFor(() => expect(queryOnlyRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('heading', { name: 'Previous permissions' })).toBeNull();
    expect(client.getQueryData(['permission-dependent-view'])).toBeUndefined();
    expect(mount.getRouter()).toBe(router);
    expect(mount.queryClient).toBe(client);
    expect(mount.placement.firstElementChild).toBe(content);
    // Pending UI may be shown or the owned container may stay hidden; neither
    // permits the old result to become visible after the transition completes.
    if (transition.isSettled()) expect(heading.textContent).not.toBe('Previous permissions');

    await act(async () => {
      currentRequest.resolve('Current permissions');
      await currentRequest.promise;
    });
    await waitFor(() => expect(transition.isSettled()).toBe(true));
    await transition.transition;
    expect(await screen.findByRole('heading', { name: 'Current permissions' })).toBe(heading);
    expect(content.hidden).toBe(false);
    expect(client.getQueryData(['permission-dependent-view'])).toBe('Current permissions');
    expect(queryOnlyRequest).toHaveBeenCalledTimes(2);
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it('clears a disabled observed Query without fetching or replacing its observer', async () => {
    disabledQueryRequest.mockReset().mockResolvedValue('Should remain disabled');
    const mount = createQueryFixture(DisabledQueryView);
    const client = mount.queryClient;
    client.setQueryData(['disabled-permission-view'], 'Previous disabled result');
    await act(async () => {
      await mount.start();
    });
    const heading = screen.getByRole('heading', { name: 'Previous disabled result' });
    const query = client
      .getQueryCache()
      .find({ queryKey: ['disabled-permission-view'], exact: true });
    const observer = query?.observers[0];
    expect(observer).toBeDefined();
    expect(query?.getObserversCount()).toBe(1);

    let textAtCompletion: string | null | undefined;
    const transition = await startTransition(mount, shellState('first', ['editors']), () => {
      textAtCompletion = heading.textContent;
    });
    await waitFor(() => expect(transition.isSettled()).toBe(true));
    await transition.transition;
    expect(textAtCompletion).toBe('No current permission result');
    expect(await screen.findByRole('heading', { name: 'No current permission result' })).toBe(
      heading,
    );
    expect(client.getQueryData(['disabled-permission-view'])).toBeUndefined();
    expect(
      client.getQueryCache().find({ queryKey: ['disabled-permission-view'], exact: true }),
    ).toBe(query);
    expect(query?.observers[0]).toBe(observer);
    expect(query?.getObserversCount()).toBe(1);
    expect(disabledQueryRequest).not.toHaveBeenCalled();
    expect(mount.queryClient).toBe(client);
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it('commits the new user query key before any request uses the changed external session', async () => {
    const currentRequest = deferred();
    const requests: { readonly requestedId: string; readonly externalSession: string }[] = [];
    let externalSession = 'first';
    keyedQueryRequest.mockReset().mockImplementation((requestedId) => {
      requests.push({ requestedId, externalSession });
      return externalSession === 'first'
        ? Promise.resolve('First profile')
        : currentRequest.promise;
    });
    const mount = createQueryFixture(UserKeyedQueryView);
    await act(async () => {
      await mount.start();
    });
    const heading = await screen.findByRole('heading', { name: 'First profile' });
    const client = mount.queryClient;
    const observer = client.getQueryCache().find({ queryKey: ['profile', 'first'], exact: true })
      ?.observers[0];
    expect(observer).toBeDefined();

    externalSession = 'second';
    const transition = await startTransition(mount, shellState('second'));
    await waitFor(() => expect(keyedQueryRequest).toHaveBeenCalledTimes(2));
    expect(requests).toEqual([
      { requestedId: 'first', externalSession: 'first' },
      { requestedId: 'second', externalSession: 'second' },
    ]);
    expect(
      client.getQueryCache().find({ queryKey: ['profile', 'first'], exact: true }),
    ).toBeUndefined();
    expect(
      client.getQueryCache().find({ queryKey: ['profile', 'second'], exact: true })?.observers[0],
    ).toBe(observer);
    expect(screen.queryByRole('heading', { name: 'First profile' })).toBeNull();

    await act(async () => {
      currentRequest.resolve('Second profile');
      await currentRequest.promise;
    });
    await waitFor(() => expect(transition.isSettled()).toBe(true));
    await transition.transition;
    expect(await screen.findByRole('heading', { name: 'Second profile' })).toBe(heading);
    expect(mount.queryClient).toBe(client);
    expect(keyedQueryRequest).toHaveBeenCalledTimes(2);
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it.each([
    ['user identity', shellState('second')],
    ['group membership', shellState('first', ['editors'])],
  ] as const)('retires cached work and reruns route callbacks on %s changes', async (_, next) => {
    const mount = createFixture();
    await act(async () => {
      await mount.start();
    });
    const router = mount.getRouter();
    const client = mount.queryClient;
    const heading = screen.getByRole('heading');
    const originalSnapshot = mount.loader.mock.calls[0]?.[0];
    const lateRequest = deferred();
    let requestSignal: AbortSignal | undefined;
    client.setQueryData(['previous-session'], 'private fixture data');
    const request = client.fetchQuery({
      queryKey: ['shared-key'],
      queryFn: ({ signal }) => {
        requestSignal = signal;
        // Deliberately ignore cancellation to test late-result retirement.
        return lateRequest.promise;
      },
    });
    const requestOutcome = request.catch((cause: unknown) => cause);
    expect(requestSignal?.aborted).toBe(false);

    const transition = await startTransition(mount, next);
    await waitFor(() => expect(transition.isSettled()).toBe(true));
    await transition.transition;

    expect(requestSignal?.aborted).toBe(true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(mount.beforeLoad).toHaveBeenCalledTimes(2);
    expect(mount.loader).toHaveBeenCalledTimes(2);
    expect(mount.beforeLoad.mock.calls[1]?.[0]).toMatchObject(next);
    expect(mount.loader.mock.calls[1]?.[0]).toMatchObject(next);
    expect(originalSnapshot).toMatchObject(shellState('first'));
    expect(mount.getRouter()).toBe(router);
    expect(mount.queryClient).toBe(client);
    expect(screen.getByRole('heading')).toBe(heading);
    expect(screen.getByRole('heading').textContent).toBe(next.user?.id);
    expect(screen.getByTestId('groups').textContent).toBe(next.groups.join(','));
    expect(screen.getByTestId('same-client').textContent).toBe('true');
    expect(mount.factory).toHaveBeenCalledOnce();
    expect(mount.onMount).toHaveBeenCalledOnce();
    expect(mount.onUnmount).not.toHaveBeenCalled();

    client.setQueryData(['shared-key'], 'current session');
    lateRequest.resolve('obsolete session');
    await requestOutcome;
    await lateRequest.promise;
    expect(client.getQueryData(['shared-key'])).toBe('current session');
    expect(client.getQueryData(['previous-session'])).toBeUndefined();
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it('publishes theme and equivalent group snapshots without reloading or retiring cache', async () => {
    const mount = createFixture();
    await act(async () => {
      await mount.start();
    });
    const router = mount.getRouter();
    const heading = screen.getByRole('heading');
    mount.queryClient.setQueryData(['keep'], 'retained');
    await act(async () => {
      await mount.updateShellState({
        ...shellState('first', ['readers', 'readers']),
        theme: 'dark',
      });
      await mount.updateShellState({ ...shellState('first'), theme: 'dark' });
    });

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('groups').textContent).toBe('readers');
    expect(mount.queryClient.getQueryData(['keep'])).toBe('retained');
    expect(mount.loader).toHaveBeenCalledOnce();
    expect(mount.beforeLoad).toHaveBeenCalledOnce();
    expect(mount.getRouter()).toBe(router);
    expect(screen.getByRole('heading')).toBe(heading);
    expect(mount.onMount).toHaveBeenCalledOnce();
    expect(mount.onUnmount).not.toHaveBeenCalled();
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it('retains a pending load snapshot while hooks observe the new theme immediately', async () => {
    const ancestor = deferred();
    const beforeRootLoad = vi.fn<(state: ShellState) => void | Promise<void>>();
    beforeRootLoad
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(async () => {
        await ancestor.promise;
      });
    const mount = createFixture((state) => state.theme, beforeRootLoad);
    await act(async () => {
      await mount.start();
    });
    const router = mount.getRouter();
    expect(router).toBeDefined();
    let reload: Promise<void> | undefined;
    let reloaded = false;
    await act(async () => {
      reload = router?.invalidate({ sync: true }).then(() => {
        reloaded = true;
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(beforeRootLoad).toHaveBeenCalledTimes(2));
    expect(mount.loader).toHaveBeenCalledOnce();
    await act(async () => {
      await mount.updateShellState({ ...shellState('first'), theme: 'dark' });
    });
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(mount.loader).toHaveBeenCalledOnce();

    await act(async () => {
      ancestor.resolve('continue');
      await ancestor.promise;
    });
    await waitFor(() => expect(reloaded).toBe(true));
    await reload;
    expect(beforeRootLoad.mock.calls[1]?.[0].theme).toBe('light');
    expect(mount.beforeLoad.mock.calls[1]?.[0].theme).toBe('light');
    expect(mount.loader.mock.calls[1]?.[0].theme).toBe('light');
    expect(screen.getByTestId('loader-data').textContent).toBe('light');
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    reloaded = false;
    await act(async () => {
      reload = router?.invalidate({ sync: true }).then(() => {
        reloaded = true;
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(reloaded).toBe(true));
    await reload;
    expect(beforeRootLoad.mock.calls[2]?.[0].theme).toBe('dark');
    expect(mount.beforeLoad.mock.calls[2]?.[0].theme).toBe('dark');
    expect(mount.loader.mock.calls[2]?.[0].theme).toBe('dark');
    expect(screen.getByTestId('loader-data').textContent).toBe('dark');
    expect(mount.onMount).toHaveBeenCalledOnce();
    expect(mount.onUnmount).not.toHaveBeenCalled();
    expect(mount.reportError).not.toHaveBeenCalled();
  });

  it.each(['oldest first', 'latest first'])(
    'publishes only the latest identity when its overlapping loaders resolve %s',
    async (completionOrder) => {
      const second = deferred();
      const third = deferred();
      const mount = createFixture((state) => {
        if (state.user?.id === 'second') return second.promise;
        if (state.user?.id === 'third') return third.promise;
        return 'first';
      });
      await act(async () => {
        await mount.start();
      });
      const content = mount.placement.firstElementChild as HTMLDivElement;
      const firstTransition = await startTransition(mount, shellState('second'));
      await waitFor(() => expect(mount.loader).toHaveBeenCalledTimes(2));
      const latestTransition = await startTransition(mount, shellState('third'));
      await waitFor(() => expect(mount.loader).toHaveBeenCalledTimes(3));
      expect(content.hidden).toBe(true);

      if (completionOrder === 'oldest first') {
        await act(async () => {
          second.resolve('obsolete second');
          await second.promise;
        });
        expect(content.hidden).toBe(true);
        expect(latestTransition.isSettled()).toBe(false);
        expect(screen.getByTestId('loader-data').textContent).not.toBe('obsolete second');
      }

      await act(async () => {
        third.resolve('current third');
        await third.promise;
      });
      await waitFor(() => expect(latestTransition.isSettled()).toBe(true));
      expect(content.hidden).toBe(false);
      expect(screen.getByRole('heading').textContent).toBe('third');
      expect(screen.getByTestId('loader-data').textContent).toBe('current third');
      if (completionOrder === 'latest first') {
        await act(async () => {
          second.resolve('obsolete second');
          await second.promise;
        });
      }
      await Promise.all([firstTransition.transition, latestTransition.transition]);
      expect(content.hidden).toBe(false);
      expect(screen.getByRole('heading').textContent).toBe('third');
      expect(screen.getByTestId('loader-data').textContent).toBe('current third');
      expect(mount.onMount).toHaveBeenCalledOnce();
      expect(mount.onUnmount).not.toHaveBeenCalled();
      expect(mount.reportError).not.toHaveBeenCalled();
    },
  );

  it('never reattaches or unhides retired content after disposal during a transition', async () => {
    const second = deferred();
    const mount = createFixture((state) =>
      state.user?.id === 'second' ? second.promise : 'first',
    );
    await act(async () => {
      await mount.start();
    });
    const content = mount.placement.firstElementChild as HTMLDivElement;
    const transition = await startTransition(mount, shellState('second'));
    await waitFor(() => expect(mount.loader).toHaveBeenCalledTimes(2));
    expect(content.hidden).toBe(true);

    await act(async () => {
      await mount.handle.dispose();
    });
    expect(content.isConnected).toBe(false);
    expect(mount.getRootCount()).toBe(0);
    await waitFor(() => expect(transition.isSettled()).toBe(true));
    await transition.transition;
    await act(async () => {
      second.resolve('late disposed session');
      await second.promise;
    });
    expect(content.hidden).toBe(true);
    expect(content.isConnected).toBe(false);
    expect(document.body.childElementCount).toBe(0);
    expect(mount.getRouter()).toBeUndefined();
    expect(mount.handle.state.status).toBe('disposed');
    expect(mount.onUnmount).toHaveBeenCalledOnce();
    expect(mount.reportError).not.toHaveBeenCalled();
  });
});
