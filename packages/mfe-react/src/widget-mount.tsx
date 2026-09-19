import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createMfeError, isMfeError } from '@company/mfe-core';
import type { MfeError, MountState, WidgetContract } from '@company/mfe-core';
import type { WidgetMount as HostWidgetMount, WidgetRuntime } from '@company/mfe-host';
import { useMfeHostEnvironment } from '@company/mfe-react/internal/host-context';

export interface WidgetMountProps {
  readonly id: string;
  readonly inputs: Record<string, unknown>;
  readonly contract?: WidgetContract;
  readonly handlers?: Readonly<Record<string, unknown>>;
  readonly fallback?: (state: {
    readonly error: MfeError;
    readonly retry: () => void;
  }) => ReactNode;
}

interface PreloadResource {
  readonly key: string;
  readonly controller: AbortController;
  promise: Promise<void>;
  status: 'pending' | 'ready' | 'error';
  error?: unknown;
}

const preloadResources = new WeakMap<object, Map<string, PreloadResource>>();

function resourceFor(runtime: WidgetRuntime, id: string): PreloadResource {
  let resources = preloadResources.get(runtime);
  if (resources === undefined) {
    resources = new Map();
    preloadResources.set(runtime, resources);
  }
  const existing = resources.get(id);
  if (existing !== undefined) return existing;

  const controller = new AbortController();
  const resource: PreloadResource = {
    key: id,
    controller,
    status: 'pending',
    promise: Promise.resolve(),
  };
  const promise = runtime.preloadWidget({ id, signal: controller.signal }).then(
    () => {
      resource.status = 'ready';
    },
    (cause: unknown) => {
      resource.status = 'error';
      resource.error = cause;
    },
  );
  resource.promise = promise;
  resources.set(id, resource);
  return resource;
}

function resourceError(id: string, cause: unknown): MfeError {
  if (isMfeError(cause)) return cause;
  return createMfeError({
    id,
    code: 'load/entry-failure',
    operation: 'preload Widget',
    resource: 'registered Widget loader',
    expected: 'a compatible Widget definition',
    observed: cause instanceof Error ? cause.message : String(cause),
    owner: 'the registered transport',
    repair: 'Check the remote availability, then retry.',
    cause,
  });
}

/** React binding for the host-owned Widget lifecycle. */
export function WidgetMount(props: WidgetMountProps) {
  const host = useMfeHostEnvironment();
  const resource = resourceFor(host.widgetRuntime, props.id);
  const [, redraw] = useState(0);
  const target = useRef<HTMLDivElement>(null);
  const active = useRef<HostWidgetMount | undefined>(undefined);
  const [state, setState] = useState<MountState>({ status: 'pending', attempt: 1 });

  const retry = () => {
    const mount = active.current;
    if (mount !== undefined) {
      void mount.handle.retry().catch(() => {});
      return;
    }
    const resources = preloadResources.get(host.widgetRuntime);
    if (resources?.get(resource.key) === resource) resources.delete(resource.key);
    redraw((value) => value + 1);
  };

  useEffect(() => {
    if (resource.status !== 'ready') return;
    const mountTarget = target.current;
    if (mountTarget === null) return;

    const mount = host.widgetRuntime.mountWidget({
      id: props.id,
      target: mountTarget,
      inputs: props.inputs,
      ...(props.handlers === undefined ? {} : { handlers: props.handlers }),
      ...(props.contract === undefined ? {} : { contract: props.contract }),
    });
    active.current = mount;
    setState(mount.handle.getState());
    const unsubscribe = mount.handle.subscribe(() => setState(mount.handle.getState()));
    const start = mount.start();
    void start.catch(() => {});

    return () => {
      active.current = undefined;
      unsubscribe();
      void mount.handle.dispose().catch(() => {});
    };
    // The resource controls activation; prop changes are forwarded by the update effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one neutral lifecycle per ready Widget identity.
  }, [host.widgetRuntime, props.id, resource]);

  useEffect(() => {
    if (resource.status !== 'ready') return;
    active.current?.update(props.inputs, props.handlers, props.contract);
  }, [props.inputs, props.handlers, props.contract, resource]);

  // Suspense consumes this pending resource and retries the component on settle.
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense resources are promises.
  if (resource.status === 'pending') throw resource.promise;
  if (resource.status === 'error') {
    const error = resourceError(props.id, resource.error);
    // eslint-disable-next-line react-hooks/refs -- retry reads the active lifecycle when invoked.
    if (props.fallback !== undefined) return props.fallback({ error, retry });
    throw error;
  }

  const error = state.status === 'error' ? state.error : undefined;
  if (error !== undefined && props.fallback !== undefined) {
    return (
      <>
        <div ref={target} aria-label={`${props.id} widget`} />
        {/* eslint-disable-next-line react-hooks/refs -- retry reads the active lifecycle when invoked. */}
        {props.fallback({ error, retry })}
      </>
    );
  }
  if (error !== undefined) throw error;
  return <div ref={target} aria-label={`${props.id} widget`} />;
}
