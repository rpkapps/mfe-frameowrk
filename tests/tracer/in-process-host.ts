import { createMemoryHistory } from '@tanstack/history';
import type { AnyRouter } from '@tanstack/react-router';
import type { MfeError } from '@company/mfe-core';
import type { AppDefinition, MfeRouterContext } from '@company/mfe-react';
import { createAppMount } from '@company/mfe-react/internal';

interface TracerOptions {
  readonly definitions: ReadonlyMap<string, AppDefinition<AnyRouter>>;
  readonly id: string;
  readonly basePath: string;
  readonly target: HTMLElement;
  readonly reportError: (error: MfeError) => void;
  readonly shellState?: Pick<MfeRouterContext['mfe'], 'user' | 'groups' | 'theme'>;
}

/** The in-process loader and memory boundary are test-internal (§16 Gate 0). */
export function createTracerMount(options: TracerOptions) {
  const definition = options.definitions.get(options.id);
  if (!definition) throw new Error(`No in-process fixture definition for ${options.id}.`);
  return createAppMount({
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
  });
}
