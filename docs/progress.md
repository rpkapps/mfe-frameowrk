# Implementation progress

## 2026-09-18 — specification and Gate 0

- Read the complete attached specification. The destination repository is empty; there are no repository-specific instructions or existing shell files.
- Confirmed the stable pnpm release is 12.4.2. Pinned Node 24.19.0 and compatible exact dependency versions.
- Parallel work: neutral lifecycle implementation, shared lint tooling, router feasibility review, and gate dependency review. Lead engineer owns architecture, integration, and executable feasibility probes.
- Gate 0 is **blocked; not passed**. Pinned native router construction changes global History methods; the tested native context-refresh path reloads unrelated data. [Evidence and proposed revisions](gate-zero-feasibility.md) preserve the original requirements and record the decisions needed.
- No Gate 1 or later feature implementation is authorized by a passing gate yet. No packages or applications have been published or deployed.

## Known integration prerequisites

- Gate 1 requires the real shell's source or supported integration location, startup/session prerequisites, and development registry enrollment procedure. None is present in this empty repository.
- Tecton source at the specified revision is accessible. Reproducible distribution remains an implementation task, not an access blocker.
- Gate 9 requires the legacy repositories or production-equivalent fixtures; contract doubles cannot establish legacy compatibility.

## Verified checkpoint

- `pnpm run check` passes: deterministic generation, Prettier, shared ESLint presets, strict workspace and separate App typechecks, import boundaries, and **124 tests**. The generated route tree is byte-identical across repeat runs and remains untracked.
- `pnpm install --frozen-lockfile` passes with pnpm 12.4.2 and no workspace dependency-script approvals. Real packed fixtures prove unreviewed scripts fail without executing, approved exact artifacts execute, and denied scripts remain blocked.
- `pnpm run gate:0` fails its **two unsatisfied conformance probes**. They are not skipped or marked as expected failures. CI runs this gate separately and therefore remains blocked.
- Neutral lifecycle ownership covers retry, immutable snapshots, current-attempt fences, synchronous detach, asynchronous cleanup, and structured failures. Independent review found and closed nested-cleanup retry and missing-version-attribution defects; focused regressions cover both.
- The test-internal React tracer renders through the actual facade/lifecycle/native router and verifies failure/retry/disposal. It also exposes post-loader reserved-context detection and unresolved navigation after a rejected later route. It is not a production adapter or an authenticated shell.
- Shared lint presets and symbol-aware rules have independent rule/preset/boundary coverage. The introductory native factory/root/augmentation fixture compiles against the exact locked dependencies.
- No Widgets, federation/build plugin, auth, CSS, scaffold, legacy adapter, or later-gate feature was added while Gate 0 was unresolved. All packages remain private. No release, merge, publication, or deployment occurred.

## Resume conditions

Resolve the explicit history-bootstrap and reactive-context contract decisions,
then finish the reserved-context/error-navigation proof and rerun Gate 0. Supply
the real shell/auth/session and registry-enrollment prerequisites before claiming
Gate 1. Retain all later acceptance gates, including actual legacy compatibility,
browser integration, performance measurements, and the observed author journeys.

## QueryClient follow-up

- User authorized saving the review branch and requested an investigation of QueryClient's context/reactivity behavior.
- Pinned source review and three new probes confirm stable-client access plus independent Query subscriptions. Cache changes update `useQuery` consumers without Router invalidation; imperative reads through either context remain non-reactive. With a fresh cache, reuse prevents another mocked query-function execution during invalidation but does not prevent loader/`beforeLoad` execution.
- The expanded behavior suite passes **127 tests**; strict TypeScript and focused lint/format checks pass for the follow-up. Production contracts and the two original conformance assertions are unchanged.
- [Query/context evidence](query-context-feasibility.md) records the tested combination and its limits. The recommended shell integration keeps one state source, native route snapshots/services, and direct field subscriptions through the already-specified hooks. Gate 0 remains blocked pending the contract decisions and remaining adapter proofs.
- Git transport lacked write credentials; automatic approval review initially rejected initializing the empty repository because authorization covered only the review branch. The user then explicitly approved initializing `main` with the repository ignore rules.

## Review branch saved

- Initialized `main` with only the repository ignore rules, then saved all 61 tracked checkpoint files to [`feat/mfe-framework`](https://github.com/rpkapps/mfe-frameowrk/tree/feat/mfe-framework) through the connected GitHub app.
- Verified commit `ee2c91b253e2b1e111c405f8c3d7ba9baf98fbb6` has the exact same Git tree as the locally verified checkpoint (`f3a3aac48a16c9868686a429431ef4870942a475`). The attached full specification, generated files, dependencies, and local test artifacts remain excluded.
- [GitHub CI run 35302612816](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35302612816) independently passed dependency installation, all static checks, and all 127 behavior tests. It failed only the same two Gate 0 conformance assertions for History patching and context refresh rerunning a loader.
- The local review branch now tracks the remote branch; the original two local commits remain on `checkpoint/gate-zero-local`. No merge, release, package publication, or deployment occurred. Gate 0 remains blocked as documented above.
