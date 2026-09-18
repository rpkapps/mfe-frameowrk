# Local test shell

Use the pinned Node and pnpm versions, then run:

```sh
corepack pnpm@12.4.2 install --frozen-lockfile
pnpm dev
```

Open http://localhost:4100. The shell owns the header and mounts one App below it. Discovery is available at `/discovery/` and `/discovery/framing`; Geology is at `/geology/`. Native app links, browser Back/Forward, and refreshing a deep link preserve the URL boundary. The app finder, Ctrl/Cmd+K palette, and `g d` / `g m` shortcuts switch Apps. Theme changes flow through the existing adapter subscriptions.

The shell and each remote have separate Rspack compilers and ports. `pnpm dev:shell`, `pnpm dev:remotes`, `pnpm dev:discovery`, and `pnpm dev:geology` support working on a subset. Ports 4100–4102 are fixed so the registry, CORS policy, and browser tests agree; the launcher reports an occupied port before starting any selected server. Ctrl+C stops the selected servers and compilers. Run commands from the repository root.

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
