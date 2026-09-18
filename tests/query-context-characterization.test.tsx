// @vitest-environment jsdom
import { createMemoryHistory } from '@tanstack/history';
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouteContext,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RecordData {
  readonly title: string;
  readonly count: number;
}

const recordKey = ['query-context-probe'] as const;
const initialRecord: RecordData = { title: 'Initial', count: 1 };

function recordOptions(read: () => Promise<RecordData>) {
  return queryOptions({ queryKey: recordKey, queryFn: read, staleTime: Infinity });
}

interface ProbeContext {
  readonly queryClient: QueryClient;
  readonly options: ReturnType<typeof recordOptions>;
  readonly recordCommit: (name: string) => void;
}

function useOptions() {
  return useRouteContext({ from: '__root__', select: (context: ProbeContext) => context.options });
}

function useRouterClient() {
  return useRouteContext({
    from: '__root__',
    select: (context: ProbeContext) => context.queryClient,
  });
}

function useCommitProbe(name: string) {
  const recordCommit = useRouteContext({
    from: '__root__',
    select: (context: ProbeContext) => context.recordCommit,
  });
  useEffect(() => recordCommit(name));
}

function RouterSnapshot() {
  const title = useRouteContext({
    from: '__root__',
    select: (context: ProbeContext) =>
      context.queryClient.getQueryData(context.options.queryKey)?.title,
  });
  useCommitProbe('router-snapshot');
  return <span data-testid="router-snapshot">{title}</span>;
}

function ProviderSnapshot() {
  const client = useQueryClient();
  useCommitProbe('provider-snapshot');
  return (
    <span data-testid="provider-snapshot">{client.getQueryData<RecordData>(recordKey)?.title}</span>
  );
}

function selectTitle(record: RecordData) {
  return record.title;
}

function selectCount(record: RecordData) {
  return record.count;
}

function QueryTitle() {
  const { data } = useQuery({ ...useOptions(), select: selectTitle });
  useCommitProbe('query-title');
  return <span data-testid="query-title">{data}</span>;
}

function QueryCount() {
  const { data } = useQuery({ ...useOptions(), select: selectCount });
  useCommitProbe('query-count');
  return <span data-testid="query-count">{data}</span>;
}

function QueryWithRouterClient() {
  const client = useRouterClient();
  const { data } = useQuery({ ...useOptions(), select: selectTitle }, client);
  useCommitProbe('explicit-client');
  return <span data-testid="explicit-client">{data}</span>;
}

function AllProbes() {
  return (
    <>
      <RouterSnapshot />
      <ProviderSnapshot />
      <QueryTitle />
      <QueryCount />
      <QueryWithRouterClient />
    </>
  );
}

function createProbe(component: () => ReactElement = AllProbes) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const read = vi.fn(() => Promise.resolve(initialRecord));
  const recordCommit = vi.fn<(name: string) => void>();
  const options = recordOptions(read);
  const context: ProbeContext = { queryClient: client, options, recordCommit };
  const root = createRootRouteWithContext<ProbeContext>()({ component: Outlet });
  const beforeLoad = vi.fn(() => ({}));
  const loader = vi.fn(({ context: current }: { context: ProbeContext }) =>
    current.queryClient.ensureQueryData(current.options),
  );
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    beforeLoad,
    loader,
    component,
  });
  const history = createMemoryHistory({ initialEntries: ['/query-probe/'] });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    context,
    history,
    basepath: '/query-probe',
    defaultPendingMinMs: 0,
  });

  return {
    client,
    router,
    read,
    loader,
    beforeLoad,
    recordCommit,
    async dispose() {
      cleanup();
      history.destroy();
      await client.cancelQueries();
      client.clear();
    },
  };
}

beforeEach(() => {
  // JSDOM provides no layout. This probe concerns subscriptions and loader work.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

describe('Query combines a stable context handle with separate data subscriptions', () => {
  it('updates Query subscribers while imperative context reads stay stale, without reloading routes', async () => {
    const probe = createProbe();
    try {
      await probe.router.load();
      render(
        <QueryClientProvider client={probe.client}>
          <RouterProvider router={probe.router} />
        </QueryClientProvider>,
      );
      expect((await screen.findByTestId('query-title')).textContent).toBe('Initial');
      expect(probe.read).toHaveBeenCalledOnce();
      const loads = probe.loader.mock.calls.length;
      const guards = probe.beforeLoad.mock.calls.length;
      probe.recordCommit.mockClear();

      act(() => {
        probe.client.setQueryData(probe.router.options.context.options.queryKey, {
          title: 'Updated',
          count: 1,
        });
      });
      await waitFor(() => expect(screen.getByTestId('query-title').textContent).toBe('Updated'));
      expect(screen.getByTestId('explicit-client').textContent).toBe('Updated');
      expect(screen.getByTestId('router-snapshot').textContent).toBe('Initial');
      expect(screen.getByTestId('provider-snapshot').textContent).toBe('Initial');
      expect(screen.getByTestId('query-count').textContent).toBe('1');
      expect(probe.recordCommit.mock.calls.map(([name]) => name).sort()).toEqual([
        'explicit-client',
        'query-title',
      ]);
      expect(probe.router.options.context.queryClient).toBe(probe.client);
      expect(probe.client.getQueryData(recordKey)).toEqual({ title: 'Updated', count: 1 });
      expect(probe.loader).toHaveBeenCalledTimes(loads);
      expect(probe.beforeLoad).toHaveBeenCalledTimes(guards);
      expect(probe.read).toHaveBeenCalledOnce();
    } finally {
      await probe.dispose();
    }
  });

  it('can use the client obtained from Router context directly as the Query subscription source', async () => {
    const probe = createProbe(QueryWithRouterClient);
    try {
      await probe.router.load();
      // This control omits QueryClientProvider; useQuery receives the client explicitly.
      render(<RouterProvider router={probe.router} />);
      expect((await screen.findByTestId('explicit-client')).textContent).toBe('Initial');

      act(() => {
        probe.client.setQueryData(probe.router.options.context.options.queryKey, {
          title: 'Explicit client update',
          count: 1,
        });
      });
      await waitFor(() =>
        expect(screen.getByTestId('explicit-client').textContent).toBe('Explicit client update'),
      );
      expect(probe.read).toHaveBeenCalledOnce();
      expect(probe.loader).toHaveBeenCalledOnce();
    } finally {
      await probe.dispose();
    }
  });

  it('reruns route work on invalidation while reusing cached query data', async () => {
    const probe = createProbe();
    try {
      await probe.router.load();
      render(
        <QueryClientProvider client={probe.client}>
          <RouterProvider router={probe.router} />
        </QueryClientProvider>,
      );
      await screen.findByTestId('query-title');
      const loads = probe.loader.mock.calls.length;
      const guards = probe.beforeLoad.mock.calls.length;
      await act(async () => {
        await probe.router.invalidate({ filter: () => false });
      });

      expect(probe.read).toHaveBeenCalledOnce();
      expect(probe.loader).toHaveBeenCalledTimes(loads + 1);
      expect(probe.beforeLoad).toHaveBeenCalledTimes(guards + 1);
    } finally {
      await probe.dispose();
    }
  });
});
