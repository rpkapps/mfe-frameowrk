# Gate 0 validation

This checkpoint implements the [two approved contract revisions](approved-contract-revisions.md) through the React adapter, rather than retaining a test-local rendering candidate. The in-process loader and memory history remain test fixtures. Full command results and the current gate status are recorded in [progress](progress.md).

## History and author bootstrap

The adapter acquires history before calling the factory, registers its cleanup immediately, and validates exact forwarding into native `createRouter`. Omission/substitution and changed boundaries produce structured errors. The supported path preserves global History method identities from construction through disposal. A violating factory that constructs native default history is rejected and its returned default history is released; the framework cannot undo arbitrary author side effects or reclaim resources a factory never returns.

The introductory file-route factory/root/augmentation compiles as an independent TypeScript program. It forwards history and uses `useUser` for rendering. Browser history coordination remains Gate 1; a passing memory-history fixture does not prove it.

## State and Query

A purpose-specific immutable store owns each mount's shell state. `useUser`, `useGroups`, and `useTheme` subscribe only to their fields and support optional `Object.is` selectors. Equal updates retain snapshots; group ordering/duplicates alone are a no-op. Tests distinguish subscription-induced commits from ordinary parent rendering and cover selector changes and Strict Mode cleanup.

The adapter updates native router options while preserving author keys and stable services. A newly started native load receives the current snapshot. An in-flight load keeps its snapshot through awaited ancestors and later-starting child callbacks; live hooks update independently. Theme updates neither invalidate routes nor reset Query data. Tests verify current state on a subsequent load, stable router/client/component identity, and zero unrelated loader/query work for theme updates.

The Gate 0 user-ID and group fixtures cancel Query work, reset observed queries, remove unobserved cached data, and explicitly invalidate native routes. Native per-query reset notifies Query-only and disabled observers without starting a fetch; a synchronous shell-state commit updates keyed consumers before active queries refetch. Native `initialData` and `placeholderData` remain author-provided sources and must obey session/key scoping. The owned content stays hidden while the new session's route work is pending, without unmounting its components. Generation checks prevent overlapping or disposed transitions from unhiding obsolete content. A transition settles on attempt retirement even if a noncooperative native loader is still pending. Late mocked Query/loader results cannot overwrite the active generation. Tenant/account integration, storage retirement, real credentials, and complete session policy retain their later gates.

## Reserved keys and native errors

Factory checks reject missing/replaced `mfe` or `queryClient`. Frozen framework snapshots prevent mutation; a per-attempt weak set recognizes issued snapshots still held by native matches. The supplied Query client remains stable. Arbitrary author top-level fields and exact forwarding are accepted.

Initial merged route contexts are checked after `router.load()` and before React mounting. Later active contexts are inspected through `onLoad`; the first conflict is retained and reported as `app/invalid-router` with route/key attribution. Retirement is scheduled after `onResolved`/`onRendered`, once Router is idle. If an author starts a new navigation during event delivery, retirement waits for its acknowledgement. Tests prove both native promises settle for superseding and reentrant navigation. No router store, internal method, or route tree is patched.

This is post-load diagnosis, not a security boundary or pre-execution guard. An invalid author loader, and on later navigation its component, can run before retirement. Native preloads have no global completion event in the pinned API, so this integration detects their conflicts when activated. An author deliberately capturing and forwarding an old legitimate snapshot is not fully distinguishable from native retained snapshots; the contract prohibits capturing factory state for later session decisions.

Native author `InnerWrap`, `errorComponent`, and nested React boundaries remain usable. Handled feature errors render their native fallback; only errors escaping to the framework's own boundary retire the mount. Framework contract errors remain explicit lifecycle failures with retry.

## Ownership and cancellation

Each mount owns one Query client, immutable shell state, and lifecycle handle. Each attempt owns its router, history, React root, and subscriptions. Retry waits for prior cleanup, keeps the placement/mount signal/client, and uses current shell state with a fresh router/history. Disposal is idempotent, synchronously aborts the mount signal and detaches UI/history subscriptions, then awaits root and Query cleanup. Late work cannot attach a retired attempt.

The framework mount signal and native route abort controller serve different lifetimes. Disposal aborts `context.mfe.signal`; native navigation controls `abortController.signal`. A direct request needing both can use:

```ts
const signal = AbortSignal.any([abortController.signal, context.mfe.signal]);
```

The adapter does not use private Router cancellation APIs or claim arbitrary author promises are forcibly stopped. Query functions use Query's signal; the mount cancels its client. Generated authenticated-request ownership is completed at its specified later gate.

## Remaining gates

Gate 0 uses mocked requests and jsdom. It is not authenticated-shell, browser, federation, packaged-build, or production performance evidence. Gate 1 requires the real shell and session/enrollment prerequisites, then must prove MF2/Rspack integration, hot updates, sharing/compiler behavior, browser bridge/blockers, concurrent generated-tree mounts, tracing, and scoped Tecton output. Widgets and other later feature surfaces have not been introduced.
