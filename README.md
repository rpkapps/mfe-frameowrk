# MFE framework

A local Tecton shell and two independently served MF2 Apps live in this repository. The shell owns the header; Discovery and Geology own everything below it. Gate 0 remains passed; the test environment is an integration checkpoint, not a complete framework release.

## Run the test environment

```sh
corepack pnpm@12.4.2 install --frozen-lockfile
pnpm dev
```

Open **http://localhost:4100**. One command generates routes and starts the shell plus both Rspack remotes. Use the app finder or **Ctrl/Cmd+K** to switch applications; **?** lists shortcuts. **Ctrl+C** stops all three servers.

| Command                                   | Starts                                                     |
| ----------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                | Shell (4100), Discovery (4101), Geology (4102)             |
| `pnpm dev:shell`                          | Shell only                                                 |
| `pnpm dev:remotes`                        | Both remotes                                               |
| `pnpm dev:discovery` / `pnpm dev:geology` | One remote                                                 |
| `pnpm build:test-apps`                    | Production builds of all three                             |
| `pnpm test:browser`                       | Playwright acceptance against the running test environment |

Remote edits reload the page, preserving the URL and shell theme. Component-local state resets. See [test-shell setup and boundaries](docs/test-shell.md), including local URL overrides and browser installation.

## Verify

Use Node **24.19.0** and pnpm **12.4.2** (pinned in the repository):

```sh
corepack pnpm@12.4.2 install --frozen-lockfile
corepack pnpm@12.4.2 run check
corepack pnpm@12.4.2 run gate:0
```

`check` verifies generation, formatting, lint, strict types, package boundaries, dependency-script controls, and behavior tests. `gate:0` separately verifies the approved history and live-state contract. CI runs both commands. Current results are recorded in [progress](docs/progress.md).

Generation runs automatically before typechecking. `pnpm run generate` is the recovery command. The introductory App has its own TypeScript program and native `Register` augmentation; `routeTree.gen.ts` is generated and ignored.

## Contract decisions

App factories forward the exact supplied `history` into native `createRouter`, alongside `basePath` and `context`. The history belongs to the framework; feature code keeps using native navigation.

Components use `useUser`, `useGroups`, and `useTheme` for live shell state. Router callbacks receive immutable snapshots for their native load/navigation. Theme updates do not reload routes; identity and permission changes explicitly retire obsolete data and invalidate route work. Query keeps one stable client per mount and uses its own native subscriptions.

The adapter reports reserved-context conflicts, preserves native author error boundaries, and retires failed mounts without patching router internals or shared route trees. [Validation details](docs/gate-zero-validation.md) state the exact diagnostic and cancellation boundaries.

## Integration scope

The user approved an in-repo test shell because no separate shell repository exists. It uses a fixed development persona and local App registry; it does not claim authenticated production integration. Remaining Gate 1 proofs and later gate requirements are recorded in [progress](docs/progress.md).

Read [contributing guidance](docs/contributing.md), [dependency-script policy](docs/dependency-build-policy.md), and [approved contract revisions](docs/approved-contract-revisions.md).
