# QueryClient and reactive router context

The pinned Query integration uses two mechanisms together: context carries a
stable service object, and Query hooks subscribe to data owned by that object.
This provides a model for the proposed shell-state integration, but does not make
plain native route-context snapshots reactive.

## Verified against the installed versions

React Query 5.103.1, React Router 1.170.38, Router Core 1.171.32, React 19.3.0.
Run `pnpm exec vitest run tests/query-context-characterization.test.tsx`.
The fixture uses `staleTime: Infinity` and a mocked query function. Counts below
measure query-function execution, not network traffic. Three focused DOM tests pass:

| Operation                                                                                        | Observation                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader prepares data through `context.queryClient`; components use the same client's Query hooks | One mocked query-function execution serves the loader and components                                                                                                    |
| `setQueryData` changes one field                                                                 | Both subscribing title views update; unchanged count and imperative-read views have zero additional commits; no additional loader, `beforeLoad`, or query-function work |
| Native route-context selector calls `getQueryData`                                               | The view remains unchanged after the cache update; it does not gain a Query subscription                                                                                |
| `useQueryClient().getQueryData` reads during render                                              | The view also remains unchanged; obtaining the client is not a cache subscription                                                                                       |
| `useQuery(options, clientFromRouteContext)` without QueryClientProvider                          | Data updates reactively because `useQuery` installs the subscription                                                                                                    |
| Explicit Router invalidation while Query data remains cached                                     | No additional query-function execution; both loader and `beforeLoad` run again                                                                                          |

The explicit-client control proves cache subscription only. It does not claim
equivalent focus/reconnect lifecycle behavior without `QueryClientProvider`; the
framework still supplies that provider automatically.

The cache remains readable through the original client object: imperative reads
made later return current data. The earlier rendered values remain unchanged
until something causes their component to render. Replacing the client itself
would introduce context propagation concerns, but the framework's contract keeps
one stable client per mount.

These are isolated subscription/loader probes, not production performance,
authenticated integration, or session-transition acceptance tests. Query receives
example server records here, not framework-owned shell state.

## How the two mechanisms cooperate

`QueryClientProvider` supplies the client reference. `useQuery` creates a
`QueryObserver` and connects it through `useSyncExternalStore`; query selection
and tracked result properties determine which consumers update. Router is not
responsible for those cache subscriptions. Its context gives route callbacks
access to the same client used by UI consumers.

This is the integration shown in [TanStack Router's external-data loading guide](https://tanstack.com/router/latest/docs/guide/external-data-loading).
The pinned source makes the distinction explicit:

- [QueryClient's imperative cache read](https://github.com/TanStack/query/blob/@tanstack/react-query@5.103.1/packages/query-core/src/queryClient.ts#L175-L191)
- [QueryClientProvider supplies the stable client](https://github.com/TanStack/query/blob/@tanstack/react-query@5.103.1/packages/react-query/src/QueryClientProvider.tsx#L70-L85)
- [Query hooks install observer subscriptions](https://github.com/TanStack/query/blob/@tanstack/react-query@5.103.1/packages/react-query/src/useBaseQuery.ts#L86-L115)

## Implication for the framework

The recommended architecture uses one shell-state source with two access paths:

1. Native router context supplies stable services and an immutable shell snapshot
   to route callbacks. New route invocations receive the current snapshot.
2. Existing `useUser`, `useGroups`, and `useTheme` hooks subscribe directly to the
   appropriate fields for live UI updates, including independent Widgets.
3. Identity/tenant/permission changes coordinate obsolete-work cancellation, Query
   cache retirement, and Router invalidation. Theme changes need no route reload.

This follows Query's stable-handle/subscription pattern while respecting §12.4:
framework state remains in purpose-specific plain TypeScript structures, observed
with `useSyncExternalStore`. Query continues to own server data. No new public
generic store or context-selector concept is required.

The original promise that plain `useRouteContext({ select: c => c.mfe.theme })`
automatically receives theme updates without loader work still needs an explicit
contract revision or a separately proven supported mechanism. These tests do not
waive that promise, resolve the history/bootstrap mismatch, or pass Gate 0.
