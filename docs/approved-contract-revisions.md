# Approved contract revisions

Approved on 2026-09-18 after the Gate 0 native Router and Query probes: the user explicitly approved forwarding framework-provided history into the App router factory and using `useUser`, `useGroups`, and `useTheme` for live UI shell state, with native context snapshots for route callbacks. These are contract changes, not claims that an implementation gate has passed. All other requirements and gate ordering remain in force.

This document records the approved revisions applied to the supplied specification. It is the tracked companion to that source; the complete supplied specification remains excluded from the repository.

## Tracing deferral — approved 2026-09-18

Tracing is removed from the current Gate 1 exit requirement and deferred. The original Gate 1
item 11 no longer blocks the remaining Gate 1 work. A later dedicated tracing gate must review
and prove the framework-owned tracing contract before provider or full telemetry integration is
accepted. This revision does not set a deadline, authorize a new public carrier or tracing API,
or promise automatic parentage for arbitrary author functions across `await`. The existing
`startSpan`/`startActiveSpan` semantics and standard `#mfe/fetch` signature remain unchanged
until that dedicated gate revisits them.

## Rsbuild package surface

The user approved replacing the original Rspack-facing build surface with the `@company/mfe-rsbuild` package. Its public build entry is `mfePlugin`; the native `sharedReactPlugin` supplies the shared React and CSS pipeline for shell builds. Rsbuild uses the Rspack engine underneath, so this is a package and author-facing API migration rather than a new bundler or a change to the MF2 contract. MF2 loading, manifests, sharing, and transport remain private implementation details.

The package and launcher now use this contract. Validation evidence and remaining checks are recorded in [the progress record](./progress.md); tracing is separately deferred by the approved revision above. Historical Rspack package names, versions, and test evidence below and in the feasibility records remain unchanged as historical evidence.

## Construction-time history forwarding

Replace the requirement that authors omit `history` and the adapter installs it after router construction with this contract:

- `AppRouterOptions` has readonly `basePath: string`, `history: RouterHistory`, and `context: MfeRouterContext` properties. `RouterHistory` is TanStack's native type; no new public history abstraction is introduced.
- The adapter creates and owns a constrained history for the assigned App boundary before invoking the factory. It is neither the shell router nor `window.history`.
- The factory forwards the exact supplied history and base path into native `createRouter`. Omitted or substituted history produces `app/invalid-router`; a changed base path produces `app/invalid-base-path`.
- Validate the configured history's identity. The existence of `router.history` alone does not prove correct forwarding.
- The supported construction and mounting path adds no global History patch. Constructing default browser history and replacing it afterward is not a valid implementation.
- Feature code continues to navigate through the App's native router. The adapter owns history coordination and disposal.

The introductory fixture uses this bootstrap with its generated route tree and typed root route:

```ts
// src/mfe.ts
import { createApp, type AppRouterOptions } from '@company/mfe-react';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

function makeRouter({ basePath, history, context }: AppRouterOptions) {
  return createRouter({
    routeTree,
    basepath: basePath,
    history,
    context: { ...context },
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}

export default createApp({ id: 'operations', router: makeRouter });
```

`src/routes/__root.tsx` continues to use `createRootRouteWithContext<MfeRouterContext>()` and an `Outlet`. The scaffold retains native `Register` augmentation and file-based route generation; there is no module-scope router singleton. Run `pnpm run typecheck` to generate prerequisites and compile the workspace and introductory fixture.

Gate 0 must prove construction-time forwarding, identity validation, cleanup, and absence of global patches with its in-process loader. Test-owned memory history does not prove the browser boundary bridge. Gate 1 still requires real browser back/forward, native blockers, nested coordination, and concurrent mount isolation before expansion.

## Live shell-state hooks and native route snapshots

Replace the promise that changing shell state automatically refreshes `useRouteContext` consumers with this contract:

| Consumer                        | Required access and behavior                                                                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React UI rendering shell values | `useUser`, `useGroups`, and `useTheme` subscribe to the corresponding field, with optional selectors and `Object.is` equality.                                                                      |
| Native `beforeLoad` and loaders | `context.mfe` contains the immutable shell-state snapshot selected when the native load/navigation begins, retained across that load's callback chain, plus stable mount services.                  |
| Native `useRouteContext`        | Retains TanStack's native match-context semantics. It supports author route context and snapshot reads; it does not subscribe to shell-state changes.                                               |
| Query-backed UI                 | Native `useQuery`/`useSuspenseQuery` subscriptions observe the mount-owned Query cache. `getQueryData()` is an imperative read, including when called through router context or `useQueryClient()`. |

The shell-state hooks and native load/navigation snapshots use one underlying mount-bound state source. No parallel shell-state cache is introduced, and framework state does not move into TanStack Query. The implementation follows the existing plain TypeScript and `useSyncExternalStore` requirements.

```tsx
// src/routes/index.tsx
import { useUser } from '@company/mfe-react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Welcome });

function Welcome() {
  const user = useUser();
  return <p>Hello, {user?.name ?? 'guest'}</p>;
}
```

Snapshot updates preserve unchanged field references and stable services. No-op updates notify no subscribers. A theme-only update immediately refreshes affected `useTheme` consumers without rerunning unrelated loaders, restarting in-flight route work, or resetting Query caches. The adapter updates the router context for newly started native loads/navigations. Each load selects one immutable snapshot and retains it throughout its callback chain. If a parent `beforeLoad` awaits while theme changes, that load's later child callbacks still use its earlier snapshot. A newly started load/navigation uses the updated theme.

An existing native match can retain its earlier snapshot until its normal route lifecycle updates it. Captured snapshots do not become live after `await`. Stable services may be captured during router construction; shell-state snapshots must not be captured there for future loads or session-dependent decisions. Callbacks read their supplied context so each new load receives its own snapshot. This is load/navigation consistency, not a promise that every callback sees the latest wall-clock shell value.

Identity, account/tenant, and semantic group changes still retire the old generation, obsolete work, and session-retained storage before publishing the new session, then deliberately invalidate affected route authorization decisions and loader data. Query cancellation/cache retirement and stale-result fencing remain required. Group reordering remains a no-op; same-session token refresh does not remount or invalidate unrelated data. The complete session, storage, and cache integration retains its later implementation gates.

The top-level `queryClient` stays the same mount-owned service instance used by `QueryClientProvider`. Router context carries the service; Query hooks supply its subscriptions. This illustrates the separation between service access and reactive observation, without making Router context a live shell-state API.

## Requirements preserved

- Reserved `mfe` and top-level `queryClient` replacements remain explicit `app/invalid-router` failures at factory and merged route-context boundaries. Diagnostics identify the conflicting key and offending route when available. A child route must not silently shadow framework capabilities.
- Author-added top-level keys and native `beforeLoad` extensions remain supported and survive framework updates. Authors may forward the exact supplied reserved values unchanged.
- Mount, router, route-tree, Query client, and service identity remain stable. Cleanup, cancellation, Strict Mode behavior, and cross-mount isolation are unchanged.
- No shell router or raw browser history is exposed. Widgets remain non-routable and receive no history or App router context.
- Native navigation blocking, real-shell authentication, federation, build integration, legacy compatibility, and release performance requirements retain their existing gates. The revisions grant no deployment or package-publication authorization.

## Specification cross-reference

| Sections                   | Applied change                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §§1.2, 1.4                 | Distinguish live shell-state hook subscriptions from native route-context snapshots and selections.                                                                                                                                 |
| §5.2                       | Add the supplied history to the factory type/bootstrap; replace post-construction handoff with construction-time forwarding, identity validation, and explicit gate limits.                                                         |
| §§5.4, 5.4.1, 5.4.3, 5.4.4 | Use existing field hooks for live rendering and one immutable snapshot per native load/navigation callback chain. Preserve reserved keys, extensions, session transitions, and the ban on capturing factory state for future loads. |
| §5.4.2                     | Clarify stable Query client access, native cache subscriptions, and nonreactive imperative reads.                                                                                                                                   |
| §§6.1, 12.4                | Clarify constrained adapter history and the existing framework state-implementation rules.                                                                                                                                          |
| §14 criteria 1, 3, 37, 41  | Align acceptance with history forwarding, shell-state hooks, callback snapshots, and render isolation.                                                                                                                              |
| §§15, 15.1, 15.2           | Align the router/context/Query test matrix and test helpers with the revised contract.                                                                                                                                              |
| §16 Gates 0, 3             | Require the revised tracer behavior; preserve browser and complete session-integration gates.                                                                                                                                       |
| §§17.2, 17.5               | Align portability substitutes and shell-state render-isolation probes.                                                                                                                                                              |

Historical findings remain in [Gate 0 feasibility](./gate-zero-feasibility.md) and [Query context feasibility](./query-context-feasibility.md). Current implementation evidence and remaining work belong in [the progress record](./progress.md); approval alone does not retire those risks.

## Local development shell — approved 2026-09-18

The user has no separate shell repository and explicitly requested a test shell inside this repository, using Tecton shell-01 with app content mounted beneath its header and one pnpm command for all test applications. This authorizes the local shell and fixed development persona, replacing the earlier prohibition on a standalone development shell for this test environment. It does not establish real authentication, approve deployment, or waive the remaining integration gates.
