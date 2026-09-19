# Gate 3: public facade, Widgets, and nested Apps

## Base and scope

Implementation starts from merged remote `main` at `95f2d66`, after PR #4.
The reviewed Gate 2 tree at `b29c324` passed
[CI run 35404679040](https://github.com/rpkapps/mfe-frameowrk/actions/runs/35404679040).
That evidence belongs to Gate 2, not the Gate 3 changes.

The authority is the supplied specification, especially §§5, 7, 12, 15.2,
16 (Gate 3), and 17.3–17.5, as amended by the approved revisions. Gate 3 adds
the React service/storage hooks, Widget facade, nested App composition, and
supported test-only utilities. Commands and breadcrumbs remain Gate 4.

Tracing remains deferred. No `useTelemetry`, tracing carrier, span API, vendor
provider, or recording telemetry substitute is introduced. The existing structured
diagnostics sink continues to report failures. Telemetry-related clauses in the
original Gate 3 and testing-utility descriptions remain explicitly deferred to
the dedicated tracing-contract work; they are not silently counted as passed.

## Acceptance work

| Area              | Required evidence                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Author API        | Exact named exports, inferred Widget props/events, `AppHost` with `appId`/`fallback`, native `mfeRoute`                   |
| Mount services    | Hook/context identity, independent Query clients, stable storage handles and signals, no Widget router/base path          |
| Reactive storage  | Defaults, functional updates, exact-key subscriptions, errors, shared-definition writes, session reset ordering           |
| Widgets           | Initial/update validation, latest committed event callbacks, retry with current inputs, independent mounts, Query cleanup |
| Nested Apps       | Splat boundary, child-owned URL/search updates, native error/reset flow, preload without activation, cleanup              |
| Regression        | Existing route snapshots, author extensions, reserved context, concurrent mounts and native blockers                      |
| Testing utilities | Real providers/runtime, isolated fixtures, awaited cleanup, test-only entry excluded from production                      |
| Author journeys   | Executable current-gate examples; distinguish automated walkthroughs from unfamiliar-developer observation                |
| Performance       | Production/profiling measurements and isolation/scaling fixtures; distinguish local behavior tests from browser evidence  |

## Local verification — 2026-09-19

- Exact Node 24.19.0 and latest stable pnpm 12.4.2; frozen installation passed.
- Full `pnpm run check` passed: generation, Tecton artifact integrity, formatting,
  lint, all TypeScript projects, package boundaries, **333 tests in 36 files**, and
  dependency-build approval controls.
- `pnpm run gate:0`: both architectural integration tests passed.
- `pnpm run build:test-apps`: shell, Discovery, and Geology production builds passed.
- The compiled production server returned 200 for its readiness document and
  shell HTML routes, 200 for both remote manifests, 404 for missing assets, and
  400 for malformed URLs. This verifies HTTP serving, not browser execution.
- The production browser command is `pnpm run test:browser:gate-three:production`.
  CI runs it after existing browser checks and retains a separate artifact.

Browser measurements, project-specific performance budgets, and unfamiliar-developer
task timings remain pending; passing in-process tests does not establish those
results or real authentication.

Local Chromium is unavailable in this workspace. A launch probe confirmed the
missing Playwright executable. A bounded installation attempt timed out fetching
Chrome from the Playwright CDN and then failed its download-directory lock update.
No Gate 3 Chromium or production performance result is claimed from that attempt.

Code implementation is delegated to GPT-5.6-Luna. GPT-5.6-Terra reviews architecture,
API conformance, ownership, cleanup, and readability; the parent owns integration
and final validation. No merge, deployment, or package publication is authorized.

## Review and evidence limits

Terra's final architecture, API, ownership, and readability review found no
remaining implementation blocker. Widgets use the neutral host lifecycle and
React adapter with injectable loaders. The Rsbuild MF2 registry still loads Apps
only: no federated Widget-loading or generated Widget-only scaffold result is
claimed. Those build/scaffold integrations remain Gate 5 work.

The compiler reports narrow skips in AppHost's cached-resource retry, the storage
hook's stable binding, Widget mount activation, and Widget event subscriptions.
The review found no correctness defect in those ownership patterns. These
functions are not claimed as compiler-optimized; their behavior is tested and
their production cost remains part of the pending baseline. Discovery's existing
explicit compiler opt-out is unchanged.

The isolated `loadApp('reports', { basePath })` example in §5.9 has no specified
host binding, target, return value, or disposal contract and is absent from the
§12.2 author export list. No public `loadApp` export is implemented or claimed.
`AppHost` and the neutral `AppRuntime.mountApp` are the implemented paths; the
imperative author escape hatch remains an unresolved specification detail.

Gate 3 remains open until fresh browser evidence, the production performance
baseline with agreed budgets, and the available unfamiliar-developer tasks have
been recorded. In-process tests and the runnable production fixture do not
substitute for those observations. Commands and breadcrumbs are excluded from
the current scaling fixture until Gate 4.
