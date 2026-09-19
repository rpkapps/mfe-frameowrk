# @company/eslint-plugin-mfe

Development-only, versioned flat configurations for the MFE framework. This package is currently private while Gate 0 is under verification.

```js
import mfe from '@company/eslint-plugin-mfe';

export default [...mfe.configs.author];
```

Use `mfe.configs.framework` in implementation packages. Both presets include ESLint recommended rules, TypeScript's type-checked recommended rules, focused async/type checks, React Hooks/compiler diagnostics, and official TanStack Router/Query recommendations. TypeScript files need a discoverable `tsconfig.json`; generation runs before lint, just as it does before typechecking. JavaScript tooling receives ESLint's baseline without inventing a TypeScript project.

The framework preset restricts general state-library imports and telemetry vendors. The author preset allows MFE-owned Zustand and restricts framework internals and telemetry vendors. The workspace separately checks the actual package import DAG and public export paths, including type imports, dynamic literal imports, and manifest runtime dependencies.

| Rule                                                               | Default | Scope                         |
| ------------------------------------------------------------------ | ------- | ----------------------------- |
| [no-global-patching](docs/rules/no-global-patching.md)             | Error   | Framework and author source   |
| [no-raw-storage](docs/rules/no-raw-storage.md)                     | Error   | Author source                 |
| [stable-definitions](docs/rules/stable-definitions.md)             | Warning | Author source                 |
| [no-widget-global-effects](docs/rules/no-widget-global-effects.md) | Error   | Explicit Widget source scopes |

`stable-definitions` starts as a warning until representative author fixtures establish acceptable false positives. Correctness rules fail CI. Compiler `unsupported-syntax` and `incompatible-library` findings are warnings because they describe skipped optimization; assess them against performance requirements. Other React compiler correctness diagnostics retain the upstream recommended severity. Upgrades require reviewing changed recommendations and rerunning the fixtures.

`no-raw-storage` ships in the author preset with the storage API. The documented shell override bootstrap and framework storage adapter remain outside that preset's file scope. `no-widget-global-effects` is available through `mfe.configs.authorWidget(files)`, where `files` is an explicit project-owned glob; ownership is never inferred from filenames. Recognizing a future definition factory name in a static identity rule does not provide that runtime API.

No rule rewrites source automatically. Moving definitions or changing global side effects requires a deliberate ownership decision. Dynamic property names and aliases reassigned after initialization are outside static coverage; behavior tests remain necessary.

Keep exceptions on the smallest applicable line and name the rule and reason:

```js
// eslint-disable-next-line mfe/no-global-patching -- Compatibility fixture intentionally reproduces the dependency's existing patch.
window.history.pushState = patchedPush;
```

The ordinary framework preset contains no legacy exception. Add any future legacy migration exception to the exact existing file, then remove it with that migration. Do not disable checks for a whole adapter.
