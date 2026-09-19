# Gate 3 author journey fixtures

This document records the executable, in-process slice of the Gate 3 author
journey. It is deliberately a component-test fixture: it uses an explicit shell-state fixture and therefore
does not claim real authentication, federation, browser layout, or shell
enrollment.

## Component test setup

The supported entry is `@company/mfe-react/testing`. A test creates one owned
environment and uses the returned DOM container with React Testing Library:

```tsx
const environment = createMfeTestEnvironment({
  id: 'inventory',
  definition: inventoryApp,
  shellState: { user: { id: 'u-1', name: 'Test user' }, groups: ['ops'], theme: 'light' },
});

await environment.ready;
expect(environment.getQueries().getByTestId('inventory')).toBeInTheDocument();
await environment.setShellState({ theme: 'dark', groups: ['ops', 'auditors'] });
await environment.dispose();
```

`renderApp` is the convenience form for the same operation and returns a
normal Testing Library query root. Each call owns its target, memory history,
Query client, shell store, storage fixtures, and asynchronous disposal. Tests
that intentionally model same-definition sharing pass one explicit
`storageCoordinator` to each environment; isolation is the default and a
caller-owned coordinator is never disposed by a helper.

The route factory receives the immutable `context.mfe` snapshot for that load
and the environment's mount-owned `queryClient`. A later `setShellState`
starts a new context snapshot for a newly started load. Existing loads keep
their selected snapshot across `await`.

The fixture setup is suitable for Vitest and React Testing Library and does
not require a shell process or credentials. Typed test-only aliases supply
`#mfe/config` and `#mfe/fetch`; production generation and authentication remain
Gate 5 work. Browser bridge, CSS/layout,
authenticated fetch, and federation coverage remain Playwright or shell
integration concerns.

## Current executable subset

The Gate 3 tests exercise the following author actions against the production
React driver and host lifecycle:

- mount a real App definition through an in-process registered loader;
- observe theme and groups using the public shell hooks;
- update shell state and verify that the same mount remains active;
- use a mount-owned Query client and memory history;
- write and invalidate an isolated storage fixture; and
- dispose repeatedly without retaining the DOM target or subscriptions.

The fixture intentionally has no implicit telemetry recorder. Telemetry and
tracing remain deferred until their explicit implementation gate.

## Performance fixture

`tests/gate-three/performance-fixture.tsx` contains isolated user, groups, and
theme probes plus the representative Gate 3 scale shape (two App mounts, 50
Widgets, and 100 storage keys). A production/profiling runner
can render these probes, apply one trigger at a time, and record validation,
subscription, callback, commit, and elapsed counters. The fixture defines no
hardware-independent timing budget and produces no browser performance claim;
the acceptance run must record its device, browser, build mode, warmup,
payloads, network profile, and agreed project budget alongside measurements.

## Executed evidence

The in-process author journey is executable from the repository root:

```text
pnpm exec vitest run tests/gate-three/testing-utilities.test.ts tests/gate-three/testing-utilities.integration.test.tsx --reporter dot
```

On 2026-09-19 this run completed with 8 tests passing.
The Vitest setup file at `tests/gate-three/setup.ts` awaits `cleanupMfeTests`
after every test, including failed assertions, then resets the alias fixtures.
The test config resolves `#mfe/config` and `#mfe/fetch` to typed fixtures;
tests use the named imports `config` and `fetch`. The
alias test verifies a configured value and a recorded request; these fixtures
are test-only and do not provide production authentication or configuration.

The integration file
mounts an App definition through the neutral App runtime and React adapter,
mounts a Widget definition through the neutral Widget runtime and adapter,
checks provider and Query identity, updates a shell hook through the real state
store, verifies default storage isolation, and awaits repeated disposal. The
performance fixture reports commit callbacks from effects; it does not infer
render counts from render-time mutation or claim a hardware-independent budget.
