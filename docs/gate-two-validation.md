# Gate 2: neutral contracts and registry

## Scope and base

This work starts from remote `main` at
`9bfdce2f296928c3034b30e7e84029938471703b`. PR #3 added the supplied specification
after the earlier PR #2 handoff. The specification is now tracked at
`docs/mfe-framework-spec.md`; approved revisions still govern tracing deferral,
history forwarding, live shell state, Rsbuild, and the current pnpm policy.

The base commit's [CI run 35395826577](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35395826577)
passed static/behavior checks, Gate 0, production builds, and browser integration.
That result belongs to the base commit, not this uncommitted Gate 2 change.

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
  all five strict TypeScript programs, package boundaries, **286 behavior tests
  across 28 files**, and dependency build-policy verification.
- Both Gate 0 conformance tests passed.
- All three production builds passed.
- Independent final storage/session validation passed **22 tests across two files**.
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

No push, merge, publication, or deployment is part of this local validation.
