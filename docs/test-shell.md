# Local test shell

Use Node 24.19.0 and the latest stable pnpm, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:4100. The shell owns the header and mounts one App below it. Discovery is available at `/discovery/` and `/discovery/framing`; Geology is at `/geology/`. Native app links, browser Back/Forward, and refreshing a deep link preserve the URL boundary. The app finder, Ctrl/Cmd+K palette, and `g d` / `g m` shortcuts switch Apps. Theme changes flow through the existing adapter subscriptions.

The shell and each remote have separate Rsbuild compilers and ports. Rsbuild uses the Rspack engine underneath, so the build output and MF2 integration retain their existing engine semantics. `pnpm dev:shell`, `pnpm dev:remotes`, `pnpm dev:discovery`, and `pnpm dev:geology` support working on a subset. Ports 4100–4102 are fixed so the registry, CORS policy, and browser tests agree; the launcher reports an occupied port before starting any selected server. Ctrl+C stops the selected servers and compilers. Run commands from the repository root.

`pnpm generate` creates editor route types without starting a server. Both Apps have independent TypeScript programs so their native Router registration cannot collide. `pnpm typecheck` checks all programs. A new sample App uses its own fixture directory, `src/mfe.ts`, native routes, and an entry in `scripts/test-app-config.mjs` plus the test shell registry; this is intentionally a small local catalogue, not the later production registry API.

## Editing and overrides

Remote source changes rebuild their container and notify the shell through an EventSource. The explicit fallback reloads the page, retaining the full URL and stored shell theme. App component state resets. Shell changes use the development server's reload behavior. Build errors remain in the terminal and do not announce a successful remote rebuild.

At boot, the shell reads a URL-only override map from localStorage:

```js
localStorage.setItem(
  'mfe.test-shell.overrides',
  JSON.stringify({
    discovery: 'http://localhost:4101/mf-manifest.json',
  }),
);
location.reload();
```

Use a compatible MF2 App manifest with the same public definition ID. Override servers must allow requests from `http://localhost:4100`. An invalid entry is reported and falls back to that App's checked-in URL. An unreachable valid URL produces a visible error and a working retry. Remove the map and reload to restore defaults. This local mechanism does not implement production registry enrollment, authentication, or the complete later-gate override UI.

## Verification

```sh
pnpm check
pnpm gate:0
pnpm build:test-apps
pnpm exec playwright install chromium
pnpm test:browser
```

Playwright starts the complete environment when necessary and reuses it locally if already running. CI installs browser system dependencies and retains failure traces and screenshots. On managed environments with a preinstalled Chromium, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects it. Production builds are compile checks; this command does not host or deploy them.

The [Tecton distribution record](tecton-distribution.md) documents the pinned upstream source, private local package, generated declarations, and CSS adaptation. The supplied `tecton-ui-1code` URL returned 404; the source named in the original specification, `tecton-ui-1`, contains the matching shell-01 block and components. No upstream generated component was edited.

This shell uses a fixed test persona and sample project data. It provides a development integration location; authentication and the remaining framework gates are tracked separately in [progress](progress.md).

## Runtime ownership

The shell uses public `createAppRuntime`/`createBrowserNavigation` from `mfe-host`, `AppHost`/`createReactAdapter` from `mfe-react`, and transport helpers from the private `@company/mfe-rsbuild/runtime` implementation surface. Its catalogue supplies IDs, adapter names and URLs; the host selects adapters from a table.

| Package               | Responsibility                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mfe-core`            | Shared shell-state and lifecycle contracts, descriptors and errors                                                                       |
| `mfe-host`            | Registry validation, loader coordination, retry and cancellation, placement, shell-state store, browser boundary navigation and disposal |
| `mfe-react`           | React binding/rendering/hooks, native TanStack history translation, Router context and Query session transitions                         |
| `mfe-rsbuild/runtime` | MF2 remote loading/cache reset, URL override validation and development rebuild watching                                                 |
| Test shell            | Header, app destinations, shell inputs, theme persistence and loading/error presentation                                                 |

A future Angular adapter implements `AppAdapter.create` and returns an `AppDriver`. The host supplies the neutral definition, placement, shell-state store and navigation factory. Each `mount(attempt)` registers acquired resources immediately using `onDetach` and `onCleanup`, and checks `isCurrent` after awaiting work. A driver may implement `updateShellState` when its router/data layer needs coordinated session invalidation. The host otherwise updates the shared store directly. Mount-level `detach` and `dispose` release adapter resources retained across retries.

The DOM-only adapter in `mfe-host` tests demonstrates this path without importing React or TanStack. The internal native-memory-history React harness also runs through the same host runtime. No Angular implementation is included in this change.
