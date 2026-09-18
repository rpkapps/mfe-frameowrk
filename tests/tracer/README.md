# In-process contract tracer

This fixture exercises the real `createApp` facade and neutral
`createMountLifecycle` with native TanStack Router, React `createRoot`, and
`RouterProvider`. The in-process definition map, candidate rendering adapter,
and resource inspection methods exist only under `tests/tracer`. They are not a
published loader, production adapter, or supported author testing entry point.

Run `pnpm exec vitest run tests/tracer` for the behavior evidence. The separately
configured `pnpm run gate:0` checks specification feasibility and remains blocked.
Passing these tests does **not** pass Gate 0 or authorize feature expansion.

The tests establish:

- Stable-id resolution and the specified `{ basePath, context }` author factory
  shape, with no shell router or supplied history object.
- A `/tracer` mount rendering shell state through native `useRouteContext`,
  retaining author context extensions and an author `InnerWrap`, and sharing one
  mount-owned Query client between router context and `QueryClientProvider`.
- Explicit structured failures for a changed base path, author-supplied history,
  and replaced reserved `mfe` or `queryClient` values.
- Explicit retry in the same placement through the neutral lifecycle, without
  automatic retry after a condition changes.
- Synchronous UI detachment, mount-signal abortion, and adapter router-reference
  release, followed by awaited React-root and Query-cache cleanup.
- Retirement of a pending attempt, with a loader result that ignores cancellation
  unable to attach UI after disposal.
- Detection of merged route-context conflicts using supported state inspection
  and `InnerWrap`, with route attribution in the failure.

The limits are deliberate and remain visible:

1. With the original factory contract, native router construction transiently
   replaces global History methods before the adapter receives the router.
   Destroying the default history restores those methods; it cannot prove that
   construction added no global patch. The separate conformance assertion must
   remain red until the contract or pinned integration is resolved.
2. Reserved-context checks occur **after** `beforeLoad` and loaders. A regression
   explicitly proves that a loader can observe a shadowed namespace before the
   candidate rejects the mount. The supported rendering guard is useful
   detection, not a pre-loader enforcement mechanism.
   On a later conflicting navigation, `InnerWrap` detects the conflict and the
   lifecycle retires the root, but the native `navigate()` promise remains
   pending because the rejected presentation never completes. The test records
   that outcome explicitly. This is not a complete navigation/error integration.
3. Signal abortion and late-result fencing do not prove forced cancellation of
   arbitrary author promises or the native navigation-scoped loader controller.
   Native router subscriptions are released when the React root is unmounted
   during awaited cleanup; this fixture does not claim immediate removal of
   every native subscription at the synchronous detach boundary.
4. The candidate cannot reclaim a default history constructed inside a factory
   that throws before returning its router. That is another consequence of
   handing resource construction to the factory before adapter ownership exists.
5. This uses memory history in JSDOM after the handoff. It does not verify browser
   back/forward, boundary-exit blockers, shared generated-tree concurrency,
   federation, Rspack/Compiler output, CSS, portals, authentication, reactive
   shell-context updates, or production performance. Those proofs retain their
   specified gates. JSDOM scrolling is mocked because no layout claim is made.

The candidate must stay test-internal. Production integration needs the unresolved
history and context feasibility decisions first.
