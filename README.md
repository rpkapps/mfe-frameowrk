# MFE framework

**Gate 0 passed** for the supplied specification and [approved contract revisions](docs/approved-contract-revisions.md). This checkpoint contains the React App adapter, neutral lifecycle/error contracts, selective shell-state hooks, shared lint tooling, generated-route author fixture, and executable acceptance tests. All packages remain private; this is not a complete framework release.

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

## Next integration prerequisite

Gate 1 requires the actual shell source/integration location plus its startup, authenticated-session, and development registry-enrollment instructions. These were absent from the destination repository. In-process fixtures cannot establish that integration; no standalone authentication harness substitutes for it.

Read [progress](docs/progress.md), [contributing guidance](docs/contributing.md), and [dependency-script policy](docs/dependency-build-policy.md). The supplied specification and approved revisions remain the requirements; later gates are unchanged.
