import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MountState, ShellState } from '@company/mfe-core';
import type { AppAdapter, AppMount, AppRuntime, BoundaryHistory } from '@company/mfe-host';
import { createReactDriver } from './app-mount';

/** Register once in the host's adapter table. */
export function createReactAdapter(): AppAdapter {
  return { id: 'react', create: createReactDriver };
}

export interface AppHostProps {
  readonly runtime: AppRuntime;
  readonly id: string;
  readonly basePath: string;
  readonly shellState: ShellState;
  readonly createNavigation: () => BoundaryHistory;
  readonly className?: string;
  readonly renderStatus?: (state: MountState, retry: () => void) => ReactNode;
}

/** React binding for a host-owned mount; changing shell state preserves the App. */
export function AppHost(props: AppHostProps) {
  const { runtime, id, basePath, createNavigation } = props;
  const target = useRef<HTMLDivElement>(null);
  const active = useRef<AppMount | undefined>(undefined);
  const latestState = useRef(props.shellState);
  const latestNavigation = useRef(createNavigation);
  useEffect(() => {
    latestState.current = props.shellState;
    latestNavigation.current = createNavigation;
  }, [props.shellState, createNavigation]);
  const [mountHandle, setMountHandle] = useState<AppMount>();
  const [state, setState] = useState<MountState>({ status: 'pending', attempt: 1 });
  useEffect(() => {
    if (!target.current) return;
    const mount = runtime.mountApp({
      id,
      basePath,
      target: target.current,
      shellState: latestState.current,
      createNavigation: () => latestNavigation.current(),
    });
    active.current = mount;
    setMountHandle(mount);
    setState(mount.handle.getState());
    const unsubscribe = mount.handle.subscribe(() => setState(mount.handle.getState()));
    // Errors are represented by the subscribed lifecycle state and diagnostic sink.
    void mount.start().catch(() => {});
    return () => {
      active.current = undefined;
      unsubscribe();
      void mount.handle.dispose().catch(() => {});
    };
  }, [runtime, id, basePath]);
  useEffect(() => {
    const mount = active.current;
    if (mount) void mount.updateShellState(props.shellState).catch(() => {});
  }, [props.shellState]);
  const retry = () => {
    if (mountHandle) void mountHandle.handle.retry().catch(() => {});
  };
  return (
    <>
      {props.renderStatus?.(state, retry)}
      <div ref={target} className={props.className} aria-label={`${id} application`} />
    </>
  );
}
