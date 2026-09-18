# Implementation progress

## Current checkpoint — 2026-09-18

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

Validation is in progress. This environment cannot download Chromium because its network policy rejects the browser CDN; actual browser execution is assigned to CI, with no browser pass claimed yet.

## Remaining gate evidence

This test shell establishes the requested local integration path. Gate 1 remains open pending its full browser matrix, native blocker presentation across boundary exits, concurrent mounts of one generated tree, async trace correlation, and compiled/uncompiled adapter consumer proofs. Existing bridge unit tests are not a substitute for those browser proofs. No later-gate auth, widgets, telemetry vendor integration, command/breadcrumb framework, or legacy adapter is claimed.

Gate 9 separately requires legacy repositories or production-equivalent fixtures. Release gates retain unfamiliar-developer tasks, agreed performance budgets, browser coverage, and actual legacy compatibility.

## Earlier decisions and review branch

- The original contract was blocked by two reproduced native Router behaviors: default history construction patched global History, and context invalidation reran an unrelated loader. Historical evidence remains in [feasibility](gate-zero-feasibility.md). The original 124-test checkpoint and later 127-test Query comparison passed their regular checks while those original conformance probes remained red.
- The user authorized saving the review branch, then explicitly authorized initializing the empty repository's `main` with repository ignore rules. The connected GitHub app performed those writes because Git transport lacked write credentials.
- The first remote implementation commit was `ee2c91b253e2b1e111c405f8c3d7ba9baf98fbb6`; its tree exactly matched the local checkpoint. [CI run 35302612816](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35302612816) independently passed all 127 behavior tests and failed only the two then-unrevised contract assertions.
- The review branch is [`feat/mfe-framework`](https://github.com/rpkapps/mfe-frameowrk/tree/feat/mfe-framework). Original local history remains on `checkpoint/gate-zero-local`. The attached full specification remains excluded; its approved revisions are recorded in the tracked companion document. No merge, release, package publication, or deployment has occurred.
