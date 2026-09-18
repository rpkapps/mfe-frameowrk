import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';

export interface RemoteApp {
  readonly id: string;
  readonly adapter: string;
  readonly entry: string;
}

export interface RemoteLocation {
  readonly name: string;
  readonly entry: string;
}

export interface RemoteLoadOptions {
  readonly signal: AbortSignal;
  readonly retry: boolean;
}

export interface RemoteRegistration {
  readonly id: string;
  readonly adapter: string;
  readonly load: (options: RemoteLoadOptions) => Promise<unknown>;
}

function entryUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a URL string.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP(S) URL without credentials.');
  }
  return url.href;
}

/** MF2 cannot cancel its network request; cancellation retires only this consumer. */
function consume<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Remote load aborted', 'AbortError'),
      );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Transport-only records. The host and selected adapter validate the loaded definition. */
export function createRemoteRegistry(options: {
  readonly apps: readonly RemoteApp[];
  readonly overrides?: unknown;
  readonly onWarning?: (warning: string) => void;
}): {
  readonly registry: readonly RemoteRegistration[];
  readonly remotes: readonly RemoteLocation[];
} {
  let overrides: Record<string, unknown> = {};
  if (options.overrides !== undefined) {
    if (
      typeof options.overrides === 'object' &&
      options.overrides !== null &&
      !Array.isArray(options.overrides)
    ) {
      overrides = options.overrides as Record<string, unknown>;
    } else {
      options.onWarning?.(
        'Ignored invalid remote overrides: expected an object mapping App IDs to manifest URLs.',
      );
    }
  }
  const names = new Set<string>();
  const remotes = options.apps.map((app) => {
    if (!app.id.trim() || names.has(app.id))
      throw new Error(`Invalid or duplicate remote ID: ${app.id}.`);
    names.add(app.id);
    let entry = entryUrl(app.entry);
    const override = Object.hasOwn(overrides, app.id) ? overrides[app.id] : undefined;
    if (override !== undefined) {
      try {
        entry = entryUrl(override);
      } catch (cause) {
        options.onWarning?.(`Ignored ${app.id} override: ${String(cause)}`);
      }
    }
    return { name: app.id, entry };
  });
  registerRemotes(remotes);
  const registry = options.apps.map((app, index): RemoteRegistration => {
    const remote = remotes[index]!;
    let failed = false;
    return {
      id: app.id,
      adapter: app.adapter,
      async load({ signal, retry }) {
        signal.throwIfAborted();
        // MF2 caches rejected remoteEntry loads. Clear only a failed transport
        // on explicit retry; normal navigation preserves healthy shared modules.
        if (retry && failed) registerRemotes([remote], { force: true });
        const pending = loadRemote<{ default?: unknown }>(`${app.id}/app`).then(
          (loaded) => {
            failed = false;
            return loaded?.default;
          },
          (cause: unknown) => {
            failed = true;
            throw cause;
          },
        );
        return consume(pending, signal);
      },
    };
  });
  return { registry, remotes };
}

export { watchRemoteUpdates } from './remote-updates';
