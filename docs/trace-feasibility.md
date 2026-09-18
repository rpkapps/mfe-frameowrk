# Tracing status

**Status: deferred by approved contract revision.** Tracing is removed from the current Gate 1
exit requirement. The original Gate 1 item 11 no longer blocks the remaining Gate 1 work; a later
dedicated tracing gate must review and prove the framework-owned contract before telemetry-provider
integration is accepted.

The deferred specification retains the planned `startSpan()`/`startActiveSpan()` semantics:
`startSpan()` is non-active, `startActiveSpan()` scopes its documented callback, and authors end
spans they create. These APIs are not currently implemented or exported. The planned `#mfe/fetch`
surface retains its standard `fetch` signature; it is not claimed as a completed integration.
No new carrier, `run`/`withContext`/`trace` API, or automatic parentage promise for arbitrary
author functions is approved. This revision sets no deadline.

## Historical evidence

The prior local characterization and CI/browser trace fixture are historical records only. They
must not be read as current tracing implementation or acceptance evidence after this deferral.
The reviewed CI run on head `4e2daa1` recorded 210 behavior tests, Gate 0 checks, three builds,
and 14 Chromium checks, but that trace result is retained only as historical context. No current
Gate 1 tracing pass or full telemetry/authenticated-fetch integration is claimed.

Other Gate 1 evidence and decisions remain governed by [the progress record](./progress.md) and
[the Gate 1 feasibility record](./gate-one-feasibility.md).
