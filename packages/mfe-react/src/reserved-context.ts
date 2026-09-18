import type { AnyRouter } from '@tanstack/react-router';
import { createMfeError } from '@company/mfe-core';
import type { AppDescriptor, MfeError } from '@company/mfe-core';
import type { MfeRouterContext } from './router-context';

export function invalidRouter(
  definition: AppDescriptor,
  resource: string,
  observed: string,
  repair: string,
  code: 'app/invalid-router' | 'app/invalid-base-path' = 'app/invalid-router',
): MfeError {
  return createMfeError({
    id: definition.id,
    ...(definition.version === undefined ? {} : { definitionVersion: definition.version }),
    code,
    operation: 'validate App router',
    resource,
    expected: 'the framework-supplied option or reserved context value',
    observed,
    owner: 'the App router factory or route',
    repair,
  });
}

/** Issued snapshots may remain in native matches after a theme-only update. */
export function createContextValidator(definition: AppDescriptor, initial: MfeRouterContext) {
  const snapshots = new WeakSet<object>([initial.mfe]);

  function validate(value: unknown, resource: string): void {
    if (typeof value !== 'object' || value === null) {
      throw invalidRouter(
        definition,
        resource,
        'missing router context',
        'Spread the supplied context into createRouter options.',
      );
    }
    if (
      !('mfe' in value) ||
      typeof value.mfe !== 'object' ||
      value.mfe === null ||
      !snapshots.has(value.mfe)
    ) {
      throw invalidRouter(
        definition,
        `${resource}.mfe`,
        'a missing or replaced reserved namespace',
        'Forward context.mfe unchanged; add author fields at the top level.',
      );
    }
    if (!('queryClient' in value) || value.queryClient !== initial.queryClient) {
      throw invalidRouter(
        definition,
        `${resource}.queryClient`,
        'a missing or replaced Query client',
        'Forward context.queryClient unchanged.',
      );
    }
  }

  return {
    validate,
    register: (context: MfeRouterContext) => snapshots.add(context.mfe),
    validateMatches(router: AnyRouter): void {
      for (const match of router.state.matches) {
        validate(match.context, `route ${match.routeId} context`);
      }
    },
  };
}
