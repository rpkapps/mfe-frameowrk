# Gate 0 feasibility decision

**Status: blocked; Gate 0 has not passed.** The original native factory creates a
global History patch before the adapter can receive its return value. The tested
native context-refresh strategy also reloads an unrelated loader. These findings
block expansion under §16. The revisions below are proposals, not implemented or
accepted contract changes.

This is a focused feasibility report, not the complete Gate 0 acceptance suite.
It does not establish a working App adapter, real-shell integration, federation,
browser navigation, reserved-context enforcement, or later implementation gates.

## Reproduction and review

Independently reviewed `tests/router-probe.tsx`,
`tests/router-characterization.test.tsx`, and
`tests/conformance/gate-zero.test.tsx`, inspected installed dependency source, and
reran both focused suites on 2026-09-18:

```sh
pnpm exec vitest run tests/router-characterization.test.tsx
pnpm run gate:0
```

The independent rerun invoked the installed Vitest executable directly; it used
the same configurations and installed packages. Characterization passed **5/5**.
The conformance probe failed **2/2**, with the failures described below. The normal
`pnpm test` configuration excludes `tests/conformance`; a green normal test run
does not imply that Gate 0 passed. Neither failing assertion is skipped or marked
as an expected failure.

| Dependency/tool                  | Exact version    |
| -------------------------------- | ---------------- |
| Node.js / pinned pnpm            | 24.19.0 / 12.4.2 |
| React / React DOM                | 19.3.0 / 19.3.0  |
| `@tanstack/react-router`         | 1.170.38         |
| Resolved `@tanstack/router-core` | 1.171.32         |
| `@tanstack/history`              | 1.162.4          |
| `@tanstack/react-query`          | 5.103.1          |
| `@tanstack/router-generator`     | 1.167.38         |
| TypeScript                       | 5.9.3            |
| Vitest / jsdom                   | 5.0.1 / 30.1.0   |
| React Testing Library            | 16.3.3           |

These are DOM-environment tests, not Playwright tests against Rspack output.
jsdom reports unimplemented `scrollTo`; the assertions do not concern scrolling.
The probe uses a small code-defined tree to isolate native construction and
context behavior. The separate generated introductory fixture is not substituted
by these tests. Concurrent mounts, asynchronous context transitions, selector
render isolation, subscription counts, and actual history traversal remain
unverified.

## Observations and conclusions

| Operation                                                  | Observed result                                                                     | What it establishes                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Construct native router without `history`                  | Both global History methods change identity; `options.history` remains absent       | The original factory creates a patch synchronously; presence of `router.history` cannot identify author-supplied history |
| Supply memory history before construction                  | Supplied object remains in both history fields; global methods retain identity      | Passing framework history prevents this default-history construction path; a browser boundary bridge is still unproven   |
| Destroy two default histories out of creation order        | Destroying the second restores the first router's obsolete wrapper                  | Cleanup order matters; restoring methods after construction does not prove patch-free construction                       |
| Call `router.update({ context })`                          | Options contain dark theme, while native match context and rendered UI remain light | This update alone does not publish the required reactive context snapshot                                                |
| Update context, then `invalidate({ filter: () => false })` | UI becomes dark; unrelated loader calls increase from 1 to 2                        | This specific supported strategy fails §5.4.1 with default loader freshness                                              |

The history conclusion follows directly from the pinned implementation, not only
from a failed assertion. The constructor invokes `update`, which constructs
browser history when no history was supplied. Browser history immediately
replaces both global methods. A handoff after the factory returns happens too
late to satisfy the unchanged contract. Its `destroy()` restores captured methods
unconditionally. See the pinned [constructor and history selection][router-history],
[global method replacements][history-patches], and [history cleanup][history-cleanup].

The context result is narrower: two straightforward native strategies do not
meet the requirement. It does **not** prove that no conceivable supported
integration exists. Source explains the observations: `update` merges options,
`useRouteContext` selects `match.context`, and filtered invalidation still invokes
`load`; same-location loading reevaluates default-stale loaders. See
[option updates][router-history], [native context selection][context-hook],
[invalidation][invalidate], and [loader freshness decisions][loader-freshness].
The documented context-refresh mechanism is
[`router.invalidate()`][context-guide]. No documented context-only publication
method or `updateMatch` implementation was found in this pinned Router version.

A subsequent [QueryClient comparison](query-context-feasibility.md) verifies why
the normal Router/Query combination works: the client remains stable and Query
hooks subscribe separately. Reading its cache through `useRouteContext` alone
does not subscribe, and caching does not eliminate route work on invalidation.

Changing route freshness or `shouldReload` can avoid particular loader calls, but
does not preserve arbitrary author-selected behavior. Writing router stores,
replacing internal methods, or treating an SSR construction trick as a proven
client lifecycle is not an established supported alternative. No alternative
meeting the complete original contract was demonstrated by this review.

## Proposed revision 1: forward framework-owned boundary history

Add `history: RouterHistory` to `AppRouterOptions`. The adapter creates a constrained
boundary history before invoking the author factory. Require the author to
forward that exact object, with runtime identity validation:

```ts
function makeRouter({ basePath, context, history }: AppRouterOptions) {
  return createRouter({
    routeTree,
    basepath: basePath,
    context: { ...context },
    history,
    defaultPreload: 'intent',
  });
}
```

This retains native `createRouter`, per-mount construction, ordinary router
options, and `ReturnType<typeof makeRouter>` augmentation. Authors neither create
nor replace history. The object is an App boundary adapter, not `window.history`
or the shell router. Revise §5.2 and the Gate 0 no-history-input assertion
explicitly. Prove the real bridge and blockers in Gate 1 before expansion.

A factory returning router options would keep history entirely private, but is a
larger author and typing change: the adapter would construct the router and the
existing return-type augmentation would need replacement. It is not needed to
address the observed default-history problem.

## Proposed revision 2: use existing hooks for reactive shell fields

Define native `context.mfe` as the immutable snapshot supplied to a route
invocation/navigation. Components needing live user, groups, or theme use the
already-specified `useUser`, `useGroups`, and `useTheme` hooks, backed by selective
mount-owned subscriptions. Keep stable services and `queryClient` in native
context. Preserve author-added top-level keys.

Theme changes update those hooks and the router's context for future invocations
without invalidating loaders. Identity, tenant, or permission changes still retire
obsolete work and explicitly invalidate affected native authorization/data work.
Existing matches need not become live shell-state subscriptions under this
proposal. Revise §§5.4–5.4.1 and their acceptance/performance assertions explicitly;
this is a changed promise, not an implementation of the original native-context
reactivity requirement. The revised hooks and transition policy still need
implementation and tests.

## Reserved-context enforcement remains unresolved

Factory-level equality checks can validate the supplied `mfe` and `queryClient`.
The current probes do not implement or prove those checks. Native route context
and `beforeLoad` results are shallow-merged before loaders run; inspect the pinned
[contextualization sequence][context-merge]. No supported interception hook for
every returned contribution was identified. The documented `route.update`
accepts [`UpdatableRouteOptions`][route-update-options], whose type excludes `context` and `beforeLoad`;
casting wrappers into it would not establish a supported solution.

Two possible observation mechanisms require further proof:

- Compose native `InnerWrap` with a guard reading native matches, preserving an
  author's wrapper, and raise `app/invalid-router` before feature rendering.
- Observe `onBeforeRouteMount` and explicitly transition the owning mount to an
  error. Throwing from the event listener is insufficient: the pinned
  [event emitter catches and logs listener exceptions][event-errors].

Both observe results after route loading and cannot claim to prevent a conflicting
namespace reaching loaders. Guard ordering, pending routes, failed/preloaded
routes, exact-value forwarding, author extensions, async transitions, and repeated
mounts require targeted tests. Decide the required rejection boundary before
claiming §5.4 enforcement. These unresolved checks alone prevent a complete Gate 0
pass even if both proposals are accepted.

## Source provenance

Links below use the release tag `@tanstack/react-router@1.170.38`. Installed source
was compared by Git blob hash and matches that tag: RouterCore `1974690b…`, History
`1c9bd5ed…`, client loading `ea4f2704…`, route types `089369b4…`, and context hook
`0aed8720…`. The differently numbered RouterCore package is the exact resolved
dependency, not an assumed version alignment.

[router-history]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/router-core/src/router.ts#L1219-L1287
[history-patches]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/history/src/index.ts#L586-L598
[history-cleanup]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/history/src/index.ts#L551-L557
[context-hook]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/react-router/src/useRouteContext.ts#L25-L29
[invalidate]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/router-core/src/router.ts#L2497-L2571
[loader-freshness]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/router-core/src/load-client.ts#L748-L805
[context-guide]: https://tanstack.com/router/latest/docs/guide/router-context#invalidating-the-router-context
[context-merge]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/router-core/src/load-client.ts#L356-L465
[event-errors]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/router-core/src/router.ts#L1440-L1448
[route-update-options]: https://github.com/TanStack/router/blob/@tanstack/react-router@1.170.38/packages/router-core/src/route.ts#L1257-L1406
