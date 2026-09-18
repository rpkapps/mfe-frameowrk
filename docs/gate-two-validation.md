# Gate 2: neutral contracts and registry

## Scope and base

This work starts from remote `main` at
`9bfdce2f296928c3034b30e7e84029938471703b`. PR #3 added the supplied specification
after the earlier PR #2 handoff. The specification is now tracked at
`docs/mfe-framework-spec.md`; approved revisions still govern tracing deferral,
history forwarding, live shell state, Rsbuild, and the current pnpm policy.

The base commit's [CI run 35395826577](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35395826577)
passed static/behavior checks, Gate 0, production builds, and browser integration.
That result belongs to the base commit, not the Gate 2 change.

Gate 2 adds neutral definitions, Widget input/event validation, storage contracts
and ownership, registry normalization, and bounded lifecycle phases. Core and host
remain independent of React, TanStack Router, and MF2. The React adapter and Rsbuild
transport consume the shared contracts. Public definition identity remains `id`;
load-owner tokens and mount ownership stay private.

Tracing remains deferred. This work does not add the React Widget facade, nested
Apps, commands, breadcrumbs, auth/config integration, legacy Angular translation,
or telemetry-provider integration.

## Acceptance coverage

| Concern                                                                                                     | Evidence location                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Per-entry quarantine, unsupported majors, all duplicate participants, table-driven selection                | `packages/mfe-host/src/registry.test.ts`                                                             |
| Neutral runtime integration, shared-load waiter cancellation and deadlines, stale load fencing              | `packages/mfe-host/src/app-runtime.test.ts`                                                          |
| Separate load/mount deadlines, bounded disposal, cleanup barriers, timer cleanup                            | `packages/mfe-host/src/mount-lifecycle.test.ts`                                                      |
| JSON-only Widget inputs/events, immutable snapshots, shallow per-prop equality, explicit retry and disposal | `packages/mfe-core/src/json-validation.test.ts`, `widget-contract.test.ts`, `widget-channel.test.ts` |
| Storage namespacing, validation, subscriptions, retention, migration and stale-generation fencing           | `packages/mfe-host/src/storage.test.ts`                                                              |
| Semantic session/group changes and retirement before shell publication                                      | `packages/mfe-host/src/storage-session.test.ts`                                                      |
| Author storage bypass diagnostics, aliases, shadows and scoped exceptions                                   | `packages/eslint-plugin-mfe/test/rules.test.js`, `presets.test.js`                                   |
| Retained native TanStack concurrent-mount and shell-state regressions                                       | `tests/tracer/contract-tracer.test.tsx`, `tests/browser/test-shell.spec.ts`                          |

The existing architectural tracer directory is unrelated to the deferred tracing
API. No removed tracing fixture is used as current acceptance evidence.

## Validation status

Local validation is complete. Node is exactly `24.19.0`; the latest stable pnpm
resolved to `12.4.2` without adding a repository package-manager pin.

- Frozen-lockfile installation passed with the existing dependency-script policy.
- Full `check` passed: generation, Tecton artifact integrity, Prettier, ESLint,
  all five strict TypeScript programs, package boundaries, **288 behavior tests
  across 28 files**, and dependency build-policy verification.
- Both Gate 0 conformance tests passed.
- All three production builds passed.
- Final storage/session validation passed **24 tests across two files**.
- Local Chromium installation timed out. No local browser pass is claimed for
  these changes; the retained browser suite requires fresh CI evidence.

Implementation was delegated to GPT-5.6-Luna. GPT-5.6-Terra reviewed architecture,
ownership, cancellation, cleanup, and readability; the parent owns integration
and final validation. All concrete review findings are closed, including shared
loader waiter ownership, timeout retirement, session publication ordering,
subscription refresh, disposal fencing, and observable storage failures.

The local implementation is reviewable on `feat/gate2-neutral-contracts`, based
on the main commit above. Gate 2 closeout remains pending fresh browser CI for
this change; Gate 3 remains unstarted. See [storage contracts](storage-contracts.md)
for the current neutral integration and explicit migration/reset examples.

The user authorized committing the implementation and opening PR #4. Its initial
commit `9db1964fee7dcc684badc1500b497c5c839cba71` passed
[CI run 35402124119](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35402124119).
The storage API conformance correction at `7a56201` passed a fresh full local
check, Terra's final review, and
[CI run 35403870098](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35403870098).
The subsequent internal simplification passed a fresh full local check and Terra's
readability/architecture review, with remote CI pending at this commit. Merge,
publication, and deployment still require explicit authorization.

## Storage API conformance correction

The naming audit found that Gate 2 had added reactive methods to the public
imperative storage types. Section 5.13 defines `MfeStorage` as `key/remove/clear`
and `MfeStorageKey` as `get/set/remove`, with `set(value: T)`.

The correction restores those exact public types and runtime facades. Reactive
bindings and functional updates move to the explicit host internal entry while
sharing the same coordinator, stored values, and notification ownership. Public
`set()` treats a function as invalid data and never executes it as an updater.

The existing `AppHost` facade still needs its Gate 3 alignment (`appId`, `fallback`,
and encapsulated host wiring). It is not a completed author contract. Current
`createApp`, `useUser`, `useGroups`, `useTheme`, and lifecycle method names already
match the specification and approved revisions.

Regression coverage checks the exact public method sets, the setter's parameter
type, function-value rejection without callback execution, and public writes
notifying internal subscriptions. The correction preserves all existing storage
and lifecycle tests.

The follow-up simplification gives declaration validation, public/internal handle
construction, and write evaluation distinct methods. One shared implementation
owns remove/clear behavior. Both public value writes and internal updater writes
use the same guarded commit path, which captures generation ownership before any
updater executes. No new storage state or public API was added. All 288 behavior
tests and full static/dependency-policy checks passed; independent focused review
passed all 24 storage/session tests.

## Hook gate boundaries

Gate 2 implements neutral contracts and helpers; it does not add React storage
hooks. Gate 3 completes `useStoredState`, `useMfeStorage`, and the remaining React
facade, including the `AppHost` contract. The existing `useUser`, `useGroups`, and
`useTheme` hooks came from the earlier approved live-state work; Gate 3 extends
their acceptance coverage to independent Widgets and Apps. Gate 4 adds
`useCommand` and `useBreadcrumbs`. Tracing remains governed by its separate
approved deferral.
