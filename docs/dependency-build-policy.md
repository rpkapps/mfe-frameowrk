# Dependency build policy

The workspace pins pnpm 12.4.2 and Node 24.19.0. Dependency installation uses
`strictDepBuilds: true`, `dangerouslyAllowAllBuilds: false`, and an initially empty
`allowBuilds` map. CI uses `pnpm install --frozen-lockfile` and never approves
dependencies automatically.

The exact `prettier@3.9.8` release-age exception was reviewed at kickoff. That
package declares no preinstall, install, or postinstall scripts. This narrowly
scoped age exception does not authorize dependency scripts; `allowBuilds` remains
empty. All runtime and tooling versions are locked.

Before approving a dependency, review its resolved artifact/version, lifecycle
script, and purpose. Commit the narrowly scoped decision with the dependency
change. Registry packages should use an exact-version matcher; tarball dependencies
need the full resolved artifact identity. Explicit `false` entries document
denials. Do not repair installation by bulk approval, wildcard approval, or
disabling either control. See [pnpm's build settings](https://pnpm.io/settings/build).

## Executable verification

With Corepack available, run:

```sh
node scripts/check-build-policy.mjs
```

When invoking a separately installed executable, supply its path:

```sh
PNPM_EXECUTABLE=/absolute/path/to/pnpm node scripts/check-build-policy.mjs
```

The script defaults to `corepack pnpm@12.4.2` and rejects a different runner version.
Corepack may need to acquire that pinned toolchain before the checks run. It packs three distinct local
dependencies at version 1.0.0, each containing the same reviewed postinstall
behavior: write a fixed marker inside its own package directory. Each consumer
uses a separate empty package store, a generated lockfile, offline installation,
and a frozen-lockfile install. No registry package or credential is needed.

| Decision                       | Required install result                                 | Required script result |
| ------------------------------ | ------------------------------------------------------- | ---------------------- |
| Unreviewed                     | Fails with `ERR_PNPM_IGNORED_BUILDS` naming the package | No marker              |
| Exact packed artifact approved | Succeeds                                                | Expected marker        |
| Exact packed artifact denied   | Succeeds                                                | No marker              |

The approved tarball matcher includes its complete `name@file:...-1.0.0.tgz`
identity, as required by pnpm for non-registry artifacts. This approval exists only
inside the isolated test consumer. It does not modify or broaden the workspace's
dependency approvals.

Temporary files live in a unique directory below `node_modules` and are removed on
completion, including failed assertions. Install-script policy checks verify these
fixtures only. They do not establish a clean-cache scaffold installation, package
distribution, or the safety of code explicitly executed by developers.
