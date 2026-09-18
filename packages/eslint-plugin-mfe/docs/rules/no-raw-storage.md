# Require framework storage handles

`mfe/no-raw-storage` prevents App and Widget source from reading or writing the
browser's `localStorage` and `sessionStorage` objects directly. Raw access
skips definition-ID namespacing, schema validation, retention rules, and
reactive notifications for framework-managed subscribers.

The `useMfeStorage` and `useStoredState` examples below describe the
author-facing storage facade planned for Gate3; they are not exports in the
current Gate2 surface. Gate2 framework integration routes storage through the
host-owned `createStorageCoordinator` from `@company/mfe-host` and keeps that
implementation detail out of author imports. Use the facade when it is
available in the generated author surface.

The planned imperative handle is used when code needs an explicit read, write,
migration, or removal:

```tsx
const storage = useMfeStorage('local');
const density = storage.key('table-density', densitySchema);
const current = density.get();
```

Route code can use the equivalent mount context handle:

```tsx
const current = context.mfe.storage.local.key('table-density', densitySchema).get();
```

For rendering, use the subscribed `useStoredState` API so updates and cleanup
are managed by the framework:

```tsx
const [density, setDensity] = useStoredState('table-density', densitySchema, {
  defaultValue: 'comfortable',
});
```

The rule follows static aliases and destructured browser members, including
`window.localStorage`, `globalThis.sessionStorage`, and their stable aliases.
Lexically shadowed names are treated as application-owned values:

```ts
function read(localStorage: Storage) {
  return localStorage.getItem('owned-by-this-function');
}
```

Dynamic property names and aliases reassigned after initialization are outside
static coverage. Keep runtime behavior tests for those cases. The documented
shell override bootstrap and the framework storage adapter are outside the
author preset's file scope.
