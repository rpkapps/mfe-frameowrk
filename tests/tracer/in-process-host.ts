import { createMemoryHistory } from '@tanstack/history';
import type { AnyRouter } from '@tanstack/react-router';
import type { MfeError, ShellState } from '@company/mfe-core';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import type { AppDefinition } from '@company/mfe-react';
import { createAppMount } from '@company/mfe-react/internal';

class FixtureStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(String(key)) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(String(key));
  }
  setItem(key: string, value: string) {
    this.values.set(String(key), String(value));
  }
}

interface TracerOptions {
  readonly definitions: ReadonlyMap<string, AppDefinition<AnyRouter>>;
  readonly id: string;
  readonly basePath: string;
  readonly target: HTMLElement;
  readonly reportError: (error: MfeError) => void;
  readonly shellState?: ShellState;
}

/** The in-process loader and memory boundary are test-internal fixtures. */
export function createTracerMount(options: TracerOptions) {
  const definition = options.definitions.get(options.id);
  if (!definition) throw new Error(`No in-process fixture definition for ${options.id}.`);
  // createAppMount enters the same host AppRegistration normalization path as production;
  // the helper supplies no adapter or loader bypass.
  const storage = createInternalStorageCoordinator({
    local: new FixtureStorage(),
    session: new FixtureStorage(),
    generation: 'tracer-fixture',
    knownDefinitionIds: [options.id],
  });
  const mount = createAppMount({
    definition,
    basePath: options.basePath,
    target: options.target,
    reportError: options.reportError,
    createHistory: () => createMemoryHistory({ initialEntries: [`${options.basePath}/`] }),
    shellState: options.shellState ?? {
      user: { id: 'fixture-user', name: 'Tracer author' },
      groups: ['readers'],
      theme: 'light',
    },
    storage,
  });
  let disposal: Promise<void> | undefined;
  const handle = mount.handle;
  return {
    ...mount,
    handle: {
      get state() {
        return handle.state;
      },
      getState: handle.getState,
      subscribe: handle.subscribe,
      retry: handle.retry,
      dispose() {
        if (disposal === undefined) {
          disposal = handle.dispose().finally(() => storage.dispose());
        }
        return disposal;
      },
    },
  };
}
