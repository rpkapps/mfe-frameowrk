# Neutral mount ownership

`@company/mfe-core` defines the public identity, error and lifecycle records.
The public host entry builds neutral App and Widget runtimes, registries,
storage coordinators, and browser navigation; `@company/mfe-host/internal`
supplies `createMountLifecycle` to framework adapters. The host remains
independent of React and routers, while adapters provide framework-specific
mount drivers through runtime configuration.

An adapter creates one lifecycle owner for a placement, calls `start()` once, and
observes its handle. `start()` and `retry()` reject with the same structured error
published through state and diagnostics. A failed attempt only restarts through
`retry()`; the adapter reads its latest committed values when called again.

Register each acquired resource with `attempt.onDetach()` for synchronous UI or
subscription detachment and `attempt.onCleanup()` for remaining cleanup. Register
the React root's unmount through this owner; do not add another teardown path.
Mount-lifetime scope disposal belongs in the options' `detach` and `cleanup`, so
retry can retain the placement. Cleanup from a failed attempt finishes before the
next adapter invocation. Failures are reported while other cleanup continues.
Cleanup failures from any attempt remain owned by the mount: a later retry may
succeed, but final disposal still rejects with the collected cleanup failures so
the host cannot mistake an earlier leaked resource for successful release.

After every asynchronous acquisition, use `attempt.commit()` before attaching UI
or committing other effects. Retired attempts cannot commit. Registering a resource
after retirement immediately schedules its release, but asynchronous code should
honor the attempt signal to avoid acquiring it at all. The mount signal is stable
across retries and aborts only on disposal. Late results do not change state.

`dispose()` fences work and detaches synchronously, then returns the same promise
to every caller while asynchronous cleanup finishes. It does not await unresolved
mount code that may ignore cancellation. Adapter code therefore must use the
commit fence after awaits. A late resource registered after disposal has already
settled is released and any failure is reported through diagnostics.

The current host surface implements ownership and attempt fencing. Finite
load/mount/disposal deadlines and shared-load ownership are separate host
responsibilities. These neutral unit tests do not establish the React router
contract or browser integration behavior.
