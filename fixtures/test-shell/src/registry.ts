import { createRemoteRegistry } from '@company/mfe-rspack/runtime';

export const overrideKey = 'mfe.test-shell.overrides';
export const overrideWarnings: string[] = [];

function readOverrides(): unknown {
  try {
    return JSON.parse(localStorage.getItem(overrideKey) ?? '{}') as unknown;
  } catch (cause) {
    overrideWarnings.push(`Ignored invalid remote overrides: ${String(cause)}`);
    return {};
  }
}

export const { registry, remotes } = createRemoteRegistry({
  apps: [
    { id: 'discovery', adapter: 'react', entry: 'http://localhost:4101/mf-manifest.json' },
    { id: 'geology', adapter: 'react', entry: 'http://localhost:4102/mf-manifest.json' },
  ],
  overrides: readOverrides(),
  onWarning: (warning) => overrideWarnings.push(warning),
});
