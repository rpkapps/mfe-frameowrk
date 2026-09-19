import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ShellStateStore } from '@company/mfe-core';
import type {
  AppRuntime,
  BoundaryHistory,
  ShellSessionBoundary,
  WidgetRuntime,
} from '@company/mfe-host';

export const MFE_HOST_CONTEXT = Symbol('mfe.host.context');
/** Private mount metadata used to compose a native nested boundary. */
export const MFE_APP_BASE_PATH = Symbol('mfe.app.base-path');

/** Private route bridge. It intentionally exposes only bounded preloading. */
export interface MfeRouteHost {
  readonly preloadApp: (options: {
    readonly id: string;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
}

export interface MfeHostEnvironment {
  readonly runtime: AppRuntime;
  readonly shellState: ShellStateStore;
  readonly createNavigation: (basePath: string) => BoundaryHistory;
  readonly widgetRuntime: WidgetRuntime;
  readonly session: ShellSessionBoundary;
}

const HostContext = createContext<MfeHostEnvironment | null>(null);
export function MfeHostProvider({
  value,
  children,
}: {
  readonly value: MfeHostEnvironment;
  readonly children: ReactNode;
}) {
  return <HostContext value={value}>{children}</HostContext>;
}
export function useMfeHostEnvironment(): MfeHostEnvironment {
  const value = useContext(HostContext);
  if (value === null) throw new Error('MfeHostProvider is required for AppHost.');
  return value;
}
export { HostContext };
