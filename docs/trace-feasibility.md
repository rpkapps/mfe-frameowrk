# Gate 1 trace feasibility

**Status: pending the emitted browser proof.** The latest local check passes 210 behavior tests
across 23 files and the repository's formatting, lint, type, boundary, integrity, and build
policy checks. This record is feasibility evidence only. It does not add a telemetry
implementation, a provider dependency, or a new public tracing handle.

## Contract boundary

The existing tracing contract remains the source of truth (§5.16). `telemetry.tracer` keeps its
framework-owned OTel-shaped surface: `startSpan()` is non-active, `startActiveSpan()` scopes the
documented callback, callback return values and thrown/rejected errors are preserved, and authors
end spans they create. The callback API does not promise that an arbitrary author function keeps
an active parent across a native `await`. Those semantics must not be weakened or silently
changed.

The generated `#mfe/fetch` import keeps the standard `fetch` signature and its existing
authenticated request behavior. The current contract permits automatic instrumentation of
framework-managed route, Query, and authenticated-request boundaries. An internal operation
carrier can connect those boundaries after an `await`; that is an implementation detail within
the existing contract and needs no additional user approval. This feasibility fixture does not
claim that the Gate 5 `#mfe/fetch` integration is complete. It does not promise automatic
parentage for arbitrary author functions or ordinary calls that happen to cross an `await`.

No new exported `run`, `withContext`, `trace`, parent-handle, or equivalent API is proposed or
authorized. Passing the stable mount telemetry service does not itself provide an operation
carrier. The existing ban on global `fetch`, History, and event-listener patches remains in
force.

## Evidence

The executable local characterization in `tests/tracer/otel-context-probe.test.ts` uses the
pinned `@opentelemetry/sdk-trace-web` `StackContextManager` and an in-memory exporter. It proves
the two relevant Node behaviors:

- a synchronous child created inside `startActiveSpan()` is parented;
- after a native `await`, ambient context is absent, while explicitly passing a captured OTel
  context parents the request span, injects matching W3C `traceparent` IDs, and keeps two
  concurrent operations isolated.

The current fixture in `fixtures/test-shell/src/trace-probe.ts` exercises the framework-owned
neutral `Tracer`/`Span` facade from `@company/mfe-core`. The shell adapter keeps each OTel
`Context` private in a `WeakMap` keyed by the neutral span, and the managed request boundary
accepts that neutral span. Each remote calls `startActiveSpan`, crosses a native `await`, then
calls the managed boundary; the adapter creates the child span from the private carrier,
injects the header, and ends spans. The remotes contain no OTel imports. This demonstrates the
minimum internal mechanism without adding an author-facing carrier or operation DSL.

The corresponding Playwright proof in `tests/browser/test-shell.spec.ts` is the required
emitted-browser check: two real MF2 remotes issue overlapping operations, request completion
order is reversed, request headers are compared with exporter records, and global API methods
are checked for identity. That browser proof has not run yet. Local Node results and fixture
source therefore do not establish browser propagation or close Gate 1; no CI result is recorded
for this proof yet. The three production test-app builds do pass, and their emitted remote
bundles contain no OTel or `StackContextManager` imports while preserving the native `await`.
The 14 browser checks remain unexecuted; upload/approval of the browser run remains pending.

## Gate decision

Keep Gate 1 open pending the real-shell Playwright result. A passing browser run may establish
feasibility for framework-managed operation boundaries only, while preserving the current
`startActiveSpan()` semantics and standard `#mfe/fetch` signature. A failure must be resolved in
the shell integration or recorded as a contract limitation; it must not be hidden by claiming
ambient propagation for arbitrary author code or by introducing an unreviewed public API.
