# Current storage contract

Gate2 exposes storage through the neutral host coordinator. The React-facing
`useMfeStorage`, `context.mfe.storage`, and `useStoredState` facade described in
the framework specification is planned for Gate3; it is not a current export.
Framework-owned integration creates a coordinator and gives each definition
its namespaced handles:

```ts
import { createStorageCoordinator } from '@company/mfe-host';

const coordinator = createStorageCoordinator({
  local: window.localStorage,
  session: window.sessionStorage,
  generation: sessionGeneration,
  knownDefinitionIds: registryDefinitionIds,
  // The coordinator consumes events; the owner supplies the browser hookup.
  subscribeStorageEvents: (listener) => {
    const onStorage = (event: StorageEvent) => listener(event);
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
});

const reports = coordinator.forDefinition('reports');
const density = reports.local.key('density', densitySchema, {
  retention: 'preference',
});
const current = density.get();
density.set('compact');
density.remove();
```

The public `MfeStorageKey` facade has exactly `get()`, `set(value)`, and
`remove()`. `MfeStorage` has `key()`, `remove(name)`, and `clear()`. Reactive
binding and functional update support are host-internal capabilities exposed
through `@company/mfe-host/internal`; they are not fields on public key objects.
The internal coordinator seam retains shared declarations, snapshots, and
subscriptions for framework-owned rendering integration.

`forDefinition(id)` owns the `<id>:<key>` prefix. The same coordinator and
definition ID share one key entry across callers and mounts. Active declarations
for a key must agree on schema, default, retention, version, and migration
function. The entry remains coordinator-owned after a listener unsubscribes;
`unsubscribe` releases only that listener. The coordinator's `dispose()` is the
owner's full teardown: it detaches the injected browser-event source, clears
listeners, fences late reads/writes/migrations, and rejects new operations.

`local` and `session` select the browser store. `retention` independently
selects lifetime: `session` records are tied to the coordinator generation,
while `preference` records survive generation transitions. A session-retained
key requires a generation. On logout or account, tenant, or semantic group
change, the shell calls `coordinator.transition(nextGeneration)`. This retires
the old generation, resets active session snapshots, and removes fully marked
framework session records for known or unknown definition IDs, including
unmounted definitions. Preference records remain. A generation token cannot be
reused after it is retired.

Internal host integrations use a subscribed binding when a missing value needs a validated default. The default
is returned by `getSnapshot()` only while the key is missing; it is never
persisted. `get()` returns `null` for a missing key. An imperative `key()`
binding does not accept `defaultValue`. Reads, writes, and migrations validate
through the declared schema and report structured storage failures. Removal
intentionally operates by the owned physical key without parsing the stored
value, so a malformed record can still be explicitly reset. There is no silent
in-memory or alternate-store fallback.

Declare schemas and migrations at module scope. A migration is synchronous and
side-effect free, receives the unknown value and stored version, and must
return a value accepted by the current schema. The coordinator writes the
migrated version only after validation and a current-generation check.

```ts
import { z } from 'zod';

export const densitySchema = z.enum(['comfortable', 'compact']);
export const migrateDensity = (value: unknown, fromVersion: number) => {
  if (fromVersion !== 1) throw new Error(`unsupported density version: ${fromVersion}`);
  return densitySchema.parse(value === 'cozy' ? 'comfortable' : value);
};

export const densityOptions = {
  retention: 'preference' as const,
  version: 2,
  migrate: migrateDensity,
};
```

A migration fixture should seed an old, versioned framework envelope and read
it through the current declaration. Use a fresh coordinator and key binding in
the fixture; do not retain an already bound version-1 declaration:

```ts
const local = window.localStorage;
local.setItem(
  'reports:density',
  JSON.stringify({
    marker: '@company/mfe-storage/v1',
    version: 1,
    retention: 'preference',
    value: 'cozy',
  }),
);

const migrationCoordinator = createStorageCoordinator({ local, generation: 'g1' });
const reports = migrationCoordinator.forDefinition('reports');
const density = reports.local.key('density', densitySchema, densityOptions);
expect(density.get()).toBe('comfortable');
// The stored envelope is now version 2 after successful validation.
```

Future versions, unsupported versions, malformed envelopes, and migration or
schema failures remain visible and preserve the previous record. There is no
schema guessing or automatic data reset. A product that deliberately resets a
key must expose an explicit action that calls `reports.local.remove('density')`
or, for all records owned by that definition in that store,
`reports.local.clear()`. These operations never clear unrelated shell or
third-party records.

## Existing Gate 3 contract debt

The current `AppHost` implementation still uses its existing `id`,
`renderStatus`, and `runtime` properties. Aligning those properties with the
specification's `appId` and `fallback` contract remains a separate Gate 3 task
under the existing gate ordering.
