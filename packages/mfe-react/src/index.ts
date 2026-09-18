import type { QueryClient } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import type { AppDescriptor } from '@company/mfe-core';
import { createMfeError } from '@company/mfe-core';

/** Gate 0 shell fixture data. Service contracts are added at their implementation gates. */
export interface MfeRouterContext {
  readonly mfe: {
    readonly user: { readonly id: string; readonly name: string } | null;
    readonly groups: readonly string[];
    readonly theme: 'light' | 'dark';
    readonly signal: AbortSignal;
  };
  readonly queryClient: QueryClient;
}

/** Original specification contract, retained while Gate 0 tests its feasibility. */
export interface AppRouterOptions {
  readonly basePath: string;
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
