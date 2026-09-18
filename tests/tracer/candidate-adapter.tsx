import { createMemoryHistory } from '@tanstack/history';
import type { RouterHistory } from '@tanstack/history';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, useRouterState } from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import { Component } from 'react';
import type { PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createMfeError } from '@company/mfe-core';
import type { MfeError } from '@company/mfe-core';
import { createMountLifecycle } from '@company/mfe-host/internal';
import type { AppDefinition, MfeRouterContext } from '@company/mfe-react';

type Definition = AppDefinition<AnyRouter>;

class MountErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface CandidateOptions {
  readonly definitions: ReadonlyMap<string, Definition>;
  readonly id: string;
  readonly basePath: string;
  readonly target: HTMLElement;
  readonly reportError: (error: MfeError) => void;
}

function invalidRouter(
  definition: Definition,
  resource: string,
  observed: string,
  repair: string,
  code: 'app/invalid-router' | 'app/invalid-base-path' = 'app/invalid-router',
): MfeError {
  return createMfeError({
    id: definition.id,
    ...(definition.version === undefined ? {} : { definitionVersion: definition.version }),
    code,
    operation: 'mount App',
    resource,
    expected: 'the exact framework-supplied option or reserved context value',
    observed,
    owner: 'the App router factory or route',
    repair,
  });
}

function validateContext(
  definition: Definition,
  value: unknown,
  expected: MfeRouterContext,
  resource: string,
): void {
  if (typeof value !== 'object' || value === null) {
    throw invalidRouter(
      definition,
      resource,
      'missing router context',
      'Spread the supplied context into createRouter options.',
    );
  }
  if (!('mfe' in value) || value.mfe !== expected.mfe) {
    throw invalidRouter(
      definition,
      `${resource}.mfe`,
      'a missing or replaced reserved namespace',
      'Forward context.mfe unchanged; add author fields at the top level.',
    );
  }
  if (!('queryClient' in value) || value.queryClient !== expected.queryClient) {
    throw invalidRouter(
      definition,
      `${resource}.queryClient`,
      'a missing or replaced Query client',
      'Forward context.queryClient unchanged.',
    );
  }
}

function validateMatches(
  definition: Definition,
  router: AnyRouter,
  context: MfeRouterContext,
): void {
  for (const match of router.state.matches) {
    validateContext(definition, match.context, context, `route ${match.routeId} context`);
    if (match.status === 'error') throw match.error;
  }
}

function createReservedContextGuard(
  definition: Definition,
  context: MfeRouterContext,
  AuthorWrap: AnyRouter['options']['InnerWrap'],
) {
  return function ReservedContextGuard({ children }: PropsWithChildren) {
    const matches = useRouterState({ select: (state) => state.matches });
    for (const match of matches) {
      validateContext(definition, match.context, context, `route ${match.routeId} context`);
    }
    return AuthorWrap ? <AuthorWrap>{children}</AuthorWrap> : <>{children}</>;
  };
}

/**
 * Test-only candidate, not the production adapter. Native factory construction
 * transiently patches global History before this candidate can replace it.
 * Keeping that defect visible in conformance tests is part of this fixture.
 */
export function createCandidateMount(options: CandidateOptions) {
  const definition = options.definitions.get(options.id);
  if (!definition) throw new Error(`No in-process fixture definition for ${options.id}.`);
  const placement = document.createElement('div');
  placement.dataset.tracerId = definition.id;
  options.target.append(placement);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let activeRouter: AnyRouter | undefined;
  let rootCount = 0;

  const lifecycle = createMountLifecycle({
    definition,
    reportError: options.reportError,
    detach: () => placement.remove(),
    async cleanup() {
      await queryClient.cancelQueries();
      queryClient.clear();
    },
    async mount(attempt) {
      const context: MfeRouterContext = Object.freeze({
        mfe: Object.freeze({
          user: Object.freeze({ id: 'fixture-user', name: 'Tracer author' }),
          groups: Object.freeze(['readers']),
          theme: 'light',
          signal: attempt.mountSignal,
        }),
        queryClient,
      });

      const router = definition.router({ basePath: options.basePath, context });
      const defaultHistory = router.options.history === undefined;
      if (defaultHistory) {
        // This restores the original global methods, but cannot undo the fact
        // they were replaced during construction. It is not Gate 0 acceptance.
        // AnyRouter erases its history generic; the native RouterHistory shape
        // is restored only at this dependency interoperability boundary.
        const constructedHistory = router.history as RouterHistory;
        constructedHistory.destroy();
      } else {
        throw invalidRouter(
          definition,
          'router.options.history',
          'author-supplied history',
          'Remove history from createRouter options; the adapter owns it.',
        );
      }

      if (router.options.basepath !== options.basePath) {
        throw invalidRouter(
          definition,
          'router.options.basepath',
          String(router.options.basepath),
          'Pass basePath unchanged as createRouter({ basepath: basePath }).',
          'app/invalid-base-path',
        );
      }
      validateContext(definition, router.options.context, context, 'router factory context');

      const history = createMemoryHistory({ initialEntries: [`${options.basePath}/`] });
      attempt.onDetach(() => {
        activeRouter = undefined;
      });
      attempt.onCleanup(() => history.destroy());
      router.update({
        history,
        InnerWrap: createReservedContextGuard(definition, context, router.options.InnerWrap),
      });
      activeRouter = router;
      await router.load();
      if (!attempt.isCurrent()) return;

      // Supported inspection after loading prevents invalid initial UI from
      // mounting. It does not prevent loaders from seeing a shadowed context.
      validateMatches(definition, router, context);
      attempt.commit(() => {
        const content = document.createElement('div');
        placement.append(content);
        attempt.onDetach(() => content.remove());
        const root = createRoot(content, {
          onCaughtError: attempt.fail,
          onUncaughtError: attempt.fail,
        });
        rootCount++;
        attempt.onCleanup(() => {
          root.unmount();
          rootCount--;
        });
        flushSync(() => {
          root.render(
            <MountErrorBoundary>
              <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
              </QueryClientProvider>
            </MountErrorBoundary>,
          );
        });
      });
    },
  });

  return {
    ...lifecycle,
    placement,
    queryClient,
    /** Inspection only: never an author-facing router or loader surface. */
    getRouter: () => activeRouter,
    getRootCount: () => rootCount,
  };
}
