# In-process contract tracer

These tests load an App by stable ID through a test-internal definition map and activate the implementation's `createAppMount` adapter. Only the in-process loader and memory boundary are fixtures; rendering, lifecycle, Query ownership, shell subscriptions, retry, and disposal use the framework packages.

Run `pnpm exec vitest run tests/tracer` for lifecycle and transition coverage. Run `pnpm run gate:0` for the separate revised history/live-state conformance suite. The introductory generated-route fixture also compiles independently through `pnpm run check`.

The tests prove framework-history forwarding and identity validation, native context and author extensions, selective live hooks without theme-induced route work, stable mount-owned Query clients, explicit failures and retry, current retry inputs, native error fallbacks, settled navigation after reserved-context conflicts, and deterministic cleanup. Session tests cover mocked late Query results, overlapping identity changes, pending ancestor snapshot timing, and disposal during a transition.

Initial reserved-context conflicts are diagnosed after native loading and before React mounting. Later conflicts are diagnosed from active native matches and retire the mount after native presentation acknowledgement. Author loaders and components can execute before that later diagnostic; this is not a sandbox. Native preloads are checked on activation because the pinned API has no global preload-completion event. Author `InnerWrap` and the shared route tree remain untouched.

Disposal aborts the mount signal, detaches UI and history subscriptions synchronously, drops the adapter's router reference, and completes root/Query cleanup. This does not claim that the separate native navigation controller is automatically aborted or that arbitrary author promises stop. Framework updates settle when their attempt retires, even if native work awaits a removed presentation.

Memory history and jsdom do not prove browser traversal/blockers, shared generated-tree concurrent mounts, federation, real authentication, compiler/build output, CSS/portals, or production performance. Those proofs retain their specified gates. Scrolling is mocked because no layout claim is made. See [the validation report](../../docs/gate-zero-validation.md) and [progress](../../docs/progress.md).
