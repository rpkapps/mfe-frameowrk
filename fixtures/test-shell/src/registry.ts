import { registerRemotes, loadRemote } from '@module-federation/enhanced/runtime';
import type { AppDefinition } from '@company/mfe-react';
import type { AnyRouter } from '@tanstack/react-router';

export const registry = [
  { id: 'discovery', origin: 'http://localhost:4101' },
  { id: 'geology', origin: 'http://localhost:4102' },
] as const;

export const overrideKey = 'mfe.test-shell.overrides';
export const overrideWarnings: string[] = [];

function readOverrides(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(overrideKey) ?? '{}');
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new Error('Expected an object mapping App IDs to manifest URLs.');
  } catch (cause) {
    overrideWarnings.push(`Ignored invalid remote overrides: ${String(cause)}`);
    return {};
  }
}

const overrides = readOverrides();
export const remotes = registry.map((app) => {
  let entry = `${app.origin}/mf-manifest.json`;
  const override = overrides[app.id];
  if (override !== undefined) {
    try {
      if (typeof override !== 'string') throw new Error('Expected a URL string.');
      const url = new URL(override);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Use an HTTP(S) URL without credentials.');
      }
      entry = url.href;
    } catch (cause) {
      overrideWarnings.push(`Ignored ${app.id} override: ${String(cause)}`);
    }
  }
  return { name: app.id, entry };
});

registerRemotes(remotes);

export async function loadApp(id: string, retry = false): Promise<AppDefinition<AnyRouter>> {
  const remote = remotes.find((candidate) => candidate.name === id);
  if (!remote) throw new Error(`Unknown App ${id}.`);
  if (retry) registerRemotes([remote], { force: true });
  const loaded = await loadRemote<{ default?: unknown }>(`${id}/app`);
  const definition = loaded?.default;
  if (
    typeof definition !== 'object' ||
    definition === null ||
    !('id' in definition) ||
    definition.id !== id ||
    !('kind' in definition) ||
    definition.kind !== 'app' ||
    !('router' in definition) ||
    typeof definition.router !== 'function'
  ) {
    throw new Error(`Remote ${id} did not export the expected App definition.`);
  }
  // The runtime boundary checks the discriminant, ID and factory. The adapter
  // independently validates the produced router, history and reserved context.
  return definition as AppDefinition<AnyRouter>;
}
