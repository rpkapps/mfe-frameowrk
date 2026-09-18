# MFE framework handoff

Updated 2026-09-18 for continuation in another session.

## Current repository state

- Remote continuation point: PR [#2](https://github.com/rpkapps/mfe-frameowrk/pull/2) is merged. Start from remote `main` at `ae00da00d596b442b357b5b112edc98d052cee68` (reviewed tree `839d9a2`) after verifying the live repository state.
- The last verified CI for the post-removal tree was [run 35391704355](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35391704355): 208 behavior tests, both Gate 0 tests, three production builds, and 13 Chromium checks passed in CI. The post-removal local checkout did not rerun Chromium; no current tracing implementation is claimed.

The full supplied specification is tracked verbatim at [`mfe-framework-spec.md`](./mfe-framework-spec.md).
The tracked [approved revisions](./approved-contract-revisions.md) remain authoritative amendments;
do not silently rewrite the source specification. The [progress record](./progress.md) and
[Gate 1 feasibility](./gate-one-feasibility.md) remain the concise evidence summaries.

## Decisions that must persist

History forwarding and live shell-state revisions are approved contract changes, not proof that
all later gates passed. The Rsbuild surface is `@company/mfe-rsbuild`; MF2, manifests, sharing,
and transport remain private. Use native TanStack Router/Query APIs, Tecton APIs, and the existing
plain TypeScript/useSyncExternalStore architecture. Do not add a general state-management
library for framework state. Keep pnpm aligned with the repository’s current latest/unpinned CI
policy, and retain the Rsbuild/Rspack distinction.

Tracing was explicitly removed from the current Gate 1 exit requirement and deferred. Original
Gate 1 item 11 no longer blocks the remaining Gate 1 work. The later dedicated tracing gate must
review and prove the framework-owned contract before telemetry-provider integration; the user did
not choose a deadline. The planned `startSpan`/`startActiveSpan` semantics are not currently
implemented/exported, and the planned `#mfe/fetch` standard signature is not a claim that auth or
tracing integration is complete. Do not resurrect the removed tracing fixture/API or infer a
public carrier without a new instruction. Pre-existing `tests/tracer` architectural Gate 0
integration tests remain current acceptance coverage; removed tracing-specific fixtures are not
current acceptance proof.

The current Tecton source lineage is open upstream PR [#24](https://github.com/rpkapps/tecton-ui-1/pull/24),
head `576a766a4af5401c7f232a5f9f8460acf9e31ae6`. Its canonical artifact generator check passed
with 59 checks and 0 failures in [CI run 35385630925](https://github.com/rpkapps/tecton-ui-1/actions/runs/35385630925);
the upstream 312-test/21-file suite and workspace typecheck were independently verified. Keep
consumers on Tecton APIs, Tailwind utilities, and native scoped CSS; do not make consumers learn
React Aria Components internals or add bespoke Tecton CSS overrides.

## Next implementation gate: Gate 2

Use the full specification’s Gate 2 section (§16, “neutral contracts and registry”) as the
authority. The bounded scope is:

1. Implement `@company/mfe-core` neutral contracts and the neutral portion of `@company/mfe-host`.
2. Add definitions, storage helpers, Widget inputs/events, lifecycle, structured errors, normalized records, duplicate-ID diagnostics, table-driven adapter selection, and malformed-descriptor quarantine.
3. Preserve the public plain `id` identity rule and keep provider/render/mount/scope identities private.
4. Add storage validation and lifecycle coverage: `<id>:<key>` namespacing, local/session separation, same-definition mount sharing, `clear()` ownership, read/write validation, retention/session/group invalidation, explicit schema migration, bounded load/mount/disposal lifecycle, cancellation, and stale-result fencing.
5. Retain Gate 1 concurrent-mount regressions against the pinned TanStack version. Do not assume shallow route-tree cloning is a remedy; use supported integration points.
6. Keep the neutral registry framework-free and table-driven. Malformed advertised new descriptors must fail explicitly rather than silently falling back to legacy behavior.

Exit Gate 2 only when the tracer bullets use neutral contracts rather than test-local types. Do
not jump to Gate 3 Widgets/nested Apps or later commands, breadcrumbs, auth/config, CSS, legacy
Angular, or provider telemetry surfaces while Gate 2 contracts remain unresolved. Preserve the
runtime ownership direction core → host → adapters and the package boundaries in §12.2/§12.4.
`@company/mfe-host` imports neutral contracts from `@company/mfe-core`; adapters import host/core
contracts. Core and host do not import React, Router, or MF2. Keep future Angular work behind
neutral, framework-agnostic contracts.

## Verification and development commands

Use the exact Node version in `.node-version` and the latest stable pnpm. The normal sequence is:

```sh
pnpm install --frozen-lockfile
pnpm run generate
pnpm run check
pnpm run gate:0
pnpm run build:test-apps
pnpm run test:browser
```

`pnpm dev` generates prerequisites and starts the local shell plus Discovery and Geology remotes;
`pnpm dev:shell` and `pnpm dev:remotes` split that path. Remote edits use the documented explicit
reload fallback, preserving URL and shell theme; no Fast Refresh timing is promised. Browser
downloads are restricted in some local environments, so use CI for Chromium evidence and label
local jsdom/in-process checks accurately.

## Working style and ownership

For implementation, always delegate code work to GPT-5.6-Luna and request GPT-5.6-Terra’s
architecture/review/testing pass; the parent agent owns architecture integration and final
validation.
Keep one coherent responsibility per module, explicit ownership/cancellation/cleanup, strict
types, visible arrange/act/assert tests, and Prettier-owned formatting. Run the readability review
for every gate. Do not claim authenticated-shell behavior from mocks, local DOM tests, or fixture
source. Do not merge, publish, deploy, or create external trees without explicit authorization.

## Suggested next-session prompt

> Continue the MFE framework from `docs/handoff.md` on remote `main` at the recorded merged PR #2
> head, after verifying the live repository and latest CI. Read `docs/contributing.md`,
> `docs/approved-contract-revisions.md`, `docs/progress.md`, `docs/gate-one-feasibility.md`, and
> the tracked full specification and its approved revisions. Tracing is explicitly deferred and must not be
> resurrected. Implement only the next Gate 2 neutral-contract/registry scope from §16 and §12:
> core/host neutral definitions, storage validation/lifecycle, normalized registry records,
> duplicate IDs, table-driven adapter selection, malformed-descriptor quarantine, and neutral
> contract tests. Preserve private identities, package boundaries, Tecton ownership, Rsbuild
> conventions, and existing Gate 1 regressions. Delegate implementation to Luna, have Terra review
> architecture, run the relevant checks, and do not merge/publish/deploy without authorization.
