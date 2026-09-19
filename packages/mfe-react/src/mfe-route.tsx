import { useMatches, useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createMfeError } from '@company/mfe-core';
import { AppHost } from './app-host';
import { MFE_HOST_CONTEXT } from '@company/mfe-react/internal/host-context';
import { MFE_APP_BASE_PATH } from '@company/mfe-react/internal/host-context';
import type { MfeRouteHost } from '@company/mfe-react/internal/host-context';

/** Private marker used to bind a child component to the exact splat route that created it. */
const MFE_ROUTE_BINDING = Symbol('mfe.route.binding');
export interface MfeRouteOptions {
  readonly appId: string;
}

interface RouteBinding {
  readonly token: object;
  readonly basePath: string;
}
interface RouteContext {
  readonly [MFE_ROUTE_BINDING]?: RouteBinding;
}

function NestedRouteError({
  appId,
  error,
  reset,
}: ErrorComponentProps & { readonly appId: string }) {
  const router = useRouter();
  const retry = () => {
    reset();
    void router.invalidate({ sync: true, forcePending: true }).catch(() => {});
  };
  return (
    <div role="alert" data-mfe-app={appId}>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  );
}

/** Native route adapter for a child App delegated at a splat boundary. */
export function mfeRoute({ appId }: MfeRouteOptions) {
  const token = {};
  function composeBoundary(boundary: string, mountBasePath?: string): string {
    if (mountBasePath === undefined || mountBasePath === '/') return boundary;
    const base = mountBasePath.replace(/\/$/, '') || '/';
    return `${base}${boundary === '/' ? '' : boundary}` || '/';
  }
  function boundaryPath(
    pathname: string,
    params: Record<string, unknown>,
    mountBasePath?: string,
  ): string {
    const splat = params['_splat'];
    if (typeof splat !== 'string') {
      throw createMfeError({
        id: appId,
        code: 'app/invalid-router',
        operation: 'bind nested App route',
        resource: 'splat parameter',
        expected: 'the exact native splat parameter for this route',
        observed: 'the route did not provide _splat',
        owner: 'the nested App route declaration',
        repair: 'Declare mfeRoute on a native /$ splat route.',
      });
    }
    const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
    const normalizedSplat = splat.replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalizedSplat.length === 0) {
      return composeBoundary(normalizedPath || '/', mountBasePath);
    }
    const suffixes = [
      `/${normalizedSplat}`,
      `/${encodeURI(normalizedSplat)}`,
      `/${encodeURIComponent(normalizedSplat)}`,
    ];
    const suffix = suffixes.find((candidate) => normalizedPath.endsWith(candidate));
    if (suffix === undefined) {
      throw createMfeError({
        id: appId,
        code: 'app/invalid-router',
        operation: 'bind nested App route',
        resource: 'splat boundary',
        expected: 'the native location pathname to end with the exact splat',
        observed: 'the route pathname and splat parameter diverged',
        owner: 'the nested App route declaration',
        repair: 'Keep the route mounted at its declared native splat boundary.',
      });
    }
    return composeBoundary(normalizedPath.slice(0, -suffix.length) || '/', mountBasePath);
  }
  function NestedApp() {
    const matches = useMatches();
    const match = [...(matches as readonly { readonly context: unknown }[])]
      .reverse()
      .find((candidate) => {
        const context = candidate.context as RouteContext | undefined;
        return context?.[MFE_ROUTE_BINDING]?.token === token;
      });
    const binding = (match?.context as RouteContext | undefined)?.[MFE_ROUTE_BINDING];
    if (!binding)
      throw createMfeError({
        id: appId,
        code: 'app/invalid-router',
        operation: 'render nested App route',
        resource: 'route boundary binding',
        expected: 'the exact private binding from this splat route',
        observed: 'the matching native route context was absent',
        owner: 'the nested App route adapter',
        repair: 'Keep the nested App component attached to its mfeRoute boundary.',
      });
    return <AppHost appId={appId} basePath={binding.basePath} />;
  }
  return {
    beforeLoad: ({
      location,
      params,
      context,
    }: {
      readonly location: { readonly pathname: string };
      readonly params: Record<string, unknown>;
      readonly context?: unknown;
    }) => ({
      [MFE_ROUTE_BINDING]: {
        token,
        basePath: boundaryPath(
          location.pathname,
          params,
          (context as { readonly [MFE_APP_BASE_PATH]?: string } | undefined)?.[MFE_APP_BASE_PATH],
        ),
      },
    }),
    component: NestedApp,
    pendingComponent: () => null,
    errorComponent: (props: ErrorComponentProps) => <NestedRouteError appId={appId} {...props} />,
    loader: async ({
      context,
      abortController,
    }: {
      readonly context: unknown;
      readonly abortController: AbortController;
    }) => {
      const host = (context as { readonly [MFE_HOST_CONTEXT]?: MfeRouteHost })[MFE_HOST_CONTEXT];
      if (!host) throw new Error(`App ${appId} preload is unavailable in this host.`);
      await host.preloadApp({ id: appId, signal: abortController.signal });
    },
  };
}
