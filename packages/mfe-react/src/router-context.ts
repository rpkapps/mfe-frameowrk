import type { QueryClient } from '@tanstack/react-query';
import type { ShellState } from '@company/mfe-core';
import type { MfeDefinitionStorage } from '@company/mfe-host';

/**
 * Route callbacks receive an immutable snapshot for their native load. Components needing
 * current shell state subscribe through useUser, useGroups, or useTheme.
 * Additional services are added through explicit context fields.
 */
export interface MfeRouterContext {
  readonly mfe: ShellState & {
    readonly signal: AbortSignal;
    readonly storage: MfeDefinitionStorage;
  };
  readonly queryClient: QueryClient;
}
