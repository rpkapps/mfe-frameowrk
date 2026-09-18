import type { RouterHistory } from '@tanstack/history';
import type { AnyRouter } from '@tanstack/react-router';
import type { AppDescriptor } from '@company/mfe-core';
import { createMfeError } from '@company/mfe-core';
import type { MfeRouterContext } from './router-context';

export type { MfeRouterContext } from './router-context';
export { useUser, useGroups, useTheme } from '@company/mfe-react/internal/shell-state-context';

/** Native bootstrap options supplied for one mount; forward all three unchanged. */
export interface AppRouterOptions {
  readonly basePath: string;
  /** Framework-owned boundary history, never the raw browser History object. */
  readonly history: RouterHistory;
  readonly context: MfeRouterContext;
}

export interface AppDefinition<TRouter extends AnyRouter> extends AppDescriptor {
  readonly router: (options: AppRouterOptions) => TRouter;
}

/** Defines an App without creating a router or starting a mount. */
export function createApp<TRouter extends AnyRouter>(
  options: Omit<AppDefinition<TRouter>, 'kind'>,
): AppDefinition<TRouter> {
  if (options.id.trim().length === 0) {
    throw createMfeError({
      code: 'registry/invalid-descriptor',
      id: options.id,
      operation: 'define App',
      resource: 'id',
      expected: 'a non-empty public definition ID',
      observed: 'an empty or whitespace-only ID',
      owner: 'the App entry',
      repair: 'Set id to a stable, globally unique name in src/mfe.ts.',
    });
  }
  return Object.freeze({ ...options, kind: 'app' });
}

export { AppHost, createReactAdapter } from './app-host';
export type { AppHostProps } from './app-host';
