# Gate 1 trace feasibility

This is a feasibility result only. It does not add a telemetry implementation,
public tracing contract, or provider dependency to the framework.

## Reviewed candidate

The reviewed browser context manager was:

| Package                                | Version  |
| -------------------------------------- | -------- |
| `@opentelemetry/api`                   | `1.9.1`  |
| `@opentelemetry/context-zone-peer-dep` | `2.11.0` |
| `zone.js`                              | `0.16.0` |

The packages were installed in a temporary directory with
`npm install --ignore-scripts --no-audit --no-fund`. No package manifest or lockfile
was changed. The runtime probe used `ZoneContextManager().enable()`, registered it
as the OpenTelemetry global context manager, and ran two overlapping
`context.with(..., async () => { await ...; read active context })` operations.

The probe result was:

```json
[
  ["a", "before", "a"],
  ["b", "before", "b"],
  ["b", "after", null],
  ["b", "microtask", null],
  ["a", "after", null],
  ["a", "microtask", null]
]
```

This reviewed runtime probe did not preserve the active parent through the awaited
continuations. The candidate is therefore incompatible with the current ES2022
emitted output for this proof. This result does not exhaust other possible
implementations, and it is not a claim that browser propagation is impossible.

## Source constraints

OpenTelemetry’s JavaScript context documentation says an active context falls back
to `ROOT_CONTEXT` without a configured context manager and identifies `zone.js` as
the web mechanism for async propagation:
<https://opentelemetry.io/docs/languages/js/context/>.

The `@opentelemetry/context-zone` package bundles `zone.js`; its peer dependency
variant requires the caller to provide it. The reviewed `ZoneContextManager`
implementation has `enable`, `disable`, `with`, and `bind` methods, but no option to
disable Zone’s async instrumentation while retaining propagation. Its `bind` path
also patches `addEventListener` and `removeEventListener` targets. Source:
<https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-context-zone-peer-dep>.

The package README states that the manager does not work with ES2017+ output and
requires transpilation to ES2015. This repository targets ES2022, so changing the
target for a trace experiment would not represent the shipped build. Source:
<https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-context-zone-peer-dep>.

## Decision proposal — requires approval

Gate 1 §5.16.3 and Gate 1 item 11 require a minimal shell tracing adapter to
preserve parentage across `await` and concurrent operations in emitted browser code,
including a request boundary, without new global fetch/History/event-listener
patches. That requirement needs an explicit decision before implementation expands.

The recommended revision is explicit operation-bound context propagation through
framework-managed route, Query, and request boundaries. The stable mount telemetry
service remains the author-facing handle; the framework may carry a separate
operation-bound carrier internally without changing that service identity. OTel
semantics remain explicit: `startSpan()` is non-active, `startActiveSpan()` scopes
only its documented callback, and authors manually call `end()` for spans they
create. A managed request inherits the framework-established operation context,
never whichever manual span was most recently started. Non-React utilities receive
the stable service explicitly. For example, a route loader may create and end its
own span, while the framework separately establishes the operation carrier used by
its managed request boundary.

Under this proposed contract, automatic parentage for arbitrary application
functions that happen to cross a native `await` is not promised. Nested author-span
parentage after `await` still needs a specific supported parent-handle/carrier API
design and emitted-browser proof; passing the same mount service does not solve it.
The required proofs cover route loads, Query work, requests, parallel operations,
and cross-mount isolation. No new public `run`/`withContext`/`trace` API is proposed
without that contract review.

The alternative is adopting a shell async-context runtime together with async
downleveling to the runtime’s supported target. That would require proof that the
runtime preserves parentage in the shipped browser output, plus explicit review of
bundle cost, compiler/source-map and edit-loop effects, global async/event-target
patching, and compatibility with the repository’s ES2022 target. The reviewed
candidate does not supply that proof under the current build.

Until this proposal or the alternative is approved and proven, Gate 1 remains open;
this document records feasibility evidence and does not approve or implement either
direction.
