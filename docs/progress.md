# Implementation progress

## Gate 1 bounded evidence — tracing deferred — 2026-09-18

- Replaced the custom modal path with native Tecton `Dialog`, `Button`, and
  `PortalProvider` usage. The native boundary blocker now restores the cursor
  before blocking and proceeds through the native resolver exactly once; a real
  host navigation regression covers this ordering.
- Added the real MF2 concurrent Discovery proof: two mounts use the same
  generated route tree while retaining distinct router/context/loader state,
  with per-mount unsaved-navigation blockers. The Chromium proof verifies
  scoped Tecton Dialog Escape, focus, and disposal isolation.
- Added compiled and explicit `use no memo` consumer coverage. Both consumers
  continue to receive selective framework hook/theme updates, and the build
  evidence checks compiler output, source maps, and retained scope locations.
- Portal forwarding is supplied upstream in
  [Tecton PR #24](https://github.com/rpkapps/tecton-ui-1/pull/24), which covers
  internal forwarding for supported React Aria Components overlay wrappers;
  consumers use the Tecton API. The earlier durable head
  `8b1aa66c2a600b8c32ebef6d98bafb6121e940d7` is historical. The current
  framework canonical artifact is repinned to upstream head
  `576a766a4af5401c7f232a5f9f8460acf9e31ae6`; independent validation reports
  the upstream 312-test, 21-file suite and workspace typecheck passing. Its
  `generated:check` also passed in CI run
  [35385630925](https://github.com/rpkapps/tecton-ui-1/actions/runs/35385630925)
  (59 checks reported, 0 failures).
- Historical CI run [35380935168](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35380935168)
  at exact commit `adf97ab9412b50501e6cfc7781a7d6f6c30a036a` passes 208
  behavior tests, both Gate 0 tests, all three production builds, and all 13
  Chromium browser tests in 39s. The dual-mount scoped Tecton Dialog proof
  covers Escape, focus, and disposal. Firefox and WebKit remain untested.
- Historical CI run `35387540423` on reviewed head `4e2daa1` recorded 210 behavior
  tests, both Gate 0 tests, all three production builds, and 14 Chromium checks
  in 34.4s. Its tracing fixture result is historical only after the approved
  tracing deferral; no current tracing pass is claimed.
- `node scripts/build-test-apps.mjs` exited 0 for all three production builds in
  that historical record. The remaining Gate 1 evidence is preserved; tracing
  is no longer its item 11 blocker.

## Gate 1 bounded evidence — 2026-09-18

- Added a real Discovery remote navigation blocker using TanStack Router's native
  `useBlocker({ withResolver: true })`. The remote presents MFE-owned stay/leave UI for
  shell exits and browser Back; the Playwright cases are in
  `tests/browser/test-shell.spec.ts`.
- Added an in-process React proof that two mounts share one generated-style route tree while
  retaining distinct routers, histories, contexts, and disposal in
  `tests/tracer/contract-tracer.test.tsx` (17 tests pass in that file). This is not a browser
  proof of concurrent federated mounts.
- The local environment had no Playwright Chromium executable for this historical checkpoint;
  the reviewed CI run above supplies the browser evidence.
- Tracing is deferred by the approved contract revision. The prior OTel/Zone
  characterization and fixture remain historical evidence only; no tracing
  implementation, browser pass, public carrier, or arbitrary-await parentage
  promise is claimed now.
- Post-removal local validation passes 208 behavior tests across 22 files and
  all three production builds. The 13 Chromium checks are listed but were not
  run, and no CI upload exists for this removal state.

## Trace feasibility status — deferred — 2026-09-18

Tracing is removed from the current Gate 1 exit requirement. The original item 11 no longer
blocks the remaining Gate 1 work. A later dedicated tracing gate must review and prove the
framework-owned contract before telemetry-provider integration; no deadline or new public API
is approved. Existing `startSpan`/`startActiveSpan` semantics and the standard `#mfe/fetch`
signature remain unchanged.

## Rsbuild surface migration — 2026-09-18

The active build surface is now `@company/mfe-rsbuild`: native `mfePlugin` and `sharedReactPlugin` plugin collections compose through Rsbuild, while MF2 remains private. Rsbuild uses the Rspack engine underneath, so this changes package and configuration names without introducing a second bundler. All three production builds pass. Two Rsbuild inspection tests pass for object/function PostCSS preservation, scope-last ordering, and compiler inclusion of App, adapter, and Tecton sources. Gate 0 has two passing tests. A live launcher probe passed HTTP shell and both manifests/entries, CORS, initial SSE, subset startup, SIGTERM cleanup, and port release. Full `check` passed with 205 behavior tests (202 baseline plus one boundary and two inspection tests), formatting/lint, all five strict TypeScript programs, boundaries, Tecton integrity, and dependency-script controls; the 10-test browser suite passed in [CI run 35368770074](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35368770074) at exact commit `ee2f2c95226797e72ed48c0b77cf783dfe90f3b6`. That earlier checkpoint preceded the bounded Gate 1 closeout recorded above. Earlier Rspack versions and test results remain historical evidence.

**Gate 0 passed with the approved contract revisions.** App factories forward framework-owned history before native router construction; existing shell-state hooks provide live UI while route callbacks receive native load snapshots. [Contract](approved-contract-revisions.md) · [validation scope](gate-zero-validation.md).

- Moved rendering from the test-only candidate into the React adapter. The in-process loader and memory boundary remain test fixtures; no public loader API was introduced.
- Added immutable field subscriptions and `useUser`/`useGroups`/`useTheme`, preserving no-op snapshots, selectors, and unrelated consumers. Updated the generated-route introductory factory and example.
- Validated forwarded history and reserved factory/route context, preserving author keys, wrappers, and native error boundaries. Supported native events settle navigation before retiring a conflicting mount; no route tree or router internals are patched.
- Tested native snapshot timing across an awaited parent, selective theme updates, current subsequent loads, Query ownership, and overlapping mocked session work. Disposal now settles framework transitions even when a native loader ignores cancellation.
- Independent review found and fixed two integration defects: the root error callback intercepted author-handled errors, and clearing active Query cache entries left their observers holding old data. Session transitions now reset observers before current-option refetch; disabled and keyed consumers have dedicated regressions.
- No Widgets, MF2/Rspack integration, commands, breadcrumbs, auth/config, CSS compilation, or legacy adapter was added before completing Gate 0. Packages remain private.

## Verification record

- `corepack pnpm@12.4.2 install --frozen-lockfile` passed with the existing dependency-script policy. No new third-party version or script approval was introduced.
- `corepack pnpm@12.4.2 run check` passed: generation, Prettier, full ESLint, strict workspace and independent App types, package boundaries, **161 behavior tests**, and real packed-fixture dependency-script controls.
- `corepack pnpm@12.4.2 run gate:0` passed both revised conformance tests. Assertions are neither skipped nor marked as expected failures.
- Repeated generation is byte-identical (`59547ee160aa4203bca7d2bea7a68a117b04a85b658df924a336a0da5fbbac17`). The generated tree stays ignored.
- Independent implementation, acceptance testing, and review covered field subscriptions, native event ordering, reserved keys, error fallbacks, Query observers, session overlap, and disposal. All reported P1/P2 findings are closed with targeted regressions.

These results establish the in-process contract gate. They do not substitute for real browser, authenticated-shell, production performance, or later-gate acceptance.

## In-repo test shell — 2026-09-18

The user explicitly requested a local shell and test MFEs after confirming no separate shell repository exists. This supersedes the original external-shell prerequisite for this development environment. Authentication remains a later integration responsibility.

- Added a Tecton `shell-01` composition with AppFinder, command palette, shortcuts, theme switching, and persistent header. Discovery and Geology are separate real MF2/Rspack remotes with native file routes, app-owned sidebars/PageHeaders, and interactive sample content.
- Added one-command `pnpm dev`, individual server commands, production builds, deterministic route generation, and Playwright CI. The orchestrator preflights ports and owns orderly server/compiler cleanup.
- Pinned the actual design-system source at `424889e4`; `tecton-ui-1code` returned 404, while the original spec's `tecton-ui-1` contains the exact supplied header. Immutable local source and generated declarations are verified; the shell loads tokens/fonts/reset once and remotes compile utilities under native CSS scope.
- Real build probes found a Babel 8 / React Compiler default-prop incompatibility. Babel 7.29.7 passes the same source, compiler regression, native lazy chunks, and source-map builds. No author rewrite or silent compiler disablement was used.
- Independent review identified and fixed failed-entry retry caching, SSE CORS, competing server signal handlers, and persisted-page teardown. Shell-state provider identity is shared explicitly across federation. New app programs retain strict types and author lint rules.
- Remote edit behavior is an explicit fast-reload fallback. Current URL and stored shell theme survive; component-local app state does not.

Validation is complete for the requested test environment:

- Full `check` passed: formatting, lint, five strict TypeScript programs, import boundaries, Tecton source/declaration integrity, **187 behavior tests**, and dependency-script controls. Both Gate 0 conformance tests remain green.
- All three production builds pass with compiler diagnostics enabled. A real launcher probe served the shell and both manifests, received a correctly allowed cross-origin rebuild event, and shut down all servers/compilers with exit code 0 on Ctrl+C.
- [CI run 35307532089](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35307532089) passed the complete pipeline and **all 9 Chromium browser tests**: persistent header/scoped app content, real remote loading, deep links/back-forward, live theme/user hooks, keyboard navigation, two mobile layouts, recovery from a failed remote entry, URL overrides, and a real route edit/reload preserving URL/theme. Desktop/mobile screenshots are retained in its browser-results artifact.
- Independent review's P1/P2 findings are closed. Local browser installation was blocked by this environment's network policy; the browser results above came from actual CI Chromium execution, not a DOM substitute.

## Remaining gate evidence

This test shell establishes the requested local integration path and the remaining bounded Gate 1
evidence is recorded. Tracing is deferred by approved revision. Later-gate auth, full telemetry
vendor integration, Firefox/WebKit coverage, performance, widgets, commands, breadcrumbs, and the
legacy adapter remain outside this closeout. Existing bridge unit tests remain supplementary to
the recorded browser proofs.

Gate 9 separately requires legacy repositories or production-equivalent fixtures. Release gates retain unfamiliar-developer tasks, agreed performance budgets, browser coverage, and actual legacy compatibility.

## Earlier decisions and review branch

- The original contract was blocked by two reproduced native Router behaviors: default history construction patched global History, and context invalidation reran an unrelated loader. Historical evidence remains in [feasibility](gate-zero-feasibility.md). The original 124-test checkpoint and later 127-test Query comparison passed their regular checks while those original conformance probes remained red.
- The user authorized saving the review branch, then explicitly authorized initializing the empty repository's `main` with repository ignore rules. The connected GitHub app performed those writes because Git transport lacked write credentials.
- The first remote implementation commit was `ee2c91b253e2b1e111c405f8c3d7ba9baf98fbb6`; its tree exactly matched the local checkpoint. [CI run 35302612816](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35302612816) independently passed all 127 behavior tests and failed only the two then-unrevised contract assertions.
- The review branch is [`feat/mfe-framework`](https://github.com/rpkapps/mfe-frameowrk/tree/feat/mfe-framework). Original local history remains on `checkpoint/gate-zero-local`. The attached full specification remains excluded; its approved revisions are recorded in the tracked companion document. No merge, release, package publication, or deployment has occurred.

## Adapter portability correction — 2026-09-18

- Moved shell-state contracts into core and the store into host. Host now owns registry/adapter selection, loading and retry fencing, placement, lifecycle, and neutral browser navigation. The React adapter owns only React rendering/hooks and native TanStack Router/Query integration; TanStack history fields are translated at its boundary.
- Added public `createAppRuntime`, adapter/driver contracts, `createReactAdapter`, and `AppHost`. The test shell configures catalogue, navigation destinations, shell inputs, and presentation through public APIs. MF2 loading, override validation, failure-cache eviction, and remote rebuild watching live in `mfe-rsbuild/runtime`.
- A DOM-only adapter exercises shared loading, concurrent isolated mounts, shell-state updates, retry, cancellation and disposal without React/TanStack. Existing React contract/session tests now run through the same host runtime. Review regressions cover late state-update failures, invalid-definition retry, and callback identity stability.
- This corrects ownership for the implemented surfaces; it does not add an Angular adapter or claim completion of the remaining Gate 1 matrix.
- Validation: full local `check` passed **202 behavior tests**, formatting/lint, all five strict TypeScript programs, dependency controls and package boundaries. Both Gate 0 tests and all three production builds passed. [CI run 35309488117](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35309488117) independently passed the complete pipeline, including **all 9 Chromium browser tests**, on runtime commit `90e9212fbf45ee86cd6b1d20cc5aad1800f92dc0`. No publication or deployment occurred.

## Tecton styling and pnpm cleanup — 2026-09-18

- Removed the shell, Discovery and Geology custom stylesheets. Fixture layout now uses Tailwind utilities with Tecton semantic tokens; controls, cards, badges, sidebars and headers use Tecton defaults/variants. The CSS entry files only load Tecton/Tailwind and declare source scanning. Geological SVG data colors remain illustration data.
- Removed broad element resets, palette fallbacks and component override selectors. Framework-owned DOM wrappers now size themselves, so the shell no longer styles internal mount elements. Vendored Tecton source remains unchanged.
- Per user direction, pnpm follows `latest` in CI and setup instead of a repository version pin. Removed manifest/engine and package-manager lockfile pins; dependency versions and explicit dependency-build approvals remain controlled. Policy verification exercises the pnpm executable that launched the check.
- Final local validation for this styling/pnpm revision passed the frozen install, build-policy check, full `check` (**202 behavior tests**), both Gate 0 tests, and all three production builds. The browser suite now contains **10 Chromium tests**, including the small-screen heading-fit and override-warning coverage. CI run [35365821940](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35365821940) passed all 10 tests for this styling/pnpm checkpoint; the Rsbuild migration browser evidence is recorded above.
