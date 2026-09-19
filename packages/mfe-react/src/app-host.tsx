import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MfeError, MountState, ShellStateStore } from '@company/mfe-core';
import { createMfeError, isMfeError } from '@company/mfe-core';
import type { AppAdapter, AppMount, AppRuntime, BoundaryHistory } from '@company/mfe-host';
import { createReactDriver } from './app-mount';
import { useMfeHostEnvironment } from '@company/mfe-react/internal/host-context';
import type { MfeHostEnvironment } from '@company/mfe-react/internal/host-context';

/** The adapter is a shell integration and is intentionally internal-only. */
export function createReactAdapter(environment: MfeHostEnvironment): AppAdapter {
  return {
    id: 'react',
    create: (options) => createReactDriver(options, undefined, undefined, environment),
  };
}

export interface AppHostProps {
  readonly appId: string;
  readonly basePath: string;
  readonly fallback?: (args: { readonly error: MfeError; readonly retry: () => void }) => ReactNode;
  readonly className?: string;
}

interface PreloadResource {
  readonly key: string;
  readonly promise: Promise<void>;
  status: 'pending' | 'ready' | 'error';
  error?: unknown;
}

const preloadResources = new WeakMap<object, Map<string, PreloadResource>>();

function resourceFor(runtime: AppRuntime, appId: string): PreloadResource {
  let resources = preloadResources.get(runtime);
  if (resources === undefined) {
    resources = new Map();
    preloadResources.set(runtime, resources);
  }
  const key = appId;
  const existing = resources.get(key);
  if (existing !== undefined) return existing;
  const controller = new AbortController();
  const resource = {
    key,
    status: 'pending' as PreloadResource['status'],
    promise: Promise.resolve(),
    error: undefined as unknown,
  };
  resource.promise = runtime.preloadApp({ id: appId, signal: controller.signal }).then(
    () => {
      resource.status = 'ready';
    },
    (cause: unknown) => {
      resource.status = 'error';
      resource.error = cause;
    },
  );
  resources.set(key, resource);
  return resource;
}

function asMfeError(appId: string, cause: unknown): MfeError {
  if (isMfeError(cause)) return cause;
  return createMfeError({
    id: appId,
    code: 'load/entry-failure',
    operation: 'preload app',
    resource: 'registered app loader',
    expected: 'a compatible App definition',
    observed: cause instanceof Error ? cause.message : String(cause),
    owner: 'the registered transport',
    repair: 'Check the remote availability, then retry.',
    cause,
  });
}

function useAppMount(
  runtime: AppRuntime,
  id: string,
  basePath: string,
  shellState: ShellStateStore,
  createNavigation: (basePath: string) => BoundaryHistory,
) {
  const target = useRef<HTMLDivElement>(null);
  const active = useRef<AppMount | undefined>(undefined);
  const resource = resourceFor(runtime, id);
  const [, redraw] = useState(0);
  const [state, setState] = useState<MountState>({ status: 'pending', attempt: 1 });

  // Suspense consumes the thenable directly; this is the intentional resource protocol.
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- Suspense resource protocol throws the loader thenable.
  if (resource.status === 'pending') throw resource.promise;
  const preloadError = resource.status === 'error' ? asMfeError(id, resource.error) : undefined;

  useEffect(() => {
    if (preloadError !== undefined || !target.current) return;
    const mount = runtime.mountApp({
      id,
      basePath,
      target: target.current,
      shellState: shellState.getSnapshot(),
      createNavigation: () => createNavigation(basePath),
    });
    active.current = mount;
    setState(mount.handle.getState());
    const unsubscribeMount = mount.handle.subscribe(() => setState(mount.handle.getState()));
    const unsubscribeShell = shellState.subscribe(() => {
      void mount.updateShellState(shellState.getSnapshot()).catch(() => {});
    });
    void mount.start().catch(() => {});
    return () => {
      active.current = undefined;
      unsubscribeMount();
      unsubscribeShell();
      void mount.handle.dispose().catch(() => {});
    };
  }, [runtime, id, basePath, shellState, createNavigation, preloadError]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- retry intentionally captures the resource identity.
  const retry = useCallback(() => {
    const mount = active.current;
    if (mount !== undefined) {
      void mount.handle.retry().catch(() => {});
      return;
    }
    const resources = preloadResources.get(runtime);
    if (resources?.get(resource.key) === resource) resources.delete(resource.key);
    redraw((value) => value + 1);
  }, [resource, runtime]);
  return { target, state, retry, preloadError };
}

function AppHostBody(props: AppHostProps) {
  const environment = useMfeHostEnvironment();
  const { target, state, retry, preloadError } = useAppMount(
    environment.runtime,
    props.appId,
    props.basePath,
    environment.shellState,
    environment.createNavigation,
  );
  const error = preloadError ?? (state.status === 'error' ? state.error : undefined);
  const targetElement = (
    <div ref={target} className={props.className} aria-label={`${props.appId} application`} />
  );
  if (error !== undefined && props.fallback)
    return (
      <>
        {targetElement}
        {props.fallback({ error, retry })}
      </>
    );
  if (error !== undefined) throw error;
  return targetElement;
}

export function AppHost(props: AppHostProps) {
  return <AppHostBody key={`${props.appId}\u0000${props.basePath}`} {...props} />;
}

export { MfeHostProvider } from '@company/mfe-react/internal/host-context';
