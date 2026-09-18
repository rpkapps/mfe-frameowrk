# MFE framework specification

## 1. Purpose and scope

This document defines the first implementation of a micro-frontend framework for a new TanStack React shell that must continue to host existing Angular micro-frontends. It is the contract for an engineering team that has no access to the legacy repositories or the design conversation that produced this document.

The framework provides two public author models:

- An **App** is a routable, independently deployable product surface.
- A **Widget** is a non-routable, independently mountable embedded surface.

New Apps and Widgets are authored in React. A native Angular authoring adapter is deferred (§3). Existing Angular micro-frontends continue to load unchanged through the legacy single-spa path (§13); that is a first-release requirement, not a deferral.

The neutral core owns contracts, loading, lifecycle, inputs, outputs, and error types. The React package provides the author-facing and host-facing surface. Module Federation 2 (MF2), manifests, registration, share scopes, generated entries, and chunk resolution are implementation details.

New framework features are additive and must not break existing shell registry navigation, settings, release notes, or route behavior.

### 1.1 Design principle

**Every MFE concern is expressed through a mechanism TanStack Router already has, or is invisible. A new concept is introduced only when neither is possible.**

An App author should be writing a TanStack Router application. Deployment, loading, style isolation, and federation plumbing stay behind the entry and build integration. Explicit feature integrations such as commands and nested Apps use the documented tier-2 APIs. Authors can complete everyday tasks using familiar tools, and every framework-specific failure has an actionable explanation. §§17.1–17.3 make this enforceable.

### 1.2 Reactive state, explicit actions

**Hooks that return state subscribe to it. Changes propagate automatically, preserve mount identity, and require no manual synchronization. Actions remain explicit.**

Widget props, shell-state hooks, command presentation and availability, breadcrumbs, subscribed storage values, and mount status are reactive. The framework owns subscription setup, update propagation, and cleanup. Authors do not manually refresh these surfaces, register listeners, or memoize ordinary callbacks merely to keep them current. Each native route load/navigation uses one immutable shell-state snapshot across its callback chain; reading a snapshot through router context does not subscribe to shell-state changes (§5.4).

Reactivity does not imply remounting, refetching all data, or executing actions. `emit`, `execute`, storage writes, `retry`, and navigation run only when invoked. Runtime configuration is an immutable snapshot for the loaded container; changing deployed values requires a page reload. Reactive behavior and its limits are specified at each API below.

### 1.3 Developer experience promises

1. A scaffolded App or Widget has working editor types, example configuration, and development, generation, typecheck, test, and build scripts.
2. Ordinary component, route, asset, and contract edits update automatically. Generated-file ordering is the toolchain's responsibility.
3. Interactive development runs against the real shell and its authenticated session. There is no standalone interactive harness or second authentication implementation. The development command makes connecting and diagnosing that path straightforward (§10.6).
4. Component and unit tests use explicit context fixtures and mocked requests without requiring a running shell or live credentials. These tests do not claim authenticated integration coverage.
5. Defaults provide usable pending, error, retry, and portal behavior. Advanced customization is documented when needed.

These promises are release requirements, verified through the author tasks in §17.3.

### 1.4 Selective reactivity and performance

**A state change updates the consumers that depend on it, without broadcasting unrelated work across the shell or other mounts.** Performance is part of the public contract, not an optional optimization after correctness.

- Use native router selectors for route context and router state. Use `useUser`, `useGroups`, and `useTheme` for live shell state, with their optional selectors when a narrower value is needed (§5.4.4). Storage subscriptions are keyed by definition ID, store, and key; lifecycle subscriptions belong to a mount. Do not route all state through one changing React context value.
- Snapshots are immutable and cached. An unchanged snapshot retains its reference, unchanged fields retain their references where supported, and no-op updates do not notify subscribers. Selected primitive/reference values use `Object.is`; freshly allocated aggregate selections need native structural sharing or a documented equality mechanism. Do not add unbounded deep comparison of arbitrary application state on every render.
- Stable actions and subscription functions are the framework's responsibility. Updating callback closures must not recreate mounts, channels, routers, or registrations, or publish unchanged presentation data.
- Batch notifications for one logical committed update where supported, without hiding intermediate lifecycle transitions that affect correctness. Never debounce controlled inputs, authorization changes, or command availability merely to meet a rendering target.
- Validate changed inputs at the trust boundary and cache the result for that committed input snapshot. No schema parsing, storage reads, JSON parsing, or manifest loading is repeated solely because an unrelated component rerenders.
- These guarantees concern additional work caused by framework subscriptions and adapters. They do not promise to prevent ordinary parent-driven React renders or expensive author-written component work. Isolation tests distinguish these cases (§17.5).

Keep native code splitting and lazy loading: a reactive update must not load unrelated routes or containers. Measure framework overhead, update latency, mount/load latency, network requests, and retained subscriptions; avoiding renders alone does not prove good performance.

### 1.5 Implementation quality

**The framework implementation must be clean, readable, consistent, and automatically formatted.** A maintainer should be able to trace an operation, its state changes, and its cleanup without deciphering clever abstractions or inconsistent conventions. These requirements apply to runtime packages, adapters, build tooling, tests, examples, and scaffold templates. §17.6 defines the implementation and review standards; passing functional and performance tests does not waive them.

## 2. Goals

The implementation must:

1. Give React authors one small, native-looking API for Apps and Widgets.
2. Keep App and Widget identity stable through a public plain `id`.
3. Keep the App's URL boundary invisible to the author in normal use.
4. Keep Widgets non-routable and prevent them from mutating browser history.
5. Support nested Apps without changing the child author's App contract.
6. Keep all routing inside the App's own TanStack Router instance.
7. Provide runtime-validated inputs and named typed output events.
8. Provide App capabilities for settings, help, and release notes through ordinary routes.
9. Provide mount-scoped command registration.
10. Compose breadcrumbs from native router state, with one explicit non-route override.
11. Load and validate runtime configuration declared in `src/mfe.config.ts`.
12. Attach authentication to outbound API requests without the author handling tokens.
13. Hide MF2 plumbing behind a normal Rspack `mfePlugin()`.
14. Apply native CSS `@scope` isolation on the supported modern-browser baseline.
15. Preserve the existing Angular/single-spa loader and parcel lifecycle.
16. Make malformed advertised new descriptors fail explicitly instead of silently falling back to legacy behavior.
17. Let a developer run one MFE locally against the real shell with a URL override.
18. Make state APIs reactive, with stable mounts, current callbacks, automatic subscriptions, and deterministic cleanup.
19. Prove the everyday author workflow with the task-based developer experience gate (§17.3).
20. Bound reactive update work to affected consumers and verify render isolation, update cost, lazy loading, and cleanup in performance gates (§17.5).
21. Maintain readable implementation code, shared coding conventions, and automated formatting and static checks across all framework packages (§17.6).
22. Enable React Compiler through a verified shared build integration, while keeping correctness and public identity contracts independent of compiler memoization (§10.9).
23. Ship focused shared ESLint presets and framework-specific rules (§17.7), using the pinned latest-stable pnpm toolchain and explicit dependency build-script approvals (§10.10).

## 3. Non-goals and deferred work

The first implementation does not:

- provide a native Angular authoring adapter. New Apps and Widgets are React. This is deferred, not rejected; §12.3 states what must stay true so it can be added later without redesign. Deferring the native adapter does **not** defer legacy Angular support, which is required in the first release;
- expose MF2 names, exposes, manifests, share scopes, registration APIs, preloading APIs, or chunk resolvers to authors;
- replace ordinary Rspack configuration with a framework wrapper;
- make the shell understand each MFE's configuration schema;
- require legacy MFEs to adopt `src/mfe.config.ts`, `runtime-config.json`, `#mfe/config`, or `#mfe/fetch`;
- rewrite legacy Angular route trees, feature code, `APP_BASE_HREF`, `baseHref`, or CSS;
- provide a global History API patch or a global `fetch` patch;
- make Widgets routable or App-capability owners;
- infer identity from an export name, filename, package name, or URL;
- introduce a second generic public concept called `Action`;
- standardize command placements other than `command-palette`;
- promise automatic scoped overlays for custom overlay implementations;
- add CSS fallbacks for browsers that do not support native `@scope`;
- add a Vite integration for author development or production builds; Vitest's internal transform pipeline is permitted for tests (§15.1);
- provide a standalone development harness. Developers run the shell and override one registry URL (§10.6);
- ship a devtools panel. Overrides are set directly in `localStorage` for now. A panel is a later, separate design;
- expose provider IDs, render-owner IDs, mount IDs, scope IDs, or logical-owner IDs;
- make `canExecute` an authorization boundary;
- require direct provider-source imports or coordinated container builds. Optional independently versioned Widget contract packages are supported (§5.8).

Advanced host overrides may exist where this document says so, but they must not become the normal author path.

## 4. Terminology and invariants

### 4.1 Public terms

- **App**: a routable definition that owns a URL boundary.
- **Widget**: a non-routable definition that owns no URL boundary.
- **Container**: one deployable MFE build that can export one App, one or more Widgets, or both.
- **Definition**: the result of `createApp(...)` or `createWidget(...)`.
- **Mount**: one active rendering of a definition.
- **Capability**: an App route advertised as a shell-openable surface.
- **Command**: a user-invocable intent registered by an active mount.
- **Host**: the shell or an App that loads and mounts another definition.
- **Legacy App**: an existing Angular single-spa parcel exposed as `./single-spa-app`.

### 4.2 Identity rules

The only public identity field is `id: string`.

`id` is stable across loading, registry lookup, diagnostics, capability attribution, CSS scope semantics, storage prefixes, and nested loading. It is required and must be globally unique across App and Widget definitions in the host registry. This prevents collisions in diagnostics, command attribution, and `<id>:<key>` storage. The runtime may keep opaque internal instance state when one definition has multiple mounts.

The public contract must not contain or require `providerId`, `renderOwnerId`, `logicalOwnerId`, `mountId`, or `scopeId`. The host may use internal tokens for bookkeeping, duplicate mount isolation, and DOM scope roots. Authors never set or read them.

A definition may declare an optional `version: string`. It does not gate loading, adapter selection, or mounting. The host records it and includes it in structured errors and diagnostics so a failure identifies which build was running.

### 4.3 Ownership rules

- Shell owns top-level URL boundaries, global header, global navigation placement, the outer breadcrumb landmark, and the authenticated session.
- An App owns routes and UI below its assigned boundary.
- A child App uses exactly the same App contract as a top-level App.
- A Widget owns no URL boundary and never mutates browser history.
- Settings, help, and release notes are App capabilities only.
- A parent App does not list child Apps in its manifest. It requests a child by stable `id`.
- A hidden App is excluded from catalog or finder views, not secured. Authorization remains the responsibility of the host and backend.

### 4.4 Source layout rules

The conventional entry is `src/mfe.ts`, or `src/mfe.tsx` when the entry contains JSX. Exactly one may exist; references below to `src/mfe.ts` include the JSX alternative.

One `src/mfe.ts` may export one App, one or more Widgets, or one App together with one or more Widgets. Named exports are canonical. A default export is allowed when the container exports exactly one definition. Definitions must be statically discoverable results of `createApp(...)` or `createWidget(...)`.

One container has one conventional `src/mfe.config.ts`, shared by every definition it exports. Per-mount data is typed Widget inputs or, for an App, its URL — never extra runtime configuration.

## 5. Public author API

The only framework-specific author-facing dependencies are:

- `@company/mfe-react`
- `@company/mfe-rspack`

Authors also use ordinary React, TanStack Router/Query, and Tecton APIs. TanStack Form and Table are the standard choices when those features are needed (§5.17).

### 5.1 The author surface

The complete getting-started surface is:

| Concept | What it is |
|---|---|
| `createApp` / `createWidget` | one call in `src/mfe.ts` |
| `id` | a stable string |
| your route tree | ordinary TanStack Router |
| `#mfe/config` | generated, typed configuration |
| `#mfe/fetch` | standard fetch signature with authenticated request handling |

Everything else in this section is tier 2: documented, discovered when the need arises, and absent from the quickstart. §17.1 governs additions and §17.3 verifies the author experience.

### 5.2 App definition

Apps use TanStack Router file-based routing. `@tanstack/router-plugin` generates `routeTree.gen.ts` from the `routes/` directory; authors write routes as files and nothing else.

```ts
// src/mfe.ts
import { createApp, type AppRouterOptions } from '@company/mfe-react'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

function makeRouter({ basePath, history, context }: AppRouterOptions) {
  return createRouter({
    routeTree,
    basepath: basePath,
    history,
    context: { ...context },
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>
  }
}

export default createApp({
  id: 'operations',
  version: '2.1.0',
  router: makeRouter,
})
```

The App owns its router. The framework supplies the boundary, its constrained history, and the shell context; everything else is the author's. `AppRouterOptions` is the exported type with readonly `basePath: string`, `history: RouterHistory`, and `context: MfeRouterContext` properties, using TanStack's native `RouterHistory` type. The scaffold writes this bootstrap and augmentation for the author. The history belongs to the adapter, is constrained to the assigned App boundary, and is neither `window.history` nor the shell router. Forwarding it is a bootstrap step, not a new navigation API for feature code.

The companion root route uses native context typing:

```tsx
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { MfeRouterContext } from '@company/mfe-react'

export const Route = createRootRouteWithContext<MfeRouterContext>()({
  component: () => <Outlet />,
})
```

The introductory fixture, including these files and generation scripts, must compile against the pinned dependencies from Gate 0 onward. Each independently built App has its own TypeScript program; published Widget contracts must not export an App's `Register` augmentation.

Rules:

- The factory is called once per mount, not once per module. An App mounted twice gets two routers, and disposal drops the router rather than reusing a module-scope singleton.
- The author must pass the supplied `basePath` through unchanged as the native `basepath` option.
- The author must forward the supplied `history` unchanged as the native `history` option. They must not omit it, construct a replacement, or substitute another history. The framework owns its resources and coordination so the shell, nested Apps, and Widgets cannot contend for browser history.
- The author must spread the supplied `context` into the router context. They may add their own keys, preserving the framework-owned `mfe` namespace and the supplied top-level `queryClient` unchanged (§5.4).
- Every other TanStack Router option is the author's, including preloading, scroll restoration, and error and pending components.
- The framework validates these rules at mount. A router built with a different base path fails with `app/invalid-base-path`; an omitted or substituted history fails with `app/invalid-router`. Validate that the native configured history is the exact object supplied to the factory, rather than accepting any object found at `router.history`.

Authors declare the `Register` augmentation using the named factory's return type, without constructing a module-scope router. The scaffold supplies the source; the build plugin does not generate or mutate the augmentation.

The adapter creates its constrained history before invoking the factory. Native `createRouter` receives it at construction, before the router can construct default browser history. Do not construct a default browser history and replace it after the factory returns: releasing it later cannot undo a global History patch made during construction. Gate 0 must prove correct history forwarding, identity validation, cleanup, and construction/mounting without a global History patch against the pinned API. Gate 1 must separately prove browser back/forward, boundary blocking, and nested coordination. A test-owned memory history proves only the in-process contract, not the browser bridge. Do not hide a global patch or leak history setup into feature code.

There is no layout, render, or component option. A layout is a root route with an outlet, which is the native way to express it. **An App is its router.**

The shell router is never passed to the App.

#### 5.2.1 Generated tree, per-mount instance

`routeTree.gen.ts` is a description, not an instance. `createRouter` builds the instance, and `basePath` lives on the router rather than the tree, so one statically imported generated tree backs every mount of that App, including two concurrent mounts at different boundaries. This is the same arrangement TanStack uses for SSR, where one generated tree backs a router per request.

`routeTree.gen.ts` is generated output. It is not checked in, and generation must run before typecheck.

Disposal drops router state only and never touches the tree:

- unsubscribe the router from the framework-owned history;
- remove `router.subscribe` listeners;
- abort in-flight loaders through the mount signal;
- release the router reference.

Already-loaded route chunks stay in the module cache. That is a cache, not mount state, and must not be evicted on disposal.

Route objects hold internal wiring established when a router adopts the tree. Sequential and concurrent mount isolation must be proven against the pinned TanStack version in Gate 1 and retained as regression coverage in Gate 2. Test independent histories, route matches, loader/context state, navigation blockers, and disposal. If shared back-references cause cross-talk, establish a supported way to instantiate an independent tree inside the adapter before proceeding; a shallow clone is not an assumed remedy. Authors retain the same factory contract unless the feasibility proof requires an explicit revision.

`mfePlugin()` composes with `@tanstack/router-plugin`, either by including it or by documenting required ordering (§10.7).

### 5.3 The URL boundary is invisible

`basePath` is supplied to the router factory and then never appears again. Because TanStack Router's `basepath` makes every route definition, `Link`, and `navigate` call relative, App authors write ordinary absolute-looking paths and the framework places them under the assigned boundary:

```tsx
<Link to="/dashboard">Dashboard</Link>   // resolves under the App's boundary
```

There is no `basePath` field on any context, hook, or prop. An App that genuinely needs the literal prefix — to build a URL for an external system, for example — uses the tier-2 accessor:

```ts
import { useBasePath } from '@company/mfe-react'
```

Widgets have no boundary and no access to one.

### 5.4 Shell context

Framework-owned snapshots and services reach native App route callbacks under `context.mfe`. Live shell-state rendering uses the existing field hooks in both Apps and Widgets:

```tsx
import { useUser } from '@company/mfe-react'

function Header() {
  const user = useUser()
  return <Avatar user={user} />
}
```

The framework supplies `mfe.user`, `mfe.groups`, and `mfe.theme` as one immutable snapshot for each native route load/navigation, together with the services listed below. That load's `beforeLoad` and loader callback chain retains the snapshot, including callbacks that begin after an awaited parent resumes. Components subscribe to live shell values with `useUser`, `useGroups`, and `useTheme` (§5.4.4). Both paths use the same mount-bound state source. Native `useRouteContext` and its `select` option remain available for author route context and native match snapshots; reading `context.mfe` through that hook does not subscribe to shell state or promise that an existing match refreshes on a shell-only update. There is no generic `useMfeContext`. Native route selection is documented by [TanStack's useRouteContext API](https://tanstack.com/router/latest/docs/api/router/useRouteContextHook).

`mfe.user`, `mfe.groups`, and `mfe.theme` are data for rendering and UX decisions. They are not an authorization API.

| Router context property | Contract |
|---|---|
| `mfe.user`, `mfe.groups`, `mfe.theme` | Readonly shell-state snapshot selected when the native load/navigation begins and retained by its callback chain; use the corresponding hook for live UI subscriptions |
| `mfe.telemetry` | Stable mount-bound telemetry service (§5.16) |
| `mfe.storage.local`, `mfe.storage.session` | Stable namespaced `MfeStorage` handles (§5.13) |
| `mfe.signal` | Stable mount-disposal `AbortSignal` (§5.14) |
| `queryClient` | The mount's stable native Query client, intentionally top-level (§5.4.2) |

TanStack context is author-defined; these are framework integration keys, not built-in TanStack properties. Reserve only the top-level `mfe` namespace and `queryClient`. Authors may add other top-level keys and extend route context through native `beforeLoad`, including using names such as `user` for their own distinct data. They must not replace or mutate `mfe`, add author fields inside it, or replace the supplied `queryClient`; forwarding the exact supplied values is allowed. New framework capabilities go inside `mfe`, not into new top-level keys. The namespace and its data members are readonly; service methods retain their documented actions.

Type checks and applicable lint/build checks should identify statically detectable replacements. The adapter must diagnose conflicting factory or merged route context as `app/invalid-router`, naming the reserved key and offending route when available, rather than letting a child route silently shadow framework capabilities. Verify enforcement through supported router integration points; do not patch router internals. Author-added keys must survive framework context updates.

Types are supplied for the framework-owned portion:

```ts
import type { MfeRouterContext } from '@company/mfe-react'

type RouterContext = MfeRouterContext
```

#### 5.4.1 Reactive shell state and route snapshots

The shell owns user, groups, and theme. Each mount observes one state source through cached immutable snapshots. `useUser`, `useGroups`, and `useTheme` subscribe to that source and update components immediately when their selected value changes, without remounting the App or requiring author calls to `router.invalidate()`. The adapter updates the router's context for newly started native loads/navigations while preserving author-added top-level keys and the top-level `queryClient`. Each load/navigation selects one immutable `mfe` snapshot and retains it throughout its callback chain; an in-flight load does not switch snapshots when a shell update occurs. A captured snapshot never becomes live, and a child callback that starts after an awaited parent resumes still uses that load's snapshot. Replace a snapshot only when its state changes; preserve unchanged field references and all service handles across updates. An existing native route match may retain its earlier snapshot until its normal route lifecycle updates it.

- Theme-only updates refresh `useTheme` consumers without invalidating unrelated loaders or query caches or restarting in-flight route work. A newly started native load/navigation uses the updated router-context snapshot; callbacks continuing an earlier load retain its earlier theme. Existing native match context need not be republished solely for rendering. A feature whose data depends on theme declares that dependency explicitly through native data APIs.
- User identity, account/tenant, or semantic group changes retire obsolete session-dependent work and persisted state before publishing the new snapshot, then invalidate affected route authorization decisions and loader data through the pinned router's supported APIs. Late results from the previous session cannot repopulate the active view. The mount's Query cache follows §5.4.2 and storage follows §5.13.1. A mere reordering of identical groups is a no-op.
- Token refresh for the same session does not remount Apps or invalidate unrelated data. Fetch obtains current credentials at request time.
- Per-mount subscriptions are removed on disposal. One mount's updates or cleanup cannot detach another mount's subscription.
- A theme-only update preserves the identity of unchanged `user` and `groups` values. A `useUser` or `useGroups` consumer must receive no framework-induced render from that theme update. The adapter must not recreate the router, route tree, author context services, or the entire mounted element tree to propagate shell state.

The shell-state transition fixture must cover hook-driven UI updates, one immutable snapshot per native load/navigation, consistent snapshots across an awaited parent and later child callbacks, updated snapshots in newly started loads/navigations, and intentional session invalidation. The adapter owns the update and invalidation policy; authors do not add synchronization effects. Shell-state reactivity must not be implemented by moving framework state into the Query cache (§12.4).

#### 5.4.2 TanStack Query and server state

TanStack Query is the standard server-state layer. The React adapter creates one stable `QueryClient` per App or Widget mount and installs `QueryClientProvider`. For Apps, `MfeRouterContext.queryClient` is that same instance. Nested and repeated mounts have independent clients by default; they never accidentally inherit a parent's cache. This mount boundary is a framework policy, not a TanStack requirement. Do not recreate clients on rendering, theme changes, or token refresh. See the [stable QueryClient rule](https://tanstack.com/query/latest/docs/eslint/stable-query-client).

The context carries a stable service reference; Query's native hooks supply cache subscriptions. Calling `queryClient.getQueryData()` through either router context or `useQueryClient()` is an imperative read, not a reactive subscription. Components that render server data use `useQuery` or `useSuspenseQuery`. This does not make arbitrary Router context fields live and does not replace the shell-state hooks.

Use native APIs without a parallel framework query abstraction:

- Define reusable typed `queryOptions` factories. Query keys include all variables that determine the response, including tenant or account scope when relevant.
- Route loaders use their context's client and the same options as component hooks, using `ensureQueryData`, prefetching, or suspense according to the intended loading UX. Configure Router preloading to defer freshness decisions to Query for externally cached data; avoid competing caches. Follow [TanStack Router's external data loading guidance](https://tanstack.com/router/latest/docs/guide/external-data-loading).
- Query functions call `#mfe/fetch`, pass the Query cancellation signal, and throw a useful error for unsuccessful HTTP responses. Supplying a client does not automatically authenticate arbitrary query functions. Mutation functions use the same request boundary.
- Set `staleTime` according to data freshness needs, retain useful focus/reconnect behavior, and invalidate relevant keys after mutations. Do not globally disable refetching or retry authorization/validation errors indiscriminately. The starter documents its policy and [TanStack's defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).
- Preserve structural sharing and native tracked-property subscriptions. Use `select` for the data a consumer needs; avoid object-rest destructuring that defeats tracking. Do not copy Query results into Zustand. Follow [TanStack's render optimization guidance](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations).

Identity, tenant, or permissions changes cancel obsolete queries and clear session-sensitive cached data before new-session results render. An internal session generation prevents old results from becoming current even if a request ignores cancellation. Theme changes and same-session token refresh do not reset the cache. Disposal cancels queries and clears the mount's client; already-dispatched server mutations cannot be assumed cancelled or undone. Authors handle mutation idempotency and reconcile on a fresh mount.

Examples must demonstrate cache reuse between a loader and component, cancellation, mutation invalidation, and two concurrent mounts without cache leakage. Client defaults are documented and may be refined through native per-query options; this adds no required quickstart configuration.

#### 5.4.3 Access outside React

Hooks are React conveniences over the same mount-bound services. The router factory receives `AppRouterOptions.context`; native route callbacks receive typed context carrying the snapshot selected for their load/navigation. No hook invocation, global service locator, or separate imperative framework instance is needed. The root route uses `createRootRouteWithContext<MfeRouterContext>()` as shown in §5.2; author extensions use an interface extending `MfeRouterContext`.

```ts
// src/routes/reports.tsx
import { createFileRoute } from '@tanstack/react-router'
import { reportsQueryOptions } from '../queries/reports'

export const Route = createFileRoute('/reports')({
  loader: ({ context }) => {
    context.mfe.telemetry.debug('Loading reports')
    return context.queryClient.ensureQueryData(reportsQueryOptions())
  },
})
```

The query-options helper is ordinary MFE code and must be supplied by the executable fixture. Pass just the needed context service to utilities. Stable services may be captured during router construction; state snapshots must not be captured then for later session-dependent decisions or future loads. Read `context.mfe.user`, groups, and theme from the `beforeLoad` or loader's supplied context so each new load uses its own snapshot. Module-level route definitions remain static. A captured snapshot does not become live after `await`, and callbacks that begin later in the same load retain that snapshot. Identity/permission changes retire the old generation and deliberately invalidate affected work; the session cancellation/stale-result policy in §§5.4.1–5.4.2 prevents obsolete work from being committed.

`useTelemetry()` and `context.mfe.telemetry` expose the same service. `useMfeStorage('local' | 'session')` and the corresponding `context.mfe.storage` member expose the same handle; imperative reads do not subscribe or automatically rerun loaders. `useStoredState` remains the reactive rendering API. `useMfeSignal()` and `context.mfe.signal` expose the same mount signal; a loader uses its native abort controller for navigation-scoped cancellation rather than treating the mount signal as a replacement. Query functions continue to use Query's signal.

Config and authenticated fetch retain their generated imports (`#mfe/config`, `#mfe/fetch`) and are not duplicated in `mfe`. Base path remains a factory option and the tier-2 hook described in §5.3. Command registration and breadcrumb overrides keep their documented lifecycle-aware hooks and declarative route contracts; they do not gain arbitrary context mutators. Widgets keep their hooks and never receive an App router context. See [TanStack's router context guidance](https://tanstack.com/router/latest/docs/guide/router-context).

#### 5.4.4 Shell-state hooks for Apps and Widgets

Provide `useUser()`, `useGroups()`, and `useTheme()` from `@company/mfe-react` in both Apps and Widgets. Each returns the corresponding readonly shell value and subscribes only to that field. Each accepts an optional selector to narrow the subscription further. Preserve inference and use `Object.is` for selected results; aggregate selections must preserve references rather than imply arbitrary deep equality.

```tsx
import { useUser } from '@company/mfe-react'

function AccountIndicator() {
  const signedIn = useUser(user => user != null)
  return <span>{signedIn ? 'Signed in' : 'Signed out'}</span>
}
```

The hook types are derived from the same shell-value contracts as router context. These hooks observe the source that supplies `context.mfe.user`, groups, and theme snapshots, without depending on an App router or inheriting an embedding App's router context. Apps and Widgets receive the provider automatically through their own mount. Native `useRouteContext` remains available to App components for native route context; it is not the live shell-state subscription API. A theme change must not notify a user-only or group-only consumer. Readonly values do not become an authorization API; shell identity/group transitions follow §5.4.1 for both mount kinds. No generic `useMfeContext` is introduced.

### 5.5 Assets

Assets are a build concern. The normal path is an ordinary import:

```tsx
import logoUrl from './logo.svg'

<img src={logoUrl} alt="Operations" />
```

The plugin emits the asset and rewrites the import to its hashed container-relative URL. For files in a static directory, use the web standard:

```ts
const url = new URL('./icons/thing.svg', import.meta.url).href
```

The plugin resolves it against the deployed container's asset base. CSS `url(...)` references receive the same treatment during the build.

There is no asset resolver on any context and no asset hook. A bare relative reference such as `./assets/logo.svg` in a template string is not container-aware and must not be used; the plugin reports it as a build diagnostic where it can be detected statically.

Absolute external URLs remain ordinary application URLs and are not rewritten.

### 5.6 Widget definition

Widgets declare their contract as schemas. The schemas are the source of truth for runtime validation and for author-facing types; there are no separate type parameters to keep in sync.

```tsx
// src/mfe.tsx (JSX entry; discovered as an alternative to src/mfe.ts)
import { createWidget } from '@company/mfe-react'
import { z } from 'zod'

export const alertPanelContract = {
  inputs: z.object({ alertId: z.string() }),
  events: { acknowledged: z.object({ alertId: z.string() }) },
}

export const alertPanel = createWidget({
  id: 'alert-panel',
  version: '1.4.0',
  ...alertPanelContract,
  render: function AlertPanel({ inputs, emit }) {
    return (
      <button onClick={() => emit('acknowledged', { alertId: inputs.alertId })}>
        Acknowledge
      </button>
    )
  },
})
```

`inputs` and `emit` are typed from the schemas. Authors do not annotate the render props.

Widgets do not declare routes, do not receive a base path, do not own a router, and must not call navigation APIs to change browser history. A host may place a Widget inside a route, modal, panel, or page, but the host owns that placement and any URL behavior.

### 5.7 Consuming a Widget

A consumer uses what looks like an ordinary lazy component. Inputs are props; events are `onX` props.

```tsx
import { lazyWidget } from '@company/mfe-react'
import { alertPanelContract } from '@company/contracts/alert-panel'

const AlertPanel = lazyWidget('alert-panel', { contract: alertPanelContract })

<AlertPanel
  alertId={id}
  onAcknowledged={event => acknowledge(event.alertId)}
/>
```

The runtime contract argument is optional; when provided, both prop and handler types are inferred from its schemas. A type-only import or generic argument cannot supply runtime validation. Without a contract, inputs are `Record<string, unknown>`, event payloads are `unknown`, and consumer-side event validation is unavailable; provider-side input and emit validation still apply. This weaker mode is explicit in the documentation and diagnostics metadata.

A consumer may define its own module-scoped contract instead of importing a published package. That contract may include only the events and fields it consumes. No provider-source import or coordinated container build is required.

`lazyWidget` is called at module scope so the component identity is stable. Input props update the existing mount. Event handlers always use the latest committed callbacks without resubscribing the remote channel on every render.

Contract discovery rejects input names `key`, `ref`, `fallback`, and names beginning with `on` followed by an uppercase letter, which are reserved for host control and event handlers. Events use lower-camel-case names and map to `on` plus an uppercase first character. Duplicate or colliding generated handler names are build errors with a rename suggestion. Reserved control props are never forwarded as inputs.

Failure and loading states use the standard React mechanisms — `Suspense` and error boundaries — or the `fallback` prop (§7.2) for an inline surface with retry.

### 5.8 Contract validation

#### Model

Contracts are validated at the provider boundary and, when a consumer supplies a runtime contract, at the consumer boundary. Providers also validate emitted payloads at the call site:

| Direction | Validated by | Against |
|---|---|---|
| Inputs arriving at the Widget | provider | the Widget's `inputs` schema |
| Event payload leaving the Widget | provider | the Widget's `events` schema, at the `emit` call |
| Event arriving at the consumer | consumer, when a runtime contract is supplied | the consumer's declared event schema |

There is no runtime schema introspection endpoint and no requirement to import another container's source. A provider may publish an independently versioned contracts package containing runtime schemas and inferred types. Each consumer chooses a package version or declares its own tolerant contract, then compiles those schemas into its own build. Provider and consumer deployments remain independent; provider schemas validate incoming inputs and emitted events, while the consumer's chosen schemas validate its subscribed events.

Inputs are reactive and are validated on first mount and whenever an input prop changes. Handler-only changes do not revalidate inputs. A successful update publishes one validated snapshot to the existing mount, preserving component state, router-independent subscriptions, and scope roots. The provider must not assume inputs are immutable for the lifetime of a mount. Inputs are treated as immutable values: consumers replace changed values rather than mutating objects in place. Ordinary rerenders with unchanged input values must not cause remounting or channel registration churn.

Compare input prop sets shallowly by name and `Object.is` value before validating; changes to event callbacks or host `fallback` are outside this input comparison. The generated Widget boundary suppresses remote render work when inputs are unchanged, while keeping the latest committed callbacks available to event delivery. A changed input may rerender its Widget, but not sibling mounts with unchanged inputs. Newly allocated object inputs count as changes: the framework does not deep-compare arbitrary payloads. Document immutable object reuse for expensive payloads without requiring memoization of primitive inputs or event callbacks.

#### Tolerant readers

Consumer contracts declare only the fields the consumer uses and must not call `.strict()`. Zod's default object behavior strips unknown keys, which is the required behavior: a Widget adding a field must not break its existing consumers.

Schemas and consumer contract objects must be created at module scope, including locally declared contracts. Schema identity is stable for the lifetime of a lazy component definition. The framework does not compare arbitrary Zod schemas by shape or require authors to memoize contracts inside rendering.

#### Serializable values only

Inputs and event payloads must be JSON-serializable. Functions, class instances, DOM nodes, React elements, `Date`, `Map`, and `Set` are not permitted. Validation cannot meaningfully check them, and prohibiting them keeps iframe or worker isolation available later. A consumer that needs a callback subscribes to an event instead.

#### Failure behavior

| Failure | Behavior |
|---|---|
| Input invalid on first mount | Mount transitions to `error`. The host's fallback renders. Explicit `retry()` validates the latest supplied inputs. |
| Input invalid on update | The update is rejected. The last valid inputs stay rendered and the mount stays `mounted`. The host receives a structured error. |
| Emit payload invalid | Throws at the author's `emit` call, so the failure surfaces in the provider's own stack rather than at a distant consumer. |
| Arriving event invalid | The event is dropped and the handler is not called. A structured error is reported. The mount is unaffected. |

Every structured contract error contains the definition `id`, the `version` where declared, the direction, the field path, and the operation. The framework must not silently coerce invalid values or return a success-shaped fallback.

#### Drift detection

Because tolerant readers make additive change invisible, the only signal of a breaking change is a validation failure at runtime. The host must expose validation failures through a diagnostics sink that the shell wires to production monitoring. Logging alone is insufficient: a dropped event is silent by design, and nobody reads logs until they already suspect a problem.

### 5.9 Nested Apps

**Apps take URLs. Widgets take props.**

An App owns a URL boundary, so per-instance data a parent supplies belongs in child-owned URL segments or declared search params. A parameter inside the parent-owned mount prefix is not automatically a parameter in the child router. State passed as an input does not survive a refresh, cannot be bookmarked, and cannot be shared, which defeats the purpose of being routable. Apps therefore have no inputs, no events, and no contract schemas. Contract validation (§5.8) is a Widget-only concept.

Anything that cannot be expressed as a URL is not an App. It is a Widget.

A parent delegates to a child App at a splat route, so the boundary is visible in the filename rather than derived implicitly from the active route:

```tsx
// routes/reports.$.tsx
import { mfeRoute } from '@company/mfe-react'

export const Route = createFileRoute('/reports/$')(
  mfeRoute({ appId: 'reports' }),
)
```

The child receives everything below `/reports` as its boundary. Because this is an ordinary route, the child App loads through native route-level code splitting, and `defaultPreload: 'intent'` preloads the child's manifest on hover without extra work.

Per-instance data reaches the child through its own URL contract. For example, the child declares `/accounts/$accountId` in its own route tree and reads `Route.useParams().accountId`. Mounted at `/reports`, that route appears as `/reports/accounts/42`; mounted at `/workspace/reports`, it appears as `/workspace/reports/accounts/42`.

```tsx
// Child App: src/routes/accounts.$accountId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/accounts/$accountId')({
  component: AccountReport,
})

function AccountReport() {
  const { accountId } = Route.useParams()
  return <div>Reports for account {accountId}</div>
}
```

A parent may instead use the child's documented search parameters; the child declares native search validation. A parent route such as `/accounts/$accountId/reports/$` cannot make its own `accountId` visible to the child implicitly. If that placement is required, the parent explicitly includes the value in the child's documented search parameters and keeps it current through ordinary navigation. The child never parses the mount prefix to obtain business data.

Changes to child-owned path or search parameters use native route transitions and cancel superseded loader work without recreating the App mount. A change to the assigned mount boundary, definition ID, or React placement key disposes the old mount and creates a new one. The child author uses the same URL contract whether top-level or nested.

`AppHost` remains for shell-owned imperative placement, such as opening an App inside a shell-owned modal:

```tsx
<AppHost appId="reports" basePath="/reports" />
```

It is the escape hatch, not the normal author path. The imperative form is `loadApp('reports', { basePath })`.

#### 5.9.1 How Apps load

Apps load like routes; Widgets load like components. Each follows its native analogue:

| | Declared as | Loads via | Preloads with |
|---|---|---|---|
| App | a route (`mfeRoute`) | route-level code splitting | `defaultPreload` |
| Widget | a component (`lazyWidget`) | `React.lazy` / Suspense | consumer-triggered |

There is no separate MFE loading model for either. The MF2 resolution underneath (§11) is invisible to both.

### 5.10 Capabilities

Settings, help, and release notes are pages, so they are routes. Authors write an ordinary route and mark it:

```tsx
// routes/settings.tsx
export const Route = createFileRoute('/settings')({
  staticData: {
    capability: 'settings',
    label: 'Settings',
    icon: 'settings',
  },
  component: Settings,
})
```

The plugin extracts marked routes statically into the manifest at build time. Lazy loading is native route code-splitting; there is no separate capability loader and no `load()` field.

The three capability names are App-only: `settings`, `help`, `releaseNotes`. An App opts out by not marking a route. Widgets cannot advertise them.

The shell owns placement. Opening a capability navigates the App to that route, which may be inside a shell-owned container such as a modal or panel.

#### Icons

```ts
type CapabilityIcon = IconName | { readonly src: string }
```

`IconName` is the shell icon set's exported name union, so a typo is a build error.

Capability metadata carries an icon **name**, never SVG markup. The metadata is fetched for discovery and must stay small; author-supplied markup injected into shell DOM is an injection risk; and inlined SVG ignores shell sizing, colour, and stroke width. The shell renders the named icon from its own set and owns those properties. An unrecognized name renders a documented default and reports a diagnostic.

For a mark the shell set lacks, an App supplies an asset URL (`{ src }`), which renders in an `<img>` and never enters shell DOM as markup. That is the escape hatch, not the normal path.

### 5.11 Commands

```tsx
import { useCommand, allow, deny } from '@company/mfe-react'

function OperationsToolbar() {
  useCommand({
    name: 'refresh',
    label: 'Refresh data',
    placements: ['command-palette'],
    canExecute: () => (hasData ? allow() : deny('No data loaded yet')),
    execute: () => refresh(),
  })
}
```

Registration is a hook, so mount scoping is a consequence of component lifetime rather than a rule the author must follow. There is no registry object to acquire and no disposer to return.

One hook instance owns one registration. Changes to `label`, `placements`, `canExecute`, or `execute` update that registration after the React commit without removing and recreating it. The palette reevaluates availability when the registration updates and when it opens; execution rechecks the latest committed `canExecute` and invokes the latest committed `execute`. Inline callbacks work without `useCallback`. An abandoned render must not publish callbacks or execute anything. Changing `name` replaces the local registration, with duplicate-name validation. Strict Mode setup/cleanup leaves exactly one active registration and unmount removes it.

`canExecute` is a pure synchronous read of reactive state captured by the component. Changes in an unrelated mutable global are not observable automatically; subscribe through React state or the appropriate hook before registering the command. The framework does not poll arbitrary closures.

Replacing `execute` or `canExecute` closure identity does not by itself change the public palette snapshot. Evaluate the changed registration's decision, compare its label, placements, allowed state, and reason, and notify only if visible state changed. Unchanged command entries retain their references. Updating one command does not reevaluate all other commands; opening the palette may evaluate all entries, and execution always rechecks the selected entry. No registration update may trigger a feedback loop into the registering component.

```ts
interface CommandRegistration {
  readonly name: string
  readonly label: string
  readonly execute: () => void | Promise<void>
  readonly canExecute?: () => Decision
  readonly placements?: readonly CommandPlacement[]
}

type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string }
```

`execute` takes no argument. There is no invocation context to supply, and an `unknown` parameter would only force casts.

`canExecute` returns a `Decision` only, so hosts handle one shape. `allow()` and `deny(reason)` keep registration a single line.

`label` is required. Authors provide a local `name`; the runtime qualifies it internally as `appId:commandName` or `widgetId:commandName`. Duplicate local names within one mount are rejected rather than overwritten.

The runtime evaluates `canExecute` for palette visibility and again immediately before `execute`. If the second evaluation denies, the runtime does not call `execute`, surfaces the `reason` through the shell's normal notification surface, and updates the entry's state. It must not run the command and must not fail silently.

Commands from an unloaded or disposed definition are unavailable. `canExecute` controls palette visibility and last-mile UX only; the host and backend remain responsible for authorization. Only `command-palette` is standardized. Future placements add placement descriptors to this model rather than a second registration API.

### 5.12 Breadcrumbs

Breadcrumb composition is automatic. The adapter reads the active TanStack Router match tree and composes parent-to-child contributions. Authors do not create route wrappers to contribute a breadcrumb.

```ts
type BreadcrumbItem = {
  readonly key: string
  readonly label: string
  readonly href?: string
  readonly current?: boolean
}
```

The identifier field is `key`. `id` is reserved for definition identity (§4.2) and is not overloaded.

Label resolution order:

1. An explicit `staticData.breadcrumb` string, or the active App-level `useBreadcrumbs` override.
2. The title metadata returned by the route's native `head` function.
3. A humanized static path segment.
4. A humanized named dynamic parameter other than generic `$id`.

For example, `staticData: { breadcrumb: 'Asset reports' }` gives an explicit label. The framework does not infer labels from arbitrary loader object fields. Dynamic route labels can use title metadata derived from loader data in native `head`; the adapter observes the resulting route metadata updates. Framework type augmentation supplies the documented `staticData` fields and is included in the scaffold.

Pathless, layout, and index routes contribute nothing. `staticData: { breadcrumb: false }` hides one route segment while descendants may still contribute. Generic `$id` parameters are omitted rather than rendered raw.

An App opts out of its own contribution with `breadcrumbs: false` on `createApp`. That does not disable contributions from nested child Apps.

For non-route flows such as a wizard, one hook overrides:

```ts
useBreadcrumbs([
  { key: 'step-1', label: 'Choose source' },
  { key: 'step-2', label: 'Review', current: true },
])
```

Rules:

- The override replaces only the contributing App's own portion of the trail. Shell ancestors and nested child contributions are unaffected.
- The override updates after each committed change to its items, without unregistering on ordinary rerenders. Items are immutable values; authors need not memoize the array.
- The override is cleared when the hook unmounts and on any navigation within the App, so a wizard cannot leak its steps. An override is bound to the navigation at which its hook mounted; a persistent old hook cannot reinstall its previous contribution after navigation. A new wizard instance establishes a new override; the framework must not remount the App to clear breadcrumbs.
- Only one override may be active per App mount; competing overrides produce an explicit diagnostic rather than order-dependent results.
- Widgets have no breadcrumb contract.
- Compare breadcrumb records by `key`, `label`, `href`, and `current`. An inline array containing unchanged records is a no-op for shell subscribers. Preserve unchanged records and avoid publishing a new composed trail for unrelated router state such as fetch status.

The shell renders the composed result in its header. Runtime configuration may disable the global breadcrumb landmark; that does not change App-local route state.

### 5.13 Browser storage

The normal React API returns a subscribed value and a stable setter:

```tsx
import { useStoredState } from '@company/mfe-react'
import { z } from 'zod'

const densitySchema = z.enum(['comfortable', 'compact'])

function DensityControl() {
  const [density, setDensity] = useStoredState(
    'table-density',
    densitySchema,
    { defaultValue: 'comfortable', retention: 'preference' },
  )

  return (
    <button onClick={() => setDensity(
      current => current === 'compact' ? 'comfortable' : 'compact',
    )}>
      Density: {density}
    </button>
  )
}
```

```ts
interface StorageKeyOptions<T> {
  readonly retention?: 'session' | 'preference'
  readonly version?: number
  readonly migrate?: (value: unknown, fromVersion: number) => T
}

function useStoredState<T>(
  name: string,
  schema: z.ZodType<T>,
  options: StorageKeyOptions<T> & {
    readonly defaultValue: T
    readonly storage?: 'local' | 'session'
  },
): readonly [T, (next: T | ((current: T) => T)) => void]
```

Rules:

- Storage defaults to `local`. Keys are scoped by definition `id`, stored as `<id>:<key>`, and shared by mounts of that same definition. IDs are globally unique across Apps and Widgets (§4.2). Storage keys and values are never scoped by mount token.
- The schema is declared at module scope. The default is schema-validated and applies only to a missing key; reading a default does not persist it. It is not a fallback for invalid JSON, unavailable storage, or a schema mismatch.
- Reads and writes are validated. Setters resolve functional updates against the latest valid stored value, validate before writing, and publish the committed value to all same-document subscribers for that ID/store/key. Failed writes leave the stored value unchanged and throw a structured storage error at the setter call; diagnostics receive the error too.
- Local-storage subscribers observe browser storage events from other tabs of the same origin. Session-storage notifications follow browser session-storage visibility; independent tabs are not promised synchronization. There is no cross-tab transaction or compare-and-swap guarantee.
- Remove and clear operations notify affected subscribers; missing values return each subscriber's declared default. Each key has one documented schema/default contract. Conflicting declarations among active consumers fail explicitly, not by whichever hook rendered first.
- Snapshots and setter identity remain stable while their value and key binding are unchanged. The implementation prevents missed updates between rendering and subscribing, duplicate Strict Mode listeners, and notifications after unmount. Changing the key or store cleans up the old subscription and reads the new binding.
- Subscriptions are scoped to the exact ID/store/key, not all browser storage or all mounts. Parse and validate a changed stored representation once per active key/schema binding, cache its snapshot, and reuse it across subscribers. Unchanged serialized values are no-ops for notifications. Do not serialize, parse, or access browser storage in every `getSnapshot` call. Native events that affect other keys are ignored; a store-wide clear only checks active keys in that store.
- Store independently updated preferences under separate keys. A subscriber to a whole object-valued key intentionally observes that whole value; the API does not promise automatic field-level dependency tracking inside arbitrary objects.
- Invalid externally changed values and read failures publish an error snapshot and raise a structured error on the next read/render; they do not masquerade as missing data or silently use the default. Recovery may explicitly remove or migrate the stored value, then reset the error boundary.

The tier-2 `useMfeStorage('local' | 'session')` accessor remains for imperative reads, migrations, and explicit removal. App route code uses the same handles at `context.mfe.storage.local` or `.session` (§5.4.3). These are imperative handles, not reactive values; calling `get()` does not subscribe. Components rendering stored state use `useStoredState`.

```ts
interface MfeStorageKey<T> {
  get(): T | null
  set(value: T): void
  remove(): void
}

interface MfeStorage {
  key<T>(name: string, schema: z.ZodType<T>, options?: StorageKeyOptions<T>): MfeStorageKey<T>
  remove(name: string): void
  clear(): void
}
```

A bound handle is stable for its ID, store, key, and schema. Imperative writes/removes/clears use the same validated store and notify reactive subscribers. `get()` returns `null` only for a missing key. `clear()` removes only the exact `<id>:` prefix and affects every mount of that definition. A Widget uses its own ID.

Unavailable storage, malformed JSON, schema failures, quota failures, and browser access errors produce structured storage errors. No silent switch to another store or in-memory fallback is allowed. Authors use these APIs rather than raw browser storage for MFE state. Storage is not a security boundary, must not hold secrets, and must never hold an access token.

#### 5.13.1 Retention and schema changes

`storage` selects the browser's local or session store; `retention` independently selects data lifetime. Default retention is `session`: invalidate the value on logout, sign-in as another principal, account/tenant switching, or a semantic group/permission change. Group changes count even if the user ID is unchanged; reordering an identical group set does not. Token refresh and theme changes do not invalidate it. Explicit `retention: 'preference'` is limited to non-sensitive, identity-independent choices such as table density; it survives those transitions. User drafts, scoped filters containing account data, and permission-dependent values must use session retention.

Keep physical keys under `<id>:<key>`. Store internal version/retention and opaque session/access-generation metadata alongside the validated payload in a framework envelope. The shell supplies a stable generation for a continuous session across reloads and changes it on the transitions above. It must be established before reading session-retained values. Do not persist tokens or raw group lists in that metadata. Returning to an earlier user/group configuration must not resurrect an invalidated generation.

On a transition, retire old in-memory snapshots before publishing new-session state, invalidate persisted session records even for currently unmounted definitions, and notify active subscribers of missing/reset values using their declared defaults. Preserve preference records. Reject late framework-managed migration/write commits from a retired generation; late cross-tab records from it must not restore old data. Physical deletion is attempted for obsolete records, while generation validation prevents their use even if deletion fails. Storage failures remain observable; this is not an in-memory fallback. No operation may clear unrelated shell or third-party storage. The shell's session transition signal coordinates open tabs.

`version` defaults to 1 and must increase when the persisted representation requires migration. `migrate` is an explicit synchronous, side-effect-free conversion from a known older version to the current schema; declare it at module scope with the schema. Parse old input as unknown, run the conversion, validate the result, then replace the envelope only after successful validation and a current-generation check. Preserve the previous record and raise `storage/failure` on migration failure. Unknown future versions, unsupported old versions, or unversioned records without an explicit migration fail visibly rather than being overwritten or defaulted. Never migrate a retired session's data into a new one.

Active declarations for a key must agree on schema/default, retention, and version. Conversion is coordinated per active key in a document, not repeated for each subscriber; browser storage is not a cross-tab transactional database. Apps needing concurrent durable drafts should use their backend. Document a migration fixture and a deliberate reset path; no automatic schema guessing or silent data loss.

### 5.14 Cancellation

TanStack Router supplies an abort signal to loaders, which covers most cancellation. For background work started outside a loader:

```ts
import { useMfeSignal } from '@company/mfe-react'
```

The signal aborts on disposal. Non-React App code accesses the same signal through `context.mfe.signal`; it does not replace the router's per-loader cancellation signal (§5.4.3).

### 5.15 Widget page-level affordances

A Widget renders inside its own scope root and may not reach outside it. Specifically:

- **Overlays and modals** use the adapter-created portal root for that mount. The framework provides it; authors do not pass portal targets.
- **Toasts** are rendered by a `Toaster` the Widget mounts inside its own scoped tree, or are raised through an event the host handles. The shell may mount a separate global `Toaster`.
- **Document title, meta, and favicon** are App-only, set through native route `head`. A Widget must not mutate them.
- **Global keyboard shortcuts** are commands (§5.11), not document-level listeners.

### 5.16 Provider-neutral telemetry

Apps and Widgets send telemetry through a framework-owned contract with no author setup. They do not import OpenTelemetry (OTel) or Faro, configure exporters, or know which monitoring provider the shell uses. The framework supplies its own types, constants, documentation, and versioned public contract.

#### 5.16.1 Author surface

```ts
type TelemetryAttributes = Readonly<Record<string, string | number | boolean>>

interface MfeTelemetry {
  event(name: string, attributes?: TelemetryAttributes): void
  debug(message: string, attributes?: TelemetryAttributes): void
  info(message: string, attributes?: TelemetryAttributes): void
  warn(message: string, attributes?: TelemetryAttributes): void
  error(error: unknown, attributes?: TelemetryAttributes): void
  measure(
    name: string,
    value: number,
    options: { unit: 'ms' | 'bytes' | 'count'; attributes?: TelemetryAttributes },
  ): void
  readonly tracer: Tracer
}
```

`Tracer` above is a framework-owned type. `event()` records a business event; `debug`, `info`, and `warn` record structured diagnostics at the named level. The shell controls level filtering, including debug collection. `error()` reports an error without throwing or handling it. `measure()` records one finite numeric observation with its unit, not an incrementing counter or a persistent gauge. Its attributes are optional. Use stable names and small descriptive attributes rather than embedding IDs or arbitrary values in event/measurement names.

React components use `useTelemetry()` from `@company/mfe-react`; App loaders and `beforeLoad` use `context.mfe.telemetry`. `MfeRouterContext` includes the same bound service under `mfe`. Pass that service explicitly to non-React utilities. The service, its actions, and `tracer` remain stable for the mount lifetime. These are imperative actions, not reactive subscriptions, and emitting telemetry cannot cause a component rerender. Emit from actions, loaders, callbacks, or effects with deliberate lifecycle semantics, never during rendering.

```tsx
import { useTelemetry } from '@company/mfe-react'

const telemetry = useTelemetry()

function reportExport(rowCount: number, elapsedMs: number) {
  telemetry.event('report.exported', { rowCount })
  telemetry.measure('report.export.duration', elapsedMs, { unit: 'ms' })
}
```

#### 5.16.2 Tracing contract

`telemetry.tracer` follows OTel tracing conventions for the supported surface: span creation through `startSpan` and `startActiveSpan`, attributes and span events, status and exception recording, and explicit `end()`. Framework-owned `Tracer`, `Span`, and related option/status types and constants such as `SpanStatusCode` and `SpanKind` are available from `@company/mfe-react`. The neutral definitions live in `@company/mfe-core`. Author documentation explains these methods without requiring knowledge of OTel or Faro; it documents the supported surface rather than claiming to expose every upstream API.

Do not re-export or alias upstream OTel types/constants in published framework declarations. The supported signatures, constants, and semantics belong to the framework; the shell adapter translates them internally. Generated declarations and author bundles must not require `@opentelemetry/*` or `@grafana/faro-*` imports or installations. The framework's own constants are runtime values; exporting them does not introduce a vendor dependency.

```tsx
import { useTelemetry, SpanStatusCode } from '@company/mfe-react'

const { tracer } = useTelemetry()

async function handleExport() {
  const span = tracer.startSpan('report.export')

  try {
    const report = await exportReport()
    span.setAttribute('report.row_count', report.rowCount)
    return report
  } catch (error) {
    if (error instanceof Error) span.recordException(error)
    span.setStatus({ code: SpanStatusCode.ERROR })
    throw error
  } finally {
    span.end()
  }
}
```

The example measures the operation's lifetime; `startSpan()` does not make it active or automatically parent its requests. `startActiveSpan()` executes a callback under a span context but does not automatically end the span or record a thrown exception. Authors end manually created spans and record failures as shown, including `try/finally` in asynchronous callbacks. Preserve callback return types, synchronous throws, and asynchronous results/rejections. Span events are diagnostic milestones within a span; `telemetry.event()` remains a separate business event.

Repeated `end()` calls are harmless. Disposal finishes any outstanding mount-owned spans with cancellation attribution, without treating cancellation as a failure, and releases references. New span creation after disposal or when tracing is disabled returns a non-recording handle; callback-based APIs still invoke application callbacks exactly once. Already-ended spans cannot accept further changes. Development diagnostics identify leaked spans, and bounded tracking prevents forgotten spans from growing memory indefinitely.

There are no framework-level `time()`, `trace()`, `startTrace()`, `fail()`, or `cancel()` convenience methods. Earlier proposals for those methods are superseded by `tracer`. Do not export raw providers, SDK configuration, global registration, exporters, or flush controls to MFEs.

#### 5.16.3 Shell integration and correlation

The neutral core owns telemetry/tracing contracts, normalized records, and the provider integration seam. The host binds definition ID, version/build metadata, and internal mount attribution automatically; authors cannot override reserved attribution. The shell supplies its provider before mounting remotes and owns identity/session enrichment. Replacing that provider must require no MFE source change.

OTel is used inside the shell adapter to implement tracing and context propagation; Faro is the selected shell telemetry/export integration. Initialize a single coordinated SDK/provider configuration for the page. Neither library belongs in framework runtime packages or MFE bundles. The shell adapter maps framework types, statuses, exceptions, attributes, and span lifecycles to its implementation. See [Faro's OTel integration](https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-applications/frontend-observability/instrument/opentelemetry-js/).

Correlate logs, business events, and measurements with a trace only when a valid operation context is available. Do not keep a manually started span globally active until it ends or guess parentage from the most recently started span. Route loads, Query operations, authenticated requests, parallel promises, and overlapping MFE mounts must retain correct isolation. Browser async context propagation across `await` is an implementation gate, not a guarantee supplied by callback syntax. Verify the supported paths with real builds before claiming automatic correlation; revise the integration if it fails rather than silently creating wrong parent relationships.

Request tracing and propagation belong at the existing authenticated-fetch boundary. Send standard trace headers only to shell-approved destinations, coordinate CORS with those backends, and keep the tracing allowlist distinct from authorization policy. Backend continuation also requires compatible server instrumentation. Preserve cancellation and auth retry behavior; exclude telemetry transport from recursively instrumenting itself. The integration must respect the existing ban on new global fetch/History/event-listener patches; do not enable an SDK's default auto-instrumentation blindly. Framework-managed operations may be instrumented automatically without requiring every application function to create a span.

#### 5.16.4 Delivery, safety, and testing

The shell owns redaction, sampling, rate limits, batching, delivery, and bounded buffering. Attributes are small scalar values; credentials, request bodies, personal data, and raw URL/query-string values are not automatically collected by this API. Route attribution uses a safe route identifier/template. Bound attribute counts/string lengths and error normalization; ignore invalid non-finite measurements with a development diagnostic. Apply equivalent limits to tracing inputs. Telemetry calls never await network I/O or throw transport failures into feature code; application errors thrown from tracing callbacks still propagate unchanged. Sink failure and overflow have a bounded local diagnostic/drop counter, without recursively reporting themselves. This explicit best-effort delivery policy provides no delivery guarantee and does not suppress framework lifecycle or validation errors.

Framework lifecycle diagnostics and author telemetry enter the same provider integration with distinct record kinds. Deduplicate framework-reported errors against shell automatic capture and span exception recording without losing span failure status. Authors should not manually report an error already captured at its owning boundary. Mount-bound handles stop accepting new records after disposal, apart from teardown finalization of open spans; previously accepted records retain their original attribution.

A recording test provider exposes emitted records and span lifecycles without a monitoring account or vendor setup. Test the API through framework imports, including an alternative provider to prove independence. Add declaration-consumption and bundle checks proving that authors do not resolve vendor packages. Trace fixtures cover explicit completion, failure, disposal, non-recording behavior, callback execution and results, nested/parallel operations, cross-mount isolation, and async request correlation. Run the DX examples for a route load, mutation, and export with parallel requests alongside render/performance checks.

### 5.17 MFE state, forms, and tables

Use React local state for simple UI state. Zustand is supported for MFE-owned client state that needs a store. Create stores for the mount lifetime through an MFE-owned provider/factory; a module singleton must not leak state between concurrent mounts. Subscribe to the fields the consumer needs, preserve unchanged values, and clean up mount-owned resources. URL state belongs in TanStack Router; server state belongs in TanStack Query. Cross-MFE communication stays within the framework contracts. Persisted Zustand state must use the validated framework storage boundary rather than raw storage middleware.

Use `@tanstack/react-form` for forms and `@tanstack/react-table` for tables, with Tecton presentation components. Keep their native APIs visible; provide focused recipes rather than a second form/table framework. Install them when the feature needs them, rather than adding unused runtime dependencies to every starter.

Form recipes use field-level subscriptions and narrowly selected form subscriptions; typing in one field must not rerender unrelated fields. Table recipes preserve stable data/column references, subscribe only to required state, and use server-side pagination/filtering or virtualization when dataset size warrants it. Verify behavior and React Compiler compatibility against pinned releases; apply narrow documented exceptions under §10.9 when needed. See [TanStack Form](https://tanstack.com/form/latest/docs/overview) and [TanStack Table data guidance](https://tanstack.com/table/latest/docs/guide/data).

Framework implementation state follows §12.4 and does not use Zustand or another general state-management library.

## 6. Navigation and base paths

### 6.1 URL ownership

The shell owns the outermost route and assigns each top-level App a boundary. The App owns all routes below that prefix. An App may be top-level or nested; the child contract does not change.

The framework must not expose the shell's router or `window.history` to remote code. The router factory receives only the adapter's constrained boundary history for forwarding to native `createRouter` (§5.2); feature code navigates through the App's own router. The neutral core is router independent.

### 6.2 Explicit shell boundary bridge

The shell may use a narrow internal navigation bridge for coordination at an App boundary, providing read, subscribe, push, replace, back, forward, and reload. It must not be implemented as a global History API patch and is not part of the author API.

Local App navigation uses the App's own router. Browser back and forward are handled by the shell and App routers through their public APIs. Widgets have no navigation contract.

The current shell calls `patchHistoryApiToSyncRouters()` from `apps/shell/src/main.ts`, which replaces `window.history.pushState` and `replaceState` and emits synthetic `popstate` events. This global patch must be removed and replaced by the explicit bridge.

The adjacent global `addEventListener`/`removeEventListener` patch in `can-deactivate-mfe-app.guard.ts` tracks `beforeunload`. That is separate shell-safety work, to be replaced with an explicit before-unload registration service. It must not be used as a reason to reintroduce History patching.

### 6.3 Navigation modes

New Apps default to App-owned navigation. The legacy adapter explicitly declares shell-owned navigation. The shell owns top-level placement and global surfaces regardless of an App's local mode.

### 6.4 Native navigation blocking

App authors use TanStack Router's native blocking API, including `useBlocker` from `@tanstack/react-router`, with no framework-specific blocking hook or duplicate registration. The framework supplies the bridge mechanism; the MFE decides whether to block and what UI to display. Native resolver behavior, including proceed/reset, remains available. Follow the pinned [TanStack navigation-blocking API](https://tanstack.com/router/latest/docs/guide/navigation-blocking).

```tsx
const { status, proceed, reset } = useBlocker({
  shouldBlockFn: () => formIsDirty,
  withResolver: true,
  enableBeforeUnload: formIsDirty,
})
// The MFE renders its chosen UI when status === 'blocked'.
// Its controls invoke proceed() or reset().
```

The boundary bridge must honor native blockers for App-local navigation, shell links that leave the boundary, nested-App removal caused by navigation, and browser back/forward. Keep the affected MFE mounted while its blocker resolves so its UI remains usable. Cancel leaves the current UI and route intact; proceed commits the requested transition once without invoking the same blocker again through the bridge. Evaluate affected mounts in a deterministic order, innermost first, stop on rejection, and prevent simultaneous confirmation flows for one navigation. Separate MFEs may each own a distinct blocker; the shell must not impose a shared confirmation dialog or merge their messages.

Do not fabricate child-local routes for destinations outside an App's boundary. Gate 1 must prove how the pinned native blocker can participate in boundary exit, including supported current/next-location semantics. If the supported router/history APIs cannot provide this behavior, resolve the adapter/contract limitation before expansion; do not substitute a framework hook, patch router internals, or expose the shell router.

For document unload/reload, browsers control the available confirmation UI and may not guarantee a prompt; no custom unload dialog is promised. Retain native `enableBeforeUnload` behavior through the explicit shell-safety integration. Forced cleanup after session revocation, failure, or explicit host disposal is not a user navigation transaction and cannot be vetoed indefinitely. Ordinary user navigation must finish blocker negotiation before calling disposal. Mount/disposal timeouts do not act as a timer on a user's confirmation dialog. Widgets remain non-routable; any navigation decision belongs to their owning App.

## 7. Lifecycle, disposal, and errors

### 7.1 Lifecycle states

```ts
type MountState =
  | { readonly status: 'pending'; readonly attempt: number }
  | { readonly status: 'mounted' }
  | { readonly status: 'error'; readonly error: MfeError }
  | { readonly status: 'disposed' }
```

The handle supports `state`, `getState()`, and `subscribe(listener)`, bridged through React external-store selectors. Host components observe lifecycle changes automatically with stable snapshots and cleanup on unmount. Non-React hosts subscribe explicitly. `getSnapshot` is an adapter detail. React Strict Mode must not leave duplicate mounts or subscriptions, and disposed attempts cannot overwrite the state of a retry.

Mount snapshots change only on observable transitions. A Widget input update while mounted does not republish an identical `mounted` status. Retrying one mount does not notify status consumers for other mounts. Host-internal selectors avoid rerendering consumers whose selected status or error has not changed.

`dispose()` returns an idempotent `Promise<void>`. The adapter detaches UI synchronously, then completes asynchronous cleanup: aborting the mount signal, removing event and command registrations, disposing child Apps and subscriptions, dropping the router, removing generated roots, and preventing late events. Teardown must eventually call `root.unmount()`. One lifecycle handle owns teardown so no second path can leave React trees, overlay roots, subscriptions, or late callbacks alive.

### 7.2 Retry

A failed mount supports explicit `retry()` without recreating the scope or container. It uses the latest committed inputs and handlers, cancels obsolete attempt work, and transitions through a new `pending` attempt. Updating props during an initial mount error does not silently retry; the documented retry action performs the next attempt. Automatic retries are not performed.

Host components expose failure and retry through one optional slot:

```tsx
<AlertPanel
  alertId={id}
  fallback={({ error, retry }) => <MfeErrorPanel error={error} onRetry={retry} />}
/>
```

Loading suspends to the nearest React `Suspense` boundary. Without `fallback`, failures are thrown to the nearest React error boundary; Suspense itself is not an error handler. The scaffold includes usable pending and error boundaries with an explicit reset/retry path. `fallback` is the single documented seam for an inline failure surface; no other MFE-specific error props are added to host components.

A nested App declared with `mfeRoute` (§5.9) fails through the route's native `errorComponent` with a structured error. The adapter integrates mount retry with the pinned router's documented reset/invalidation path; it must not claim that native error-component props contain an undocumented `retry` field. The scaffold provides a working example and tests that a reset starts a fresh attempt. `AppHost` accepts `fallback` for imperative placement. Non-React hosts read the structured error and `retry()` from the handle.

### 7.3 Structured errors

```ts
type MfeErrorCode =
  | 'registry/invalid-descriptor'
  | 'registry/duplicate-id'
  | 'contract/unsupported-major'
  | 'contract/input-mismatch'
  | 'contract/event-mismatch'
  | 'config/missing'
  | 'config/unreachable'
  | 'config/invalid'
  | 'load/manifest-failure'
  | 'load/entry-failure'
  | 'load/share-conflict'
  | 'load/timeout'
  | 'mount/failure'
  | 'mount/timeout'
  | 'command/duplicate-name'
  | 'app/invalid-base-path'
  | 'app/invalid-router'
  | 'storage/failure'
  | 'auth/undeclared-origin'
  | 'dispose/failure'
  | 'dispose/timeout'

interface MfeError extends Error {
  readonly code: MfeErrorCode
  readonly id: string
  readonly definitionVersion?: string
  readonly operation: string
  readonly direction?: 'input' | 'event'
  readonly path?: readonly (string | number)[]
  readonly cause?: unknown
}
```

`code` is a closed union so hosts can handle each case exhaustively. Adding a code is a deliberate contract change.

Errors are observable by the host and diagnostics. The framework must not catch a failure and return an empty surface, pretend a mount succeeded, or silently use the legacy adapter when a new descriptor was advertised but malformed.

### 7.4 Load, mount, and disposal deadlines

Use finite shell-configured deadlines with documented initial defaults: 30 seconds for loading/config/bootstrap work, 30 seconds for an actual mount attempt after its code is ready, and 5 seconds for asynchronous disposal. These are operational defaults, not performance targets. The shell may tune them centrally; MFE authors do not configure them in feature code. Use a total deadline for each phase so individual substeps cannot reset the clock indefinitely. Network/progress UI remains available during a pending phase.

On load or mount expiry, abort cancellable work, detach incomplete UI/resources, settle the attempt with `load/timeout` or `mount/timeout`, and expose the normal explicit retry path. Diagnostics name the phase, definition, elapsed time, and configured deadline. Fence late results by attempt generation so a timed-out import or loader cannot attach UI or overwrite a retry. A caller leaving a shared load must not cancel work still owned by another active caller; each waiter settles within its own deadline.

Disposal detaches UI and framework subscriptions synchronously under §7.1 and attempts every owned cleanup even if one fails. Its returned promise rejects with `dispose/timeout` on expiry; the mount remains disposed, late callbacks remain fenced, and diagnostics record unfinished cleanup. Other mounts and shell navigation must continue. Eventual completions are observed to avoid unhandled rejections. Clear timers on every success/error/disposal path and test with controlled clocks.

Deadlines bound asynchronous waits while the JavaScript event loop runs; they cannot preempt a synchronous infinite loop or guarantee immediate network/module cancellation. User interaction inside a navigation blocker is outside these timers (§6.4). Background Query work after a successful mount retains its own request lifecycle rather than extending the mount attempt.

## 8. Registry and adapter selection

### 8.1 Neutral registry

The shell and host use one internal normalized registry for new Apps, Widgets, and legacy Apps. Shell surfaces do not query separate registries.

Each entry is validated independently. A malformed entry produces a structured per-entry diagnostic and does not remove unrelated valid entries. Duplicate public IDs are rejected deterministically and reported with all conflicting entries.

### 8.2 Selection rules

1. If the entry advertises a valid new App or Widget contract, select the new adapter.
2. If the entry does not advertise a new contract and has the required legacy metadata, select the legacy adapter.
3. If the entry advertises a new contract but that contract is malformed or incompatible, produce an explicit contract error. Do not reinterpret it as legacy.
4. If the entry matches neither contract, quarantine it and report an invalid descriptor error.

This prevents a typo in new metadata from silently changing loading behavior. Selection is table-driven by advertised contract kind so that adding an adapter later (§12.3) is a table entry, not a rewrite.

### 8.3 Legacy translation

The legacy adapter translates the existing Angular registry entry into the neutral registry record at the boundary. The neutral core must not contain legacy fields such as `mfManifestUrl`, `routes`, `settings.routes`, or `single-spa-app`.

## 9. CSS isolation

Native CSS `@scope` is required for the supported modern-browser baseline. There is no legacy fallback, class-token rewrite mode, runtime feature detection, or per-MFE opt-out.

The framework creates a scope root for every new App and Widget mount, and for framework-managed portal roots. The semantic scope value uses the public `id`; an opaque internal token may distinguish repeated mounts.

```css
@scope ([data-mfe-scope="operations"]) to ([data-mfe-scope]) {
  .text-sm { /* generated utility */ }
}
```

The lower boundary prevents parent MFE rules from matching inside a nested App root. `@scope` does not block inheritance, so shell-owned fonts, theme values, and CSS variables continue to flow.

Source class tokens remain unchanged; the plugin generates scoped selectors rather than rewriting source class names. `data-mfe-scope` is reserved for App, Widget, and framework portal roots.

The Rspack integration must support utilities-only CSS output for Tailwind v4-style inputs, omitting duplicate Preflight, resets, shell-owned themes, and design-system token output. Custom CSS enters the same scoped pipeline. In particular:

- MFE resets and `@font-face` are not emitted as unscoped globals.
- MFE keyframes are namespaced and animation declarations rewritten.
- Unsupported global constructs fail the build explicitly.

The shell owns resets, design tokens, CSS variables, and global design-system setup.

The adapter wraps each mounted tree with the scope root and a body-level overlay root, and wires the design system's portal provider to that overlay root. Nested Apps receive independent roots. Authors do not pass portal targets.

Legacy Angular MFEs are already CSS scoped. The compatibility adapter preserves that behavior and requires no CSS rewrites.

### 9.1 Tecton design system

Use [rpkapps/tecton-ui-1](https://github.com/rpkapps/tecton-ui-1) as the design-system source. The inspected revision is `424889e4ff47af48e6a8b138ad77421a5ce5014d`; pin the adopted revision/package in implementation. Its package is `@tecton/react`, with component subpath exports and icons from `@tecton/react/icons`. It is currently private with source TSX exports: establish reproducible private distribution and compilation before treating it as a consumable release. Its repository's older package-manager setup does not supersede §10.10.

The shell imports global design tokens, fonts, resets, and theme setup once. Remote Tailwind output includes the utilities needed by the remote and its consumed Tecton components, scoped through this section's pipeline. Do not import Tecton's full global stylesheet separately in each remote or assume repository-relative Tailwind source globs work in a distributed package. Validate component-source discovery and emitted CSS from the packaged artifact.

The adapter wraps each mount with `PortalProvider` from `@tecton/react/tecton/portal`, supplying its framework-created overlay root. Verify the shared React Aria context instance across provider and components, theme propagation, nested overlays, focus restoration, and disposal. Authors do not pass targets.

The inspected [Tecton portal documentation](https://github.com/rpkapps/tecton-ui-1/blob/424889e4ff47af48e6a8b138ad77421a5ce5014d/apps/www/content/docs/tecton/portal.mdx) explicitly excludes Drawer: it uses Base UI and still portals to `document.body`. Gate 6 must provide a supported integration for Drawer or keep it explicitly unsupported in MFEs until that gap is fixed. It must never silently escape CSS scope. Do not hand-edit generated upstream components or patch global portal behavior. The rest of the documented overlay family also requires actual integration tests, not an assumption based on provider installation.

### 9.2 Browser support policy

Target **at least 91% of global browser usage**, with native CSS `@scope` required in every supported browser. This is aggregate usage coverage, not a per-browser 91% threshold and not a percentage of shell sessions. There is no CSS fallback. The feature floor and coverage target jointly determine the supported version matrix.

At this revision, [Can I Use reports 91.66% global coverage for `@scope`](https://caniuse.com/css-cascade-scope), using August 2026 usage statistics. This supports the selected direction; it does not prove the entire framework reaches the target. Other required APIs and dependency browser floors must also be included in the compatibility intersection.

Use Browserslist and its usage data to generate a checked-in target matrix and a release compatibility report. Filter for every required native feature, then measure the aggregate coverage of the resulting matrix; `cover 91%` alone does not ensure `@scope` support. Record data versions and measured coverage, refresh quarterly and before releases that raise minimum versions, and fail the release gate if the combined supported set falls below 91%. The [Browserslist documentation](https://github.com/browserslist/browserslist) defines coverage queries and custom usage statistics.

Actual shell-session coverage and managed-browser requirements are supplementary deployment checks, not a replacement denominator. Identify incompatible mandated browsers before rollout. Test CSS scoping, nested boundaries, and overlays across supported engine families, including minimum supported versions where practical. Publish exclusions explicitly. Node.js/tooling versions are pinned separately according to build-tool compatibility; browser market share does not choose them.

## 10. Configuration, auth, and build contract

### 10.1 Author configuration

`src/mfe.config.ts` contains the checked-in schema and environment mapping. It contains no deployment values and no secrets.

```ts
import { env } from '@company/mfe-rspack'
import { z } from 'zod'

export default {
  apiBaseUrl: env('API_BASE_URL', z.string().url(), { api: true }),
  oidcIssuer: env('OIDC_ISSUER', z.string().url()),
}
```

Values marked `{ api: true }` declare API origins and populate the auth allowlist (§10.5).

The schema is shared by every definition in the container. `mfePlugin()` discovers the file automatically; an explicit path option exists only for nonstandard layouts.

### 10.2 Deployed values

The deployed `runtime-config.json` is external and contains values only, with no shell-owned envelope. The generated loader supplies the `id`, schema version, URL, and diagnostics from framework metadata.

```text
Zod schema defaults < runtime-config.json values
```

Defaults apply only to omitted fields in an otherwise valid document. A missing, unreachable, unreadable, or invalid file is an explicit configuration error. The framework must not replace invalid configuration with an empty object or silently continue.

Build once, deploy many is required. Client-visible configuration must not contain secrets. Configuration is loaded once per deployed container and shared by all definitions it exports, not per definition or per mount. It is an immutable snapshot, not reactive state. Changes to deployed values require a page reload and fresh validation; configuration files are not polled.

### 10.3 Generated access

The plugin generates inferred config types, startup materialization and validation, the runtime-config loading contract, the private `#mfe/config` alias, a deployment template, and bootstrap ordering that validates configuration before application code imports.

```ts
import { config } from '#mfe/config'
```

This is the only way authors read configuration. There is no config field on any context. MFE source must not manually load JSON or read `process.env` for framework runtime configuration. Legacy applications are exempt.

#### 10.3.1 Generated output inventory

The plugin generates the following. Only the `#mfe/*` aliases are imported by hand; everything else is build output.

**Author-imported aliases**

| Module | Contents |
|---|---|
| `#mfe/config` | validated, typed runtime configuration |
| `#mfe/fetch` | authenticated `fetch` and `getAccessToken` (§10.4) |
| `#mfe/meta` | build hash, build time, and `definitions`: records containing each exported definition's `id`, kind, and optional version |

`#mfe/meta` exists so error reports and diagnostics can answer "which build was this" without extra plumbing. Three hand-imported aliases is the ceiling (§17.1).

**Build artifacts**

- **Widget contracts.** For each exported Widget, a side-effect-free `contracts` entry point carrying runtime `inputs` and `events` schemas and their inferred types. It imports no App entry, route tree, generated config, or router augmentation. A provider may publish it so consumers get inference and local event validation. The package is versioned independently; providers and consumers each enforce their own chosen schemas (§5.8). It is what makes the contract import in §5.7 real rather than hand-maintained.
- **Shell registry descriptor.** A list of exported definitions with their individual `id`, kind, capability metadata, and optional version, plus a shared manifest path, emitted as a build artifact. A container has no additional public definition ID. Nobody hand-writes registry JSON, and capability metadata cannot disagree with the routes that produced it (§5.10).
- **JSON Schema for `runtime-config.json`**, giving editor validation and a deploy-time check, so `config/invalid` fails before release rather than at runtime.
- **`.env.example`**, derived from the `env()` calls in `src/mfe.config.ts`.

The framework does not generate the TanStack `Register` augmentation. Authors declare it beside their router factory (§5.2).

### 10.4 Authenticated requests

The plugin generates an authenticated `fetch` with the standard call signature and the documented URL and retry behavior below:

```ts
import { fetch } from '#mfe/fetch'

const response = await fetch('/api/assets')
```

It has the standard `fetch` signature, so libraries accepting a fetch implementation can use it. It attaches the bearer token to eligible requests, refreshes when expired, and retries an eligible replayable request at most once on a 401. Normal request code never handles a token; the explicit transport escape hatch below is the only exception.

This must not be implemented as a global `fetch` patch. The objections that removed the History patch apply identically: invisible action at a distance, breakage of code that wraps fetch itself, and silent credential leakage into third-party SDK calls.

String and URL inputs resolve using standard URL resolution against the validated `apiBaseUrl`, not the shell document URL. A leading slash replaces the base pathname: with `https://api.example.test/v1/`, `assets` resolves under `/v1/` and `/assets` resolves at the origin root. The scaffold uses one consistent convention and includes this example. A `Request` retains its already resolved URL.

`apiBaseUrl` is the required default base whenever relative request URLs are used. Additional `{ api: true }` entries extend the origin allowlist but do not change that default; callers use absolute URLs for additional APIs. A missing default for a relative request fails before network activity with an actionable configuration error.

Explicit caller authorization headers are preserved and disable framework token attachment and auth retry for that request. Caller cancellation is honored during refresh waits and network activity; cancellation of one request does not cancel a shared session refresh needed by other requests. A 401 retry must reproduce method, body, and other request options. Non-replayable/streaming bodies are not retried automatically; return the original response with a diagnostic explaining why. The framework does not promise application-level idempotency for mutating requests.

For transports `fetch` cannot cover — WebSocket, EventSource, a library with its own HTTP stack — a tier-2 accessor exists:

```ts
import { getAccessToken } from '#mfe/fetch'
```

Always awaited, called per connection, never stored.

### 10.5 Token boundaries

- The token is attached only to origins declared `{ api: true }` in `src/mfe.config.ts`. Requests to other origins pass through untouched, so an MFE calling a third-party endpoint cannot leak the bearer.
- A request to an undeclared origin warns in development with `auth/undeclared-origin`. Silent non-attachment produces a confusing 401 that looks like a token bug.
- The shell owns the session. Refresh is single-flight: when several mounts fire requests against an expired token, one refresh happens and all wait on it. Per-MFE refresh means concurrent refresh calls and, with rotating refresh tokens, failures and a spurious logout.
- A failed refresh is a session-level event. The shell re-authenticates. It must not surface as a mount error in whichever mount happened to fire first.
- Tokens never appear in `#mfe/config` or in browser storage.
- Attaching a token is not authorization. A 403 is the App's own error to handle; a 401 after refresh is the shell's.

### 10.6 Local development

Developers run the shell locally and point one registry entry at their dev server. There is no standalone harness. Running against the real shell means a real session and a real token, so no class of auth bug waits until deployment.

The override is a **URL only**. It does not accept configuration, contract, or adapter changes; keeping that constraint now prevents it from growing into a second configuration surface.

Requirements:

1. The shell reads overrides from `localStorage` at boot, before remotes are registered, keyed by definition `id`.
2. Changing an override requires a page reload. Re-mounting is insufficient: the old container's modules are already registered in the MF2 runtime under the same name, its chunks and stylesheets are document-level, and the shared scope has already resolved against the version it loaded first. Disposal removes mounts and scope roots and touches none of that.
3. The shell displays a visible indicator in its chrome whenever any override is active, so a forgotten override cannot be debugged for days as a phantom bug.
4. The generated loader resolves `runtime-config.json` from a local path in development, so a developer never edits deployed values, and local config may declare `localhost` API origins so the auth allowlist covers them.
5. An overridden entry that fails produces the per-entry quarantine error from §8.1. The shell keeps running and unrelated entries stay available.

CORS configuration for dev origins against the declared APIs is a documented prerequisite.

A devtools panel for inspecting and setting overrides is deferred and out of scope (§3).

#### 10.6.1 Executable developer workflow

The scaffold provides `pnpm run dev`, `pnpm run generate`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`. Development, tests, typecheck, and build automatically run their required generation steps. Editor declarations are generated during initial project setup without starting the shell or bundler. `pnpm run generate` is the one documented recovery command; ordinary edits do not require it manually.

The development command validates local configuration, starts the remote dev server, and prints the exact manifest URL, definition IDs, shell connection instructions, and override/reset snippets. The shell owns session acquisition and refresh. The command never requests, stores, copies, or prints access tokens and does not create a second login flow.

The boot-time override format is a JSON object stored under `company:mfe:overrides`, mapping public definition IDs to absolute manifest URLs. The printed command uses the generated project's actual ID and URL; for example:

```js
const key = 'company:mfe:overrides'
const overrides = JSON.parse(localStorage.getItem(key) || '{}')
overrides.operations = 'http://localhost:3001/mf-manifest.json'
localStorage.setItem(key, JSON.stringify(overrides))
location.reload()
```

Reset removes only the selected ID, preserves unrelated overrides, and reloads. The shell diagnoses malformed override JSON instead of silently ignoring it. URLs do not carry tokens or configuration values. Multi-definition containers use one consistent override URL for their registered exports; conflicting URLs for the same loaded container are diagnosed before registration.

Overrides only target registered IDs. The quickstart includes the approved development-registry enrollment procedure for a newly scaffolded ID, using the generated descriptor; authors do not hand-author registry JSON. The scaffold is not considered a runnable deliverable until this procedure and the organization's shell-start/session prerequisites have been exercised end to end. Widget-only projects use a shell-hosted development placement with editable, validated example inputs and an event viewer under the real shell session; this is not a standalone harness.

The generated local configuration template is copied to the documented local values path and validated before serving. Diagnostics identify missing configuration, an unreachable remote, inactive/mismatched overrides, an unavailable shell, expired sessions, API-origin mismatches, and likely CORS failures. Diagnostics distinguish observed failures from inferred causes and state the next repair step.

Hot updates preserve the current URL and mount state where the toolchain supports it. Changes that require a reload say so explicitly; fallback reload behavior and its state-preservation limits are verified in Gate 1. Feature edits must not require knowledge of federation caches or generated module ordering.

### 10.7 `mfePlugin()`

```ts
// rspack.config.ts
import { mfePlugin } from '@company/mfe-rspack'

export default {
  entry: './src/main.ts',
  plugins: [mfePlugin()],
}
```

It is a normal plugin, not a `withMfe` wrapper. Ordinary Rspack options stay ordinary.

The plugin owns: definition discovery, static validation of `src/mfe.ts`, capability route extraction, generated entries and lazy modules, container-relative asset URL generation and CSS rewriting, MF2 names/exposes/manifests/sharing/registration/preloading/chunk resolution, framework contract metadata, scoped CSS transformation, and every generated output listed in §10.3.1.

The plugin also owns the supported React Compiler integration (§10.9), composing with existing transforms without processing the same source twice. Authors do not configure compiler internals in the normal path.

It composes with `@tanstack/router-plugin`, either by including it or by documenting the required ordering. Route tree generation must complete before typecheck, and `routeTree.gen.ts` is generated output rather than checked-in source.

It must not scan arbitrary `createApp` or `createWidget` calls across the repository. It scans designated entry modules and requires statically discoverable exported definitions. Render functions are not invoked for metadata extraction, and definitions must be side-effect free during isolated evaluation.

One validated MF2 manifest is used. Framework metadata is embedded in the MF2 manifest descriptor area rather than emitted as a competing manifest.

### 10.8 Scaffold

`pnpm create @company/mfe` supports App and Widget starters, with a default App path. It produces routes or a Widget example as appropriate, `src/mfe.config.ts`, local configuration templates, the Rspack config, plugin wiring, editor types, and the scripts and shell-connection instructions in §10.6.1. It is a required deliverable, not a convenience: the scaffold sets the shape every team copies, and it is the cheapest available guarantee that the documented shape and the real shape stay the same.

Both starters include React Compiler enabled through the validated integration, the author ESLint preset (§17.7), formatter configuration, and the pinned pnpm toolchain and reviewed dependency build policy (§10.10). They do not add configuration decisions to the quickstart.

### 10.9 React Compiler

React Compiler is enabled by default for new React Apps, Widgets, the new React shell, and React components and hooks in `@company/mfe-react`, once Gate 1 proves the pinned integration. Authors write straightforward React and rely on the compiler for routine memoization; explicit memoization remains available for measured needs and documented identity contracts. This follows [React's compiler guidance](https://react.dev/learn/react-compiler/introduction).

#### Build ownership and compatibility

- Each shell or remote compiles its own source independently. Compiling the shell does not compile a runtime-loaded remote. The neutral core, neutral host, and legacy Angular code remain outside the React Compiler transform.
- The React adapter's library build publishes compiled components and hooks. Consumers do not need to recompile dependency source. Declare the supported React peer range and any required compiler runtime dependency in published packages. [React's library guidance](https://react.dev/reference/react-compiler/compiling-libraries) supports shipping compiled libraries and testing both compilation modes.
- Pin the compiler version and target to the supported React runtime. Resolve generated runtime imports, including React compiler-runtime subpaths where used, consistently with the shared React instance. Do not assume a top-level federation sharing entry automatically handles every generated subpath; prove resolution using the actual emitted bundles.
- `mfePlugin()` supplies the supported source-transform integration; the shell and library builds use the corresponding shared configuration. Preserve ordinary Rspack composition, source maps, lazy routes, and Fast Refresh. If using the Babel compiler plugin, it runs before other Babel transforms that erase the original source structure, following the [installation guidance](https://react.dev/learn/react-compiler/installation).
- Record and test the pinned Rspack, compiler, React, TanStack, and federation versions in Gate 1. Compiler integration is an early implementation gate, not a claim that the combination has already been verified. A failing integration must be resolved or the default explicitly revised before later gates depend on it; no silent disablement.

#### Correctness and author experience

- Selective subscriptions, cached snapshots, current committed callbacks, stable public handles/setters, and deterministic cleanup remain framework guarantees when compilation is skipped or disabled. Compiler caching is not the implementation of lifecycle ownership or an API identity guarantee.
- Use the existing React Hooks ESLint compiler diagnostics (§17.7). Expose skipped-compilation diagnostics with source locations and track them on performance-critical components. Correctness violations fail CI; an unsupported optimization pattern is reviewed according to its effect on the performance gate, rather than forcing every function to compile.
- Allow a narrowly scoped `"use no memo"` directive with an adjacent reason and a tracked issue or compatibility explanation. Keep the affected component correct and within the applicable performance budget; do not silently opt out whole packages.
- Do not require manual `useMemo`, `useCallback`, or `React.memo` everywhere, ban inline callbacks, or remove existing memoization automatically. Treat changes to manual memoization as behavioral/performance changes and verify the affected path.
- The compiler does not replace runtime validation, state dependency tracking, or cancellation, and does not promise to optimize all non-React runtime work. The framework still avoids redundant upstream work even when memoization suppresses a committed render.

#### Verification

Gate 1 covers compiled remote loading, shared React/compiler-runtime resolution, mixed compiled/uncompiled consumers, lazy-route transforms, source maps, remote hot updates, and build/edit-loop timings. Confirm actual compilation through build diagnostics or emitted output; a configured plugin alone is not evidence.

Run the framework React correctness suite with and without source compilation and test the published compiled adapter from a consumer fixture. Run stale-callback, subscription, and lifecycle-isolation checks in both modes. Production performance budgets apply to the shipped compiler-enabled build, with isolated probes verifying that skipped compilation does not break framework subscription guarantees. Compiler upgrades repeat the affected compatibility, correctness, and performance checks.

### 10.10 pnpm and dependency build scripts

Use the latest stable pnpm release, pinned to an exact version in the root `package.json` `packageManager` field and inherited by framework workspaces and starter templates. At this revision, the registry's verified `latest` release is **12.4.2**: use `"packageManager": "pnpm@12.4.2"`. Recheck the stable release at implementation kickoff and update the exact pin through a reviewed toolchain change. Do not use a floating `latest` selector in reproducible CI installs. [pnpm registry metadata](https://registry.npmjs.org/pnpm/latest).

Define framework workspace packages in `pnpm-workspace.yaml`, commit `pnpm-lock.yaml`, and use `pnpm install --frozen-lockfile` in CI. Pin a compatible Node.js version for the build tools as well. All quickstarts, scripts, and examples use pnpm; generated projects do not create competing package-manager lockfiles.

Commit this dependency-build policy in `pnpm-workspace.yaml`:

```yaml
strictDepBuilds: true
dangerouslyAllowAllBuilds: false
allowBuilds: {}
```

Only explicitly reviewed dependencies may run installation/build scripts. Unknown build scripts fail installation. Add narrowly scoped, preferably exact-version approvals to `allowBuilds`; explicit `false` entries record denials. The empty map is the initial policy, not a claim that the eventual toolchain needs no approvals. These controls follow [pnpm's build settings](https://pnpm.io/settings/build).

Review the package, resolved version, script, and reason before using `pnpm approve-builds` or editing the policy; commit the decision alongside relevant dependency changes. Do not use bulk approval, wildcard approvals, or enable `dangerouslyAllowAllBuilds` to repair an install. CI consumes the committed decisions and never approves packages automatically. [Approval workflow](https://pnpm.io/cli/approve-builds).

The scaffold includes reviewed decisions needed by its pinned toolchain. Verify a clean-cache install, an approved harmless fixture, and an unreviewed harmless fixture whose script must not execute and whose installation must fail. Check policy changes in review. Install-script controls do not sandbox imported application code or commands explicitly executed by a developer.

### 10.11 Releases and package distribution

Use Changesets for framework package versioning, release notes, and internal dependency updates, integrated with the existing private package registry and CI. Record public API and contract changes in the changeset, and verify packed artifacts, export paths, declarations, generated aliases, and starter consumption before publishing. Keep the framework's compatibility policy explicit across coordinated package releases. Independently published Widget contracts retain their own versions and do not force coordinated provider/consumer deployments.

## 11. MF2 and dependency sharing

MF2 is internal. Authors do not configure or need to understand it.

The normal load path:

1. Resolve stable public `id` through host runtime configuration and registry.
2. Request one MF2 manifest.
3. Gate the declared framework contract major.
4. Resolve lazy modules and chunks through the MF2 runtime.
5. Validate inputs and events at the mount boundary.
6. Create the mount.

Runtime caching and optional preloading may optimize this path. Preloading may be triggered by route intent, hover, or catalog activity, and must not change lifecycle or command registration semantics.

The manifest declares the framework contract major. The host accepts compatible minor and patch versions and rejects unsupported majors with a structured compatibility error. The major gate does not replace runtime payload validation.

Generated internal entries may include `./app` and `./widgets/<widget-id>`. Their names are not public API.

### 11.1 Shared singletons

The adapter owns the default sharing candidate list, and the plugin intersects it with packages actually present in the container's dependencies. Only present packages are shared. Defaults cover `react`, `react-dom`, TanStack React Router/Query, and `@tecton/react`. Resolve provider/hook and component subpaths consistently; include the React Aria context dependencies needed for Tecton's portal provider to reach its components. Sharing a library does not share mount-owned routers, Query clients, or stores.

React, `react-dom`, TanStack Router/Query, and dependencies carrying cross-package provider context are shared as strict singletons under a verified compatible version policy. Tecton and its context dependencies must resolve consistently. Two containers requiring incompatible majors must fail loudly:

- An incompatible major produces `load/share-conflict` naming both containers, the package, and both requested ranges. The MFE does not mount.
- The runtime must not silently load a second copy. Two React copies produce hook errors and broken context that surface far from the cause.
- Compatible minor and patch differences resolve to the highest requested version normally.

The one supported author override is additive:

```ts
mfePlugin({
  shared: { '@company/auth-client': '^3.0.0' },
})
```

It retains adapter defaults and adds or overrides matching policies. There is no per-App removal. Authors never write raw MF2 singleton, share-scope, registration, or manifest settings.

### 11.2 Preloading and activation

Preloading may resolve metadata, load code/styles/config, and warm read-only Query data; it does not create an active MFE mount. No React root, command, breadcrumb contribution, navigation blocker, page-view event, or business mutation may result merely from a hover or speculative load. Module evaluation and static route/definition declarations must remain free of activation side effects. Avoid producing resources that require a mounted owner to clean them up.

Authors use TanStack's native preload/cause indicators where they distinguish speculative execution, but loaders and `beforeLoad` must remain safe to repeat even during ordinary navigation, invalidation, or retries. A `preload === false` check is not an exactly-once business-action mechanism. Route data functions perform reads and validation; mutations belong to explicit actions. Technical preload spans/diagnostics may be recorded with a preload label, independently from business events and page visits.

A visit is recorded only after successful committed route activation, once per committed navigation identity; cached preloads, loader reruns, and development Strict Mode do not add visits. Commands, breadcrumbs, and blockers follow their committed ownership lifetimes. Abandoning preload releases speculative listeners/timers, while intentionally cached code remains cached. Session/group changes cancel or invalidate sensitive speculative data under the same policy as active data. Preload errors must not break the currently mounted App; a subsequent real navigation uses the standard error/retry path. Verify this with real hover and navigation fixtures.

## 12. Package responsibilities

### 12.1 Packages

`@company/mfe-core`

- neutral TypeScript contracts;
- Zod contract primitives and inferred types;
- inputs and event channels;
- lifecycle handles and structured errors;
- command and breadcrumb neutral records;
- provider-neutral telemetry/tracing contracts, framework-owned tracing types/constants, and normalized record types; no OTel or Faro dependency;
- contract major/version metadata;
- no React, TanStack Router, single-spa, MF2, or raw History dependency.

`@company/mfe-host`

- neutral loading and mounting orchestration;
- registry normalization and adapter selection;
- runtime lifecycle, disposal, retry, child ownership;
- navigation bridge abstraction;
- auth token acquisition and single-flight refresh;
- diagnostics/telemetry provider binding, automatic mount attribution, and tracing disposal ownership; no OTel or Faro dependency;
- no framework router dependency.

`@company/mfe-react`

- `createApp`, `createWidget`, `AppHost`, `lazyWidget`;
- TanStack Router adapter, router context supply, and mount-owned Query client/provider;
- `useCommand`, `useBreadcrumbs`, `useStoredState`, `useMfeStorage`, `useMfeSignal`, `useBasePath`, `useTelemetry`, `useUser`, `useGroups`, `useTheme`;
- author exports of framework-owned telemetry/tracing types and constants, with no vendor types in public declarations;
- Suspense and error boundary integration;
- automatic scope and overlay roots, portal provider wiring.

`@company/mfe-rspack`

- normal `mfePlugin()`;
- static definition, capability, and config discovery;
- MF2 compiler/runtime plumbing;
- runtime-config, `#mfe/config`, and `#mfe/fetch` generation;
- CSS scoping and utilities-only integration.

`@company/mfe-legacy-angular`

- removable legacy adapter;
- single-spa Angular bootstrap provider;
- delegated baseHref/base-path behavior;
- parcel lifecycle and route metadata integration;
- shell-owned legacy navigation behavior.

### 12.2 Import DAG

The development-only `@company/eslint-plugin-mfe` package supplies the shared framework and author presets and custom rules in §17.7. It is installed by the scaffold and framework workspace tooling, is outside the runtime import DAG, and must not enter browser bundles. React Compiler integration belongs to `@company/mfe-rspack`; compiled React adapter artifacts remain owned by `@company/mfe-react`.

```text
@company/mfe-core
        ^
        |
@company/mfe-host
   ^         ^
   |         |
React      legacy-angular
adapter    adapter
```

The neutral core cannot import a framework or router. The neutral host cannot import React, TanStack Router, single-spa, or MF2. The legacy adapter is the only package that knows the legacy single-spa contract.

### 12.3 Keeping a second adapter possible

A native Angular adapter is deferred, not designed for. Do not build abstractions whose only justification is a hypothetical second adapter — that cost is real and the benefit is not yet.

Three properties must hold anyway, because the legacy adapter already exercises the same seam and each costs nothing:

1. **No React types in `@company/mfe-core` or `@company/mfe-host` public contracts.** A discipline, not an abstraction.
2. **Adapter selection stays table-driven** (§8.2). Adding an adapter is a table entry.
3. **The neutral registry record stays framework-free** (§8.3).

Where a neutral indirection exists *only* so Angular could plug in later, collapse it into the React adapter and recover it if Angular is actually built.

### 12.4 Framework implementation state

Framework-owned shell-state, lifecycle, registry, command, breadcrumb, storage, and subscription state use small purpose-specific plain TypeScript structures. Do not add Zustand, Redux, MobX, Jotai, TanStack Store, or another general state-management dependency for framework implementation state. React observation uses native `useSyncExternalStore` with cached immutable snapshots, stable subscriptions, and equality/no-op behavior from §1.4. Keep ordinary component-local state in React.

This restriction does not prohibit the explicitly selected TanStack Router, Query, Form, or Table integrations, or their internal dependencies. Those libraries own their domain state; they are not repurposed as the framework's general store. MFE feature code may use Zustand under §5.17.

## 13. Legacy compatibility contract

This section is normative and required in the first release. It is included so implementation can proceed without opening the legacy repositories.

### 13.1 Existing shell and loader

The existing shell is an Angular 19/Nx 20 application using Module Federation Enhanced, single-spa, and single-spa-angular.

The shell loads legacy remotes by:

1. calling `registerRemotes`;
2. calling `loadRemote(`${name}/single-spa-app`)`;
3. mounting the resulting parcel through `single-spa-angular/ParcelComponent`;
4. doing so in `apps/shell/src/app/routes/mfe-app/mfe-app.component.ts`.

Legacy remotes expose `./single-spa-app` in their Module Federation configuration.

Preserve this loader and parcel lifecycle. Do not replace it with the new App loader.

### 13.2 Existing registry fields

The shell registry contains these legacy `AppConfig` fields: `name`, `title`, `icon`, `mfManifestUrl`, `onboardingType`, `tags`, `categories`, `version`, `externalUrl`, `routes`, `settings.routes`.

Preserve their semantics. The legacy adapter translates them at the neutral registry boundary while retaining the fields existing shell surfaces need.

Shell-owned legacy routes include `settings`, `:name/settings`, `release-notes`, `:name/release-notes`, `solutions-health`, `:name/solutions-health`, and `:name/**`. These must continue to work after the new registry and adapters are introduced.

Legacy release notes are fetched from a sibling `release-notes.md` based on `mfManifestUrl`. Preserve that as a compatibility fallback. New App-owned release-note capabilities are additive and must not disable this path.

### 13.3 History patch removal

The shell calls `patchHistoryApiToSyncRouters()` from `apps/shell/src/main.ts`, which replaces `window.history.pushState` and `replaceState` and emits synthetic `popstate` events.

Remove this global patch and replace it with the explicit shell-boundary navigation bridge. Do not replace it with another global patch or a second router synchronization layer.

### 13.4 Legacy migration seam

The smallest migration seam is the existing:

```ts
provideAppInitializer(skipLocationChangeOnNonImperativeRoutingTriggers)
```

in each legacy single-spa bootstrap.

Asset Tracker seam:

```text
C:\Users\h225927\Projects\sds-mfe-asset-tracker\apps\asset-tracker\src\main.single-spa.ts
```

Asset Tracker preserves `APP_BASE_HREF = '/asset-tracker/'`.

Rigstream seam:

```text
C:\Users\h225927\Projects\sds-mfe-rigstream\apps\rigstream\src\main.single-spa.ts
```

Rigstream consumes single-spa `baseHref` with a `/rigstream/` fallback.

Migration steps for each legacy MFE:

1. Replace only the existing `provideAppInitializer(...)` initializer with one stable provider from `@company/mfe-legacy-angular`.
2. Keep `provideRouter`.
3. Keep `singleSpaAngular`.
4. Keep the route tree and all feature code.
5. Keep `APP_BASE_HREF` and existing `baseHref` behavior.
6. Keep the `./single-spa-app` MF2 exposure unchanged.
7. Run the existing parcel mount, in-app navigation, browser back/forward, unmount, and remount checks.

The provider must preserve delegated baseHref, single-spa activity and parcel lifecycle, route metadata, and shell-owned navigation. Production nested legacy Angular Apps must continue to work when mounted below a parent App. No legacy route-tree, feature-code, or CSS rewrite is required.

Legacy runtime and public-file configuration is not forced through `src/mfe.config.ts`, `#mfe/config`, or `#mfe/fetch`.

### 13.5 Legacy styling and shell safety

Legacy Angular MFEs are already CSS scoped. The adapter preserves their current styling; the native `@scope` pipeline applies to new Apps and Widgets only.

The shell's global `addEventListener`/`removeEventListener` patch in `can-deactivate-mfe-app.guard.ts` for beforeunload tracking is separate shell-safety work. It is not a reason to reintroduce History patching.

## 14. Acceptance criteria

An implementation is acceptable only when all of the following are true:

1. A React App is exported from `src/mfe.ts` with a plain `id` and an author-supplied router factory receiving `basePath`, constrained framework-owned `history`, and `context`. The factory forwards the supplied base path and history unchanged to native `createRouter`.
2. An App's source contains no reference to its base path in normal use, and `Link`/`navigate` resolve under the assigned boundary.
3. Components subscribe to shell user, groups, and theme through `useUser`, `useGroups`, and `useTheme`; each native route load/navigation uses one immutable snapshot under typed `context.mfe` throughout its callback chain, without hooks. Both paths use the same source. Native `useRouteContext` retains native match-context semantics and does not subscribe to shell state. `queryClient` remains top-level. Reserved-key conflicts are explicit errors and author context extensions survive updates (§5.4).
4. Assets resolve against the deployed container base through ordinary imports and `import.meta.url`, including same-domain nested mounts.
5. A Widget is mounted by stable `widgetId` without an App owner, receives no base path, and declares inputs and events as schemas.
6. A consumer renders a Widget as a lazy component with inputs as props and events as `onX` props.
7. A Widget validates arriving inputs on mount and on every update, and validates event payloads at `emit`.
8. A consumer supplying a runtime contract validates arriving events; an invalid event is dropped without affecting the mount. Contract-free consumption explicitly lacks consumer validation.
9. An invalid input update is rejected while the last valid inputs stay rendered.
10. Validation failures reach a diagnostics sink the shell can wire to monitoring.
11. A Widget cannot register routes, mutate history, or set document title through the public contract.
12. A child App is requested by stable `id` and uses the same contract whether top-level or nested.
13. Nested boundaries derive from the host route by default, with an advanced explicit override.
14. Commands register through a hook, are removed when the component unmounts, require labels, and return `Decision` only.
15. A denied pre-execute check does not run the command and surfaces its reason.
16. Settings, help, and release notes are ordinary routes marked with `staticData`, extracted statically into the manifest.
17. Capability icons are names resolved by the shell; author SVG markup never enters shell DOM.
18. Breadcrumbs compose from native router matches, support App opt-out, and support one hook-based override that clears on unmount and navigation.
19. Storage keys are bound to a schema that validates reads and writes, are written as `<id>:<key>`, and have subscribed values through `useStoredState`. Imperative and cross-document changes notify applicable subscribers.
20. Missing, unreachable, and invalid runtime config fail explicitly before App code imports.
21. Runtime config is external JSON values, shared once per container, supporting build once/deploy many.
22. `#mfe/fetch` attaches auth to declared API origins only, refreshes single-flight, and is not a global patch.
23. No token appears in configuration, browser storage, diagnostics, or ordinary request code. Only the explicit `getAccessToken` transport escape hatch may return a token; it is awaited per connection and never persisted.
24. A failed mount can be retried through the host `fallback` slot without recreating the container.
25. Disposal is idempotent, detaches UI synchronously, aborts async work, drops the router, removes generated roots, and prevents late events.
26. `mfePlugin()` is a normal Rspack plugin and leaves ordinary Rspack options ordinary.
27. MF2 names, exposes, manifests, sharing, registration, preloading, and chunk resolution are absent from the author API.
28. Incompatible shared singleton majors fail with `load/share-conflict` rather than loading two copies.
29. Native `@scope` roots, nested boundaries, and portal roots are automatic.
30. A developer overrides one registry URL through `localStorage`, reloads, and runs their MFE in the real shell with a real session; an active override is visible in shell chrome.
31. Legacy Apps continue through `registerRemotes`, `loadRemote(`${name}/single-spa-app`)`, and `ParcelComponent`, with legacy registry fields and shell-owned routes working.
32. Both Asset Tracker and Rigstream replace only the initializer at the documented seam and keep existing router/baseHref/parcel behavior.
33. The global History patch is removed and no replacement global patch is introduced.
34. Malformed advertised new descriptors produce explicit per-entry errors and never silently fall back to legacy.
35. The example App passes the portability test (§17.2).
36. State updates preserve mounts and subscriptions; latest committed callbacks are used without author memoization or manual refresh effects.
37. Shell-state updates reach mounted UI through the field hooks; newly started native loads/navigations use updated immutable snapshots while each in-flight callback chain retains its selected snapshot. Theme-only changes avoid unrelated data reloads and do not restart in-flight route work; session changes invalidate obsolete data and work.
38. Reactive storage propagates same-document and applicable browser storage events, with stable snapshots and explicit read/write errors.
39. Retry uses the latest committed inputs and isolates obsolete attempts; subscription and registration cleanup is correct under Strict Mode.
40. The App and Widget author journeys in §17.3 pass against the real authenticated shell, and component/unit tests run with explicit fixtures and mocked requests without a live session.
41. Unrelated shell-state fields, native route-context selections, storage keys, commands, Widget mounts, and lifecycle handles produce no additional committed renders in isolated unaffected consumers (§17.5).
42. Unchanged inputs and callback-only updates do not repeat provider input validation; no-op state updates preserve snapshots and subscriptions.
43. Performance fixtures meet predeclared latency and resource budgets and demonstrate bounded update work as unrelated mounts and subscriptions increase (§17.5).
44. All maintained framework code follows the shared implementation standards in §17.6, with formatting, lint, strict typechecking, and package-boundary checks enforced in CI from Gate 0.
45. Code review verifies readable control flow, explicit ownership and cleanup, consistent conventions, and justified abstractions; performance optimizations retain explanatory comments and focused regression coverage.
46. React Compiler is enabled by default in new React builds after Gate 1 verifies the integration; skipped/disabled compilation preserves correctness, subscriptions, stable public actions, and lifecycle guarantees.
47. Compiler runtime imports resolve correctly across federated builds; published React adapter artifacts work with compiled and uncompiled consumers, and performance budgets are measured against the shipped build.
48. Framework and author ESLint presets ship with tested, actionable custom rules, scoped exceptions, and no blanket memoization or inline-callback restrictions (§17.7).
49. Framework tooling and scaffolds pin the verified latest stable pnpm version, use committed lockfiles and frozen CI installs, and prevent unreviewed dependency build scripts from executing (§10.10).

50. Vitest and React Testing Library cover unit/component behavior; Playwright exercises actual Rspack-built remotes in the real shell. MSW is optional (§15.1).
51. TanStack Query follows §5.4.2: stable mount-owned clients, native APIs, authenticated query functions, cancellation, deliberate freshness, and session-safe caches.
52. Tecton distribution, scoped utilities, shared provider context, and overlay behavior meet §9.1, including an explicit Drawer resolution.
53. Telemetry provides `event`, `debug`, `info`, `warn`, `error`, `measure`, and a stable `tracer` through framework-owned exports (§5.16). It is attributed automatically, bounded, nonblocking, isolated from render subscriptions, and replaceable without MFE source changes. Tracing follows the documented conventions with explicit span completion and verified async isolation. OTel and Faro remain shell-owned, absent from author declarations and remote bundles.
54. The combined browser target matrix provides native `@scope` and at least 91% global usage coverage, backed by the release compatibility report (§9.2).
55. Framework implementation state has no general state-management dependency; MFE-owned Zustand stores are mount-isolated (§12.4).
56. Form and table recipes use TanStack Form/Table with Tecton and prove selective updates and compiler compatibility (§5.17).
57. Shared Prettier configuration and Changesets-based releases are established; published artifacts and scaffold consumption are verified (§10.11).
58. Apps and independently mounted Widgets can selectively observe user, groups, and theme through the same hooks without a Widget router or unrelated rerenders (§5.4.4).
59. Native TanStack navigation blockers work across shell and nested-App boundaries, with MFE-owned confirmation UI and no framework-specific blocking hook (§6.4).
60. The supported test-only entry supplies isolated providers, shell transitions, recording telemetry, generated-alias fixtures, and automatic cleanup (§15.2).
61. Preloading warms permitted resources without activating mounts, publishing visits, registering commands/blockers, or causing business mutations (§11.2).
62. Persisted state has explicit version/migration and retention policies; logout, account/tenant, and group changes invalidate session-retained values, including unmounted definitions and stale cross-tab records (§5.13.1).
63. Load, mount, and disposal waits have finite deadlines, structured timeout outcomes, late-result fencing, and cleanup isolation (§7.4).
64. Native boundary blocking, concurrent router/context isolation, and async trace correlation pass Gate 1 feasibility proofs before feature expansion; no forbidden global patches or unverified tree-copy assumptions are accepted.

## 15. Test matrix

| Area | Required tests |
|---|---|
| Definition discovery | One App, one Widget, multiple named Widgets, App plus Widgets in one container, default export, duplicate IDs, side-effect-free metadata extraction, rejected arbitrary source-tree calls |
| Public identity | Stable `id` lookup, no public provider/render/mount/scope identity, duplicate ID diagnostics, version in diagnostics |
| Router ownership | Author factory called per mount, base path and supplied constrained history forwarded unchanged, omitted/substituted history rejected, no default browser-history construction or global patch on the supported path, context spread, two mounts at different boundaries, router dropped on dispose |
| Boundary invisibility | `Link` and `navigate` resolve under boundary, no base path in author source, `useBasePath` tier-2 access |
| Shell context | Typed immutable `context.mfe` snapshots at factory/root/nested routes; updated snapshots for newly started native loads/navigations; one snapshot retained across each callback chain, including awaited parents and later child callbacks; top-level Query client; collision diagnostics in factory and `beforeLoad`; preserved author extensions; hook/service identity parity; stable service handles across snapshot changes; live shell-state UI updates through field hooks; native match snapshots have no shell-state subscription; theme-only changes without unrelated loader work, in-flight route restarts, or global refetch; session/group invalidation; stale-session result suppression; two-mount isolation |
| Assets | Imported asset URLs, `import.meta.url` resolution, hashed output, same-domain nested mount, cross-origin container, CSS `url(...)` rewriting |
| Lazy routes | Lazy route and dynamic import behavior, matched-route loading, optional preloading, failed chunk errors, no eager loading of every route |
| Widgets | Independent mount, input update, event subscribe/unsubscribe, no route registration, no base path, no history mutation, no document title mutation |
| Widget consumption | Runtime-schema inference, contract-free usage, reactive inputs without remount, latest committed event handlers without channel churn, unchanged-input rerenders, Suspense and error boundary, `fallback` slot |
| Contract validation | Invalid input at mount, invalid input on update with last-good retained, invalid emit throwing at call site, invalid arriving event dropped, tolerant reader with extra provider fields, non-serializable value rejected, module-scoped runtime contracts, contract-free mode, reserved-prop and event-name collision diagnostics, diagnostics sink receipt |
| Nested Apps | Parent-to-child derivation, explicit override, child disposal, child error propagation, nested breadcrumb composition |
| Lifecycle | pending, retrying pending, mounted, error, disposed, idempotent disposal, synchronous detachment, asynchronous cleanup |
| Capabilities | Static extraction of marked routes, manifest metadata, shell open without full App navigation, no capability inference, Widget rejection, icon name resolution, unknown icon fallback |
| Commands | Hook registration and unmount removal, reactive labels/availability, latest committed callbacks, no render-time actions or registration churn, Strict Mode cleanup, duplicate name rejection, `Decision`-only checks, pre-execute denial, placement validation |
| Breadcrumbs | Native matches, explicit label typing, reactive labels from loader data, title/static fallback, no arbitrary loader-field inference, pathless/index exclusion, App opt-out, child composition, competing overrides, navigation/unmount cleanup and no stale reinstallation |
| Storage | Subscribed values, latest-value functional setters, validated missing-key defaults, read/write failures, stable snapshots/setters, same-document updates, applicable cross-tab events, remove/clear notifications, schema conflicts, key/store changes, Strict Mode cleanup, globally unique definition IDs and prefix ownership |
| Runtime config | Missing file, unreachable file, malformed JSON, invalid schema, omitted defaults, shared once per container, no secrets in generated client config, private alias |
| Auth | Token attached to declared origins, untouched for undeclared origins, dev warning, single-flight refresh under concurrent requests, 401 retry, failed refresh as session event not mount error, no global fetch patch, `getAccessToken` per connection |
| Retry | `fallback` receives error and retry, retry after load failure, latest-input retry after invalid mount inputs, obsolete attempt suppression, working native route reset/invalidation |
| Rspack plugin | Normal plugin composition, auto config discovery, explicit path override, generated entries, capability extraction, internal MF2 metadata, ordinary rules and dev-server options |
| Sharing | Singleton resolution, compatible minor/patch, incompatible major producing `load/share-conflict`, no dual React copy, additive `shared` override |
| CSS | Native `@scope`, unchanged source tokens, nested lower boundary, portal root scope, keyframe namespacing, rejected global constructs, no duplicate Preflight/tokens |
| Registry | Per-entry quarantine, duplicate IDs, valid new selection, absent-new-contract legacy selection, malformed-new no-fallback, table-driven selection |
| Local development | Override read at boot, reload requirement, active-override indicator, local runtime config path, broken override quarantined without breaking the shell |
| Legacy loader | `registerRemotes`, `loadRemote`, `ParcelComponent`, mount/unmount/remount, legacy fields, settings routes, release notes fallback, solutions-health, wildcard route |
| Legacy migration | Asset Tracker initializer replacement, `/asset-tracker/` APP_BASE_HREF, Rigstream baseHref and fallback, nested legacy App, route metadata, shell-owned navigation |
| Navigation | Explicit bridge operations, local router ownership, browser back/forward, shell boundary changes, no `pushState`/`replaceState` patch |
| Shell safety | Separate beforeunload registration, no coupling between beforeunload tracking and the history bridge |
| Portability | Example App compiles with a plain TanStack bootstrap and explicit test substitutes for integration boundaries; representative feature code unchanged (§17.2) |
| Developer experience | App and Widget scaffold journeys, editor types without dev server, automatic generation, real-shell enrollment and overrides/reset, actionable diagnosis, independent unit/component tests, documented help points and task timing (§17.3) |
| Reactive performance | Shell-state field hooks and selectors, native route-context selectors, no-op snapshots, per-key storage fan-out, unaffected mount/command isolation, callback-only updates, validation counts, subscription counts, production commit counts, cold/warm loads, teardown retention and scaling fixture (§17.5) |
| Implementation quality | Shared formatter/linter/typecheck configuration, package-boundary enforcement, clean-checkout check command, formatted scaffold output, deterministic generation, and human readability review (§17.6) |
| React Compiler | Actual compilation evidence, pinned target and transform ordering, federation runtime/subpath resolution, mixed consumers, published artifacts, source maps, hot updates, enabled/disabled correctness, local opt-out behavior, and production build/edit-loop performance (§10.9) |
| Lint tooling | Framework/author presets, symbol-aware custom rules, valid/invalid/aliased cases, file-scope exceptions, compiler diagnostics, safe fixes, and starter integration (§17.7) |
| pnpm policy | Exact toolchain pin, frozen lockfile install, clean-cache starter install, reviewed build approvals, blocked unreviewed fixture without script execution, and no automatic or blanket approval (§10.10) |

### 15.1 Selected testing tools

Use **Vitest** for unit and component tests, **React Testing Library** for React behavior, and **Playwright** for browser integration/end-to-end tests. Pin mutually compatible versions and a supported Node.js version. Vitest uses a Vite-based transform pipeline; it does not require the production application to use Vite. Keep its test configuration separate and align TypeScript paths, generated aliases, and fixtures with the Rspack build. See the [Vitest guide](https://vitest.dev/guide/).

Use a DOM test environment for appropriate component tests, but verify real layout, CSS `@scope`, portals, focus, history, federation, and hot updates in browsers against actual Rspack output. Exercise compiler-enabled and compiler-disabled fixtures; passing Vitest transforms alone does not verify the compiler/Rspack combination. Integration runs use the real shell and its auth flow. Unit fixtures remain isolated tests, not a separate developer shell or auth harness.

**MSW is optional and is not a default dependency.** Start with Vitest mocks at explicit request/service boundaries and Playwright network routing for controlled HTTP outcomes. Add MSW only if reusable HTTP fixtures across test environments justify it. Do not mock away the real auth boundary in the integration tests intended to verify auth itself.

Add focused cases to the matrix above:

| Area | Required coverage |
|---|---|
| Query | Stable client; loader/component cache reuse; native hook cache subscriptions versus imperative reads; key variables; cancellation; mutation invalidation; session changes; late results; independent concurrent mounts |
| Telemetry | All seven public members; recording provider; attribution; log levels; measurement units/observation semantics; provider replacement; declaration and bundle independence; sink failures; bounded overflow; error deduplication; no render/subscription churn |
| Tracing | Span completion/status/exceptions; repeated end; leaked-span disposal; non-recording handles; callback execution/return/error semantics; async correlation; nested/parallel/cross-mount isolation; safe propagation origins; auth retries/cancellation; no global patches or recursive transport instrumentation |
| Tecton | Packaged source compilation; utility discovery; tokens once; React Aria provider sharing; Drawer integration or explicit exclusion; focus and overlay cleanup |
| Browser policy | Reproducible version matrix; required-feature intersection; measured global coverage at least 91%; minimum-engine scoping checks |
| State and recipes | No framework general store dependency; mount-isolated Zustand; unrelated form fields remain unaffected; stable table data/columns; compiler behavior |
| Shell-state hooks | App/independent Widget parity; selectors; user/group/theme isolation; account transitions; no inherited parent router |
| Native blocking | Local/shell/nested exits; back/forward; MFE-owned UI; proceed/reset once; current/next boundary semantics; multiple blockers; rapid transitions; beforeunload limits; forced cleanup |
| Persisted-state lifecycle | Logout/account/tenant/group reset; unchanged group-set no-op; preference retention; unmounted records; stale cross-tab writes; retired-generation fences; schema migration success/failure/future version; storage failure without unrelated deletion |
| Preloading | Hover without mount/visit/commands/blockers/mutations; repeated loaders; abandoned/error preloads; committed visits; session/group invalidation |
| Deadlines | Load/mount/disposal expiry; configured durations; generation fences; shared-load waiters; cleanup failure; unaffected sibling mounts; timers cleared; no timeout while user resolves a blocker |
| Author testing utilities | Packed test-only entry; actual providers; alias fixtures; state transitions; records/spans; automatic async cleanup; isolated environments; exclusion from production bundles |

### 15.2 Supported author testing utilities

Publish a test-only `@company/mfe-react/testing` entry point. It must not be imported by the production entry or included in author production bundles. Use it with Vitest and React Testing Library; this is not a standalone interactive shell or an alternate authentication system.

Provide `createMfeTestEnvironment(options)` for a single simulated mount with explicit definition ID, shell-state fixtures, and optional config/request fixtures. It supplies:

- `wrapper` for component/hook tests, using the actual framework providers;
- typed `routerContext` with the immutable `mfe` snapshot for newly started native loads/navigations and the same mount-owned `queryClient`, for native route tests;
- `setShellState(patch)` to exercise real snapshot/session/group update behavior inside the test's normal React update boundary;
- a recording `telemetry` provider exposing records and span lifecycles;
- isolated local/session storage fixtures and controlled session/access generations;
- an idempotent async `dispose()` that tears down the simulated mount and all resources.

Ship `renderApp` and `renderWidget` helpers for testing actual definitions through an in-process loader, with the same lifecycle, input validation, scopes, service providers, and cleanup semantics as production adapters. Route helpers use one immutable snapshot per native load/navigation, update the context for newly started loads, and supply the same state source to live shell-state hooks. They preserve a callback chain's selected snapshot across `await`. Route tests supply test-owned memory history through the factory's `history` option; no global History patch is needed, and this does not prove the browser bridge. Widget tests need no router. These helpers compose with React Testing Library queries and rerender operations rather than replace its API.

The scaffold's test setup registers automatic cleanup after every test, awaits disposal, and resets clocks/request mocks/recorded state. No persistent singleton may leak state between tests. Multiple environments in one test remain independent; explicit shared storage fixtures can model intentional same-definition sharing. Provide documented generated-alias fixtures for `#mfe/config` and `#mfe/fetch` so the source under test compiles unchanged; do not invent an alternative production config API.

Include working examples for a Widget observing shell theme/groups, a route using context and Query, storage invalidation on group changes, native navigation blocking with MFE-owned UI, and telemetry assertions. Compile and run those examples in CI. A test helper must not silently supply live credentials or claim federation, CSS layout, or real authenticated integration coverage; those remain browser tests under §15.1.

## 16. Phased implementation gates

### Implementation constraint for the first slice

The first team will not have the legacy App repositories. The legacy adapter is a later workstream. The first slice must not require those repositories, modify their bootstrap files, or change the current shell's legacy loader, registry behavior, shell-owned legacy routes, or History patch.

Until the legacy gate begins, use contract fixtures and test doubles only. Do not claim legacy compatibility from fixtures alone.

### Gate ordering principle

**Each gate retires a category of risk, and the riskiest categories come first.** Building outward from the contract is tidy but back-loads everything uncertain: federation, the build, and the dev loop are where this design is most likely to be wrong, and discovering that late means reworking every gate above it.

The first two gates are therefore both tracer bullets. Gate 0 proves the contract with the loader faked. Gate 1 proves the integration with the loader real, plus small feasibility fixtures for navigation blocking, concurrent mounting, and async tracing. They establish required mechanisms without building the full feature surfaces.

### Gate 0: contract tracer bullet

Establish the shared coding conventions, Prettier, ESLint presets, strict TypeScript configuration, package-boundary checks, Vitest/React Testing Library, and CI commands in §§15.1 and 17.6–17.7 before expanding the implementation. Pin the latest stable pnpm release and enforce the dependency build policy in §10.10. Implement custom lint rules alongside the APIs they guard, before those APIs pass their gate. Apply these requirements to this tracer bullet and every subsequent gate.

Prove one complete new-contract path without legacy code, MF2, or a deployed remote:

1. Define the neutral App contract with plain `id`, lifecycle state, structured errors, retry, and idempotent disposal.
2. Implement the React facade accepting a router factory and keeping router details inside the adapter.
3. Add a host test fixture with an in-process loader. The seam is test-internal and must not become a public loader API.
4. Mount one App by `id`, supply `/tracer` as its boundary, render, observe live shell state through `useUser`/`useGroups`/`useTheme`, read the load/navigation's immutable snapshot in native route callbacks, and dispose. Prove that theme-only updates leave unrelated consumers and loaders unaffected, do not restart in-flight route work, and update the snapshot for newly started native loads/navigations. An awaited parent and child callbacks that begin later in the same load must retain that load's selected snapshot.
5. Assert the App receives the constrained adapter history but no shell router or `window.history`; disposal aborts its signal and drops its router, and a failed mount is an explicit error.
6. Compile the introductory factory/root-route/augmentation fixture and prove the construction-time history forwarding, identity validation, and absence of global History patches described in §5.2. Verify the `mfe` namespace and reserved-key conflict detection at factory and route-context boundaries (§5.4), adding service-specific cases as those services arrive. Unproven factory/history/context assumptions block expansion beyond this gate. Browser coordination and the complete session/cache integration retain their later gate requirements; passing this in-process tracer does not prove them.

Do not implement Widgets, capabilities, commands, breadcrumbs, configuration, auth, CSS compilation, MF2, or the legacy adapter here.

### Gate 1: integration tracer bullet

Gate 0 fakes the loader, so it cannot answer anything that only breaks at the remote boundary. This gate makes that boundary real with one minimal App and targeted feasibility fixtures; mount the same App twice where needed to prove isolation.

Build one real remote with `mfePlugin()` and load it over MF2 from the shell, with the dev server running.

Exit when all of the following are answered:

1. MF2, TanStack file-based routing, and Rspack compose in one working build.
2. **A route edit hot-updates through the remote boundary without a full shell reload.** If it cannot be made to work, the fallback is fast reload with shell state and current URL preserved — an explicit decision recorded here, not a discovery made later.
3. The shared React singleton resolves correctly between shell and remote, with no second copy.
4. The `localStorage` URL override loads a local dev remote end to end.
5. Generated `@scope` CSS survives federation and applies to the remote's tree.
6. The new-App boundary bridge handles local navigation and browser back/forward without a new global History patch. Gate 8 broadens this proof; it does not defer the core feasibility decision.
7. A developer can connect this remote using executable instructions and get editor types before starting the shell. Record initial author-journey friction for §17.3.
8. React Compiler runs on the actual shell/remote source with verified runtime sharing, lazy-route transform composition, source maps, hot updates, and acceptable build/edit-loop timings. Record the pinned integration and test mixed compiled/uncompiled consumers (§10.9).

9. Native TanStack blockers pause shell-driven boundary exit and back/forward, retain MFE-owned UI, and proceed/reset exactly once without a framework hook (§6.4).
10. Two simultaneous mounts of the same App isolate router/context/loader/blocker state and disposal, including their shared generated tree (§5.2.1).
11. A minimal shell tracing adapter preserves parentage across `await` and concurrent operations in two remotes, including calls through a test request boundary, without new global fetch/History/event-listener patches. Use framework-owned tracing contracts and actual emitted browser code. Failure blocks expansion; resolve feasibility now rather than deferring it to Gate 5 (§5.16).

Run these browser checks through Playwright against real Rspack output. Prove one packaged Tecton component compiles and receives scoped styles, and record the initial browser feature/coverage matrix (§9.2). Full overlay coverage remains Gate 6. These are feasibility proofs, not claims that the complete telemetry/auth integration already exists.

Each of these can invalidate decisions in this document. Finding out here is cheap; finding out at Gate 5 is not.

### Gate 2: neutral contracts and registry

Implement `@company/mfe-core` and the neutral portion of `@company/mfe-host`: definitions, storage helpers, Widget inputs/events, lifecycle, structured errors, normalized records, duplicate-ID diagnostics, table-driven adapter selection, and malformed-descriptor quarantine.

New-contract fixtures only. Selection must already reject malformed advertised new descriptors without treating them as legacy. Storage tests verify `<id>:<key>`, separate stores, same-id mount sharing, `clear()` ownership, read/write validation, retention/session/group invalidation, and explicit schema migration (§5.13.1). Add bounded load/mount/disposal lifecycle tests (§7.4).

Retain Gate 1's concurrent-mount proof as a regression fixture against the pinned TanStack version. Any tree-instantiation remedy must continue to use supported integration points and preserve author ergonomics (§5.2.1).

Exit when both tracer bullets use neutral contracts rather than test-local types.

### Gate 3: public facade, Widgets, nested Apps

Complete `@company/mfe-react`: `lazyWidget`, `mfeRoute`, `AppHost`, contract validation on both sides, diagnostics/telemetry provider binding, `useTelemetry`, mount-owned Query clients, lifecycle and error integration, and `fallback`. Add Widget mounting after the App path is stable. Verify the Query lifecycle, all telemetry members, framework-owned tracing types/constants, span cleanup, recording/alternative providers, and author declaration independence here. Gate 5 completes real authenticated Query requests and shell OTel/Faro integration.

Exit when Apps, an independent Widget, and nested Apps delegated at a splat route pass mount, boundary, input/event, validation-failure, error, and disposal tests. Include live shell-state hooks, one immutable `context.mfe` snapshot per native load/navigation with updated snapshots for newly started loads, non-React service access and hook identity parity, top-level Query client protection, preserved author extensions, latest-handler delivery, subscribed storage, parameter updates, retry with current inputs, and Strict Mode cleanup. Run the available author-journey tasks now rather than waiting for release.

Also require `useUser`, `useGroups`, and `useTheme` in independent Widgets and Apps, the supported testing utilities (§15.2), and render-isolation tests for shell-state hooks, native route context, Widgets, storage, and lifecycle. Verify preload/activation separation (§11.2). Capture the initial production performance baseline in §17.5 before adding command and breadcrumb features.

### Gate 4: capabilities, commands, breadcrumbs

Add static capability route extraction, `useCommand`, and native-match breadcrumb composition with `useBreadcrumbs`.

Exit when shell placement, capability opening, command unmount removal, parent-child breadcrumbs, App opt-out, and the hook override pass. Preloading must not register commands or publish breadcrumbs (§11.2).

Extend the render-isolation fixture with command and breadcrumb updates. Callback identity changes and equal breadcrumb values must not repeatedly rerender shell surfaces.

### Gate 5: configuration, auth, and generated output

Implement config discovery, generated bootstrap validation, `#mfe/config`, `#mfe/fetch` with the origin allowlist and single-flight refresh, `#mfe/meta`, contract type emission, the registry descriptor, the runtime-config JSON Schema, `.env.example`, container asset URL generation, sharing defaults with singleton conflict errors, and the scaffold.

Exit when a generated container validates config before application import, loads one config for all exports, attaches auth only to declared origins, resolves assets against the container, keeps MF2 private, leaves ordinary Rspack options usable, and `pnpm create @company/mfe` produces a running App. Complete real Query session-transition tests, provider-neutral telemetry through the shell's OTel/Faro adapter, and the selected Zustand/Form/Table recipes. Prove async tracing across route loads, mutations, and parallel authenticated requests without cross-mount context leakage, vendor imports in author bundles, or global API patches (§5.16). Verify compiler compatibility for those recipes and packed Tecton consumption.

### Gate 6: CSS isolation and overlays

Implement native `@scope` output, nested boundaries, automatic roots, portal roots, and design-system portal wiring. No fallback mode.

Exit when generated CSS and Tecton overlay tests pass without duplicate reset/token output. Resolve Drawer under §9.1, verify the shared portal context and theme propagation, and test nested/repeated mounts across the supported browser engines. No component may silently escape its scope.

### Gate 7: full local development loop

Complete the developer path proven in Gate 1: boot-time overrides for every registry entry, the reload requirement, the active-override indicator, local runtime config resolution, dev API origins in the auth allowlist, and per-entry quarantine of broken overrides.

Exit when a developer clones one MFE, overrides its URL, reloads, and develops against the real shell with a real session, with a broken override leaving the rest of the shell working.

### Gate 8: explicit navigation bridge

Extend and harden the shell-boundary bridge already proven for new Apps in Gates 0–1: boundary reads, subscriptions, push, replace, back, forward, reload, without exposing raw History or patching global History.

Do not remove the current shell History patch or change legacy parcel behavior until the legacy gate has a compatibility harness. The final state still requires removal.

Exit when new Apps use local routing, boundary operations are explicit, native navigation blockers work across nested and shell-driven transitions with MFE-owned UI, and no new code adds a global patch. Broaden the blocker proof from Gate 1 to multi-blocker ordering, cancellation, rapid successive navigations, beforeunload, and forced-disposal exceptions (§6.4).

### Gate 9: legacy adapter and migration

Add `@company/mfe-legacy-angular` as a separate, removable adapter using the documented loader, registry fields, shell routes, release-note fallback, `single-spa-app` exposure, baseHref behavior, and initializer replacement.

Requires the legacy repositories or production-equivalent fixtures. Replace only the initializer in Asset Tracker and Rigstream, preserve their router providers and parcel lifecycle, then remove the shell History patch through the bridge.

Exit when legacy top-level and nested Apps pass mount, navigation, back/forward, unmount, remount, settings, release notes, and route metadata tests. A malformed new descriptor must still never silently fall back.

### Gate 10: release review

Run the full targeted suites. Verify acceptance criteria, selective reactive behavior, the performance gate (§17.5), implementation quality (§17.6), lint tooling (§17.7), React Compiler compatibility (§10.9), pnpm build-script controls (§10.10), public import boundaries, diagnostics, the progressive-disclosure rules, the portability test, the author-journey DX gate, and migration documentation. Require the 91% browser compatibility report (§9.2), telemetry provider-isolation tests, and Changesets/packed-artifact release verification (§10.11).

The release is blocked by any silent fallback, public MF2 leakage, Widget boundary access, capability inference, broken shell-owned legacy route, missing explicit configuration/lifecycle error, global History or fetch patch, or token exposure outside the documented per-connection transport escape hatch.

## 17. Implementation planning notes

Keep the public author contract smaller than the internal runtime. Authors must not learn registry event streams, mount-instance fan-out, compiler export-shape rules, MF2 manifest structure, portal target creation, or opaque ownership IDs.

Use `execute`, not `run`, for command callbacks. Keep `canExecute` as UX guidance, not permission enforcement.

Keep all errors explicit. Preserve the affected `id`, version, operation, direction, and field path. A failed mount is visibly failed, not an empty successful mount.

Budget real effort for error *messages*, not just error codes. A code plus a field path is a machine artifact; the developer-facing string must name the definition, the field, what arrived, what was expected, and which side declared the expectation. While devtools are deferred (§3), message quality is the single highest-leverage investment in the debugging experience, and it is the thing most likely to be skipped under delivery pressure.

Do not name public API after the framework. `useCommand` and `useBreadcrumbs`, not `useMfeCommands` and `useMfeBreadcrumbs`. Framework-prefixed names advertise the MFE machinery at every call site, which is the opposite of the design principle. The normal subscribed storage hook is `useStoredState`. The `useMfe*` prefix remains only for the tier-2 imperative storage accessor and mount signal.

### 17.1 Concept budget

The table in §5.1 is the default quickstart surface. Keep it small through progressive disclosure, but a symbol count is not evidence of good DX. Additions require a concrete author task and evidence that they reduce total setup, debugging, or maintenance work. The task-based gate (§17.3) is the release criterion; hiding a necessary step to preserve a concept count does not satisfy it.

Generated modules are concepts too. Keep them under one `#mfe/*` prefix with one regeneration command, and hold the same budget: `#mfe/config`, `#mfe/fetch`, and `#mfe/meta` are the ceiling for modules an author imports by hand. Everything else is invisible build output (§10.3.1).

Before adding anything to tier 1, answer in order:

1. Does TanStack Router already have a mechanism for this? Use it.
2. Can the build or runtime do this invisibly? Do that.
3. Can it be tier 2 — documented, discovered on need, absent from the quickstart? Put it there.
4. Only then consider tier 1, document the author task it improves, and demonstrate the improvement in §17.3.

### 17.2 Portability test

The example App has a CI-only plain TanStack bootstrap that replaces its MFE entry and build plugin. Explicit test substitutes supply configuration, mocked requests, shell-state hook providers and route-context snapshots from one source, commands, storage, and nested composition at documented integration boundaries. All imports resolve and the fixture compiles and runs; unresolved aliases are not an allowed success condition.

Representative routes and feature components remain unchanged. The fixture includes a command, configuration access, subscribed storage, and nested composition so it exercises real integrations. It verifies that business behavior is separable from deployment plumbing without pretending documented framework integrations have no dependencies.

This is a portability/test fixture only, not a standalone interactive development environment. Authenticated integration remains exclusively in the real shell.

### 17.3 Task-based developer experience gate

Use the supported pinned toolchain and a developer unfamiliar with the framework. Observe these tasks using only the shipped scaffold, documentation, and diagnostics:

1. Scaffold, enroll, connect, and run an App against the real shell with a real session.
2. Add a route, import an asset, and fetch data through authenticated fetch.
3. Create a Widget-only project, preview it in the shell-hosted placement, and consume its runtime contract from an App.
4. Embed a child App, read a typed child-owned URL parameter, and change it without losing unrelated mount state.
5. Change Widget inputs, shell theme, command availability, and a stored preference; observe reactive updates without synchronization effects or callback memoization workarounds.
6. Diagnose an intentional contract mismatch and retry using corrected inputs; diagnose and reset an incorrect URL override.
7. Write and run a component test with explicit context/config fixtures and mocked requests, without a shell process or live credentials.

Before the first session, the team records target completion times for each task. Report actual elapsed time, setup prerequisites, requests for help, unexplained boilerplate, and any inspection of generated or federation internals. Time targets are project-specific and cannot be relaxed retrospectively to declare a pass.

The gate passes when all tasks complete from a clean checkout with the shipped instructions, no undocumented manual generation or setup, no token handling, no stale state, no unexplained remounts, and no maintainer intervention. Missed time targets or required workarounds produce tracked DX defects and a repeat of the affected task after repair. A small public API does not waive this gate.

Run the available subset during Gates 1 and 3, and the complete journey during Gate 7 and release review. Do not defer usability discovery until implementation is complete.

### 17.4 Diagnostic message acceptance

Each developer-facing framework failure names the definition, operation, relevant field or resource, expected condition, observed condition, and owning side, then gives a concrete repair step. Preserve source locations and original causes where available. Redact tokens and sensitive payload fields; diagnostic usefulness does not require logging whole inputs.

For example: `alert-panel rejected input alertId: expected a string, received undefined. The Widget provider declares this field. Check the alertId prop in the consuming component. The previous valid inputs remain displayed.`

Errors must distinguish failed initial mounting from rejected updates, loading from failure, session-level reauthentication from mount failure, and retry from reload. Pending/error/retry examples ship in both starters. Recovery follows the current values and cannot resurrect disposed work.

### 17.5 Performance and render-isolation gate

The gate measures framework-induced work using the pinned dependencies. Shell-state hooks and other external-store adapters follow React's requirements for [cached immutable snapshots and stable subscriptions](https://react.dev/reference/react/useSyncExternalStore); consumers of native route context and router state use [native selection and supported render optimizations](https://tanstack.com/router/latest/docs/guide/render-optimizations). Native route-context selection does not supply shell-state subscriptions. These references guide implementation; tests against the pinned versions establish the actual guarantees.

Use isolated probe components so ordinary parent rerenders are not mistaken for subscription fan-out. Measure committed updates after initial mounting in a production/profiling build. Run a separate development Strict Mode suite for cleanup and stale-callback correctness; do not turn intentional development render invocations into production performance failures.

| Trigger | Required observation |
|---|---|
| Change only theme | `useTheme` consumers selecting a changed value update; `useUser`/`useGroups` probes and unrelated loaders do no additional work. In-flight route work keeps its immutable snapshot without restarting, including later callbacks after an awaited parent. Newly started native loads/navigations use the updated theme snapshot. |
| Write one storage key | Subscribers for that key update; other key/ID/store probes have zero additional commits. Same-value writes publish no changed snapshot. |
| Replace only a Widget handler | The latest handler receives the next event; provider input-validation count, remote render count, and channel registration count do not increase. |
| Change one Widget's inputs | Its mounted instance updates; unchanged sibling mounts have zero additional commits or validation. |
| Rerender a command owner with equivalent visible state | Callbacks stay current; palette subscribers receive no changed snapshot. Other commands are not reevaluated. |
| Supply equivalent breadcrumb items | The composed trail retains its snapshot and the header has zero additional subscription-induced commits. |
| Retry one failed mount | Only that mount's observers transition; unrelated mounted views do not rerender. |
| Dispose and remount repeatedly | Live mount, root, subscription, and command counts return to baseline after cleanup; intentional module caching is accounted for separately. |

A representative scaling fixture includes two mounts of one App, 50 Widget mounts, 100 commands, and subscriptions across 100 distinct storage keys. Compare against a small fixture with the same changed consumer. Updating one key, Widget, or command must not validate, notify, or render all unrelated consumers; shared-key subscribers are intentionally affected together. Measure relevant validation, callback, notification, and commit counts as well as elapsed time so a cached render cannot conceal excessive upstream work.

Before collecting the acceptance baseline, record device/browser, build mode, network profile, payload sizes, sample count, warmup, and agreed absolute p95 budgets for reactive updates and cold/warm mount readiness. Record framework JS/CSS transfer size, route/container requests, long tasks, and retained resources. Set project-specific budgets from the shell's interaction and loading targets; do not invent hardware-independent millisecond guarantees or relax a budget retrospectively to pass a regression.

Gate 1 establishes load and edit-loop measurements. Gate 3 establishes reactive isolation and scaling measurements. Gate 4 adds command/breadcrumb coverage. Gate 10 blocks release on failed isolation requirements, unexplained resource growth, or exceeded agreed budgets. Reducing committed renders does not justify dropping updates, stale closures, delayed authorization changes, or hidden validation failures.

### 17.6 Implementation standards and maintainability gate

#### Readable structure and control flow

- Give each module a coherent responsibility and keep package dependencies aligned with §12. Separate validation, state transitions, external side effects, and framework-specific rendering where this makes their behavior easier to follow.
- Use descriptive domain names consistent with this specification. The same operation uses the same term across packages; do not introduce interchangeable names for loading, mounting, retrying, disposal, or event delivery.
- Prefer explicit control flow, focused functions, and early returns over deeply nested branches, dense expressions, boolean mode flags, or helpers that obscure the operation being performed. Do not impose arbitrary line-count limits that fragment a readable operation.
- Keep state ownership, mutation points, cancellation, subscriptions, and cleanup visible. Lifecycle and retry transitions must be traceable in one cohesive implementation rather than scattered across unrelated effects. Avoid hidden global mutable state and initialization side effects.
- Introduce shared helpers for repeated semantics, not superficial syntactic similarity. Avoid speculative general-purpose frameworks, unnecessary indirection, and abstractions whose only consumer would be a hypothetical future adapter. Prefer a small amount of clear duplication over a misleading shared abstraction.

#### Consistent types, errors, and documentation

- Use a shared strict TypeScript baseline. Model finite states and outcomes explicitly; validate unknown external values at their boundary and narrow them before use. Public contracts must not depend on unchecked casts or broad `any` types.
- Keep unavoidable interoperability casts, lint suppressions, or dependency workarounds local and explain the specific limitation. Do not disable checks across a package to accommodate one exception.
- Use one consistent pattern for structured errors, async cancellation, subscriptions, and disposal. Preserve original causes and propagate errors according to §7; do not mix silent catches, logging-only failures, and thrown errors for equivalent operations.
- Document public APIs and non-obvious invariants, including ownership, update semantics, and cleanup obligations. Comments explain why a decision exists, especially for race handling and performance-sensitive code; they do not merely narrate the next statement. Remove stale comments, dead code, and commented-out implementations.
- Tests use descriptive behavior-oriented names and recognizable arrange/act/assert structure. Shared fixtures should clarify the scenario and expose important inputs instead of hiding setup behind a general-purpose test framework.

#### Automated formatting and static checks

- Use Prettier as the shared formatter. Use the shared ESLint presets in §17.7, integrating compatible existing rules rather than creating competing configurations. Pin versions and check in shared root configuration and editor settings. All framework packages inherit that configuration; justified package-specific exceptions are narrow and documented.
- Use the formatter as the authority for indentation, whitespace, quotes, semicolons, wrapping, and other supported layout choices. Define file naming, import organization, and export conventions once in a short contributing guide; enforce mechanically where practical. Reviews focus on clarity and behavior rather than personal formatting preferences.
- Provide `pnpm run format`, `pnpm run format:check`, `pnpm run lint`, and a root `pnpm run check` that performs required generation, format checking, linting, strict typechecking, and package-boundary checks. CI runs the checks without silently rewriting authored files. Required behavior and performance suites run alongside them.
- Apply these conventions to implementation source, tests, configuration, examples, and scaffold templates. Generated TypeScript intended for inspection is deterministic and formatted by its generator; fixes belong in the generator rather than hand edits to generated files. Minified distribution output and third-party code are excluded from source formatting, not manually reformatted.
- Scaffolded projects pass their own supplied formatting, lint, and typecheck commands from a clean checkout. A successful second generation produces no unexplained changes. Editor formatting and CI use the same committed configuration.

#### Review and performance tradeoffs

Every implementation gate requires both automated checks and human review of readability, naming, responsibilities, error paths, resource ownership, and consistency with neighboring code. Passing a formatter is necessary but does not establish clean code.

Choose the clearest implementation that meets the measured performance requirements in §17.5. When an optimization adds complexity, keep it localized, record the measured reason and invariant, and cover the behavior it could break with a focused test. Do not introduce caches, memoization, custom equality, or mutable shortcuts without identifying the work they avoid and the invalidation or cleanup they require. Equally, do not remove a proven optimization merely for aesthetic uniformity without rechecking the relevant performance gate.

Unresolved readability or consistency defects in changed code block its gate, just as functional defects do. The release review confirms that these standards were applied throughout implementation rather than postponed to a final cleanup pass.

### 17.7 Shared ESLint presets and custom rules

Ship a versioned `@company/eslint-plugin-mfe` development package with two composable flat-config presets: `framework` for implementation packages and `author` for Apps and Widgets. The author preset includes explicitly configured Widget-owned source scopes; it must not guess ownership from filenames or classify every shared utility as Widget-only. Install the appropriate preset automatically in the framework workspace and generated projects.

#### Existing rule foundations

Use ESLint's recommended baseline, [typescript-eslint's type-checked recommended configuration](https://typescript-eslint.io/users/configs/), the [React Hooks plugin](https://react.dev/reference/eslint-plugin-react-hooks), and the [TanStack Router plugin](https://tanstack.com/router/latest/docs/eslint/eslint-plugin-router), scoped to relevant code. Pin versions and explicitly review enabled rules when upgrading. Add stricter rules selectively when they identify concrete defects with acceptable false-positive rates.

| Area | Required coverage |
|---|---|
| Package and public API boundaries | Enforce §12's import DAG and prevent author imports of framework internals. Reuse restricted-import and established dependency-boundary checks where sufficient. |
| Async correctness | Floating promises, promise-returning functions used in synchronous positions, and deliberate rejection handling for background work. |
| Type safety | Unsafe `any` propagation, unjustified assertions, and exhaustive lifecycle/error handling where the contract is a closed union. |
| React correctness | Hook ordering, dependencies, purity, immutability, refs, render-time state updates, and static component definitions. |
| Compiler compatibility | Existing React diagnostics for unsupported syntax, incompatible libraries, configuration, and preservation of manual memoization; use the severity policy in §10.9. |
| Maintainability | Unused or unreachable code, accidental shadowing, consistent type imports, and explanations for narrow suppressions. |
| Router conventions | Applicable TanStack rules for route declarations, with ordinary route typing left to TypeScript. |
| Query conventions | Use the official TanStack Query ESLint plugin for stable clients, complete key dependencies, tracked-property-safe destructuring, and applicable stability rules. |
| State and telemetry boundaries | Restrict general state-library imports in framework implementation packages; restrict OTel/Faro imports to shell integration code, including type imports. MFEs use framework telemetry exports; MFE Zustand imports remain allowed. Reuse existing import restrictions rather than adding custom rules. |

Use the formatter for layout; do not duplicate formatting decisions through conflicting lint rules. Run type-aware lint through the same generated declarations as typechecking. Editor feedback must not depend on a running shell, and CI uses the full preset.

#### Initial custom rules

| Rule | Detectable violation | Scope |
|---|---|---|
| `mfe/no-global-patching` | Direct replacement of global fetch, History methods, or global event-listener methods | New framework and author code |
| `mfe/stable-definitions` | Framework definitions or `lazyWidget` component creation during rendering instead of at module scope | Author code |
| `mfe/no-raw-storage` | Direct browser-storage access bypassing namespacing, validation, and reactive notifications | Author code; storage adapter and documented shell override bootstrap are excluded by explicit scope |
| `mfe/no-widget-global-effects` | Direct browser-history or document-title/meta/favicon mutations in known Widget-owned code | Explicit Widget source scopes |

Resolve imported symbols and lexical bindings, including aliases and shadowed names; do not flag unrelated functions merely because their names match framework APIs. A scope restriction is not a runtime security boundary. Complex dynamic calls may be beyond static detection, so runtime guards and behavior tests remain required. Preserve existing legacy behavior until its migration gate; narrowly scope pre-existing patch exceptions and remove them with the legacy migration rather than disabling checks on new code.

The build plugin remains authoritative for static definition/export shape, duplicate IDs, reserved Widget props/event-name collisions, and capability metadata extraction. Do not reimplement those validations in ESLint merely to show them earlier. A shared diagnostic implementation may be exposed to editors when practical.

#### Rule quality and rollout

Each custom rule includes a concrete repair message, documentation, valid and invalid examples, and automated cases for aliases, shadowing, relevant TypeScript syntax, and legitimate framework exceptions. Autofix only when semantics are preserved; otherwise provide a suggestion or explanation. Test fixes for validity and repeatability.

Proven correctness and boundary violations fail CI. New heuristic rules start as warnings until exercised against the scaffold and representative framework/App/Widget code; promotion requires acceptable false-positive results. Suppressions name a specific rule and reason and stay local. Changes to enforced rules are versioned and accompanied by migration guidance.

Do not introduce blanket bans on inline callbacks or object literals, universal memoization requirements, compulsory selectors for every context read, arbitrary function-size limits, or claims that lint can prove resource cleanup or rendering performance. These decisions remain governed by API contracts, review, and the performance fixtures. Expand custom rules when recurring defects demonstrate value, not to increase rule count.
