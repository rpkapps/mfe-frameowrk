# mfe/stable-definitions

Declare framework definitions and lazy components once at module scope so React rendering cannot recreate their identities.

The rule recognizes `createApp`, `createWidget`, and `lazyWidget` imported from `@company/mfe-react`, including import aliases, namespace imports, stable local aliases, and TypeScript wrappers. An unrelated function with the same name is allowed. Definitions and lazy components must be created at module scope so their identity remains stable across renders.

Invalid:

```js
import { createApp as defineApp } from '@company/mfe-react';

function Application() {
  return defineApp({ id: 'operations', router: makeRouter });
}
```

Valid:

```js
import { createApp } from '@company/mfe-react';

export const operations = createApp({ id: 'operations', router: makeRouter });
```

Move the factory call to module scope; changing mount data follows the public input/URL contract. Adding `useMemo` inside a component does not make its definition module-scoped.

The rule warns for factory calls inside **any function**, because lint cannot prove whether a helper will execute during rendering. A deliberate test-only definition factory can use a local suppression with its reason. The build plugin remains responsible for static entry exports, duplicate IDs, and metadata shape. No autofix is provided because moving code can change captured values and initialization order.
