import type { QueryClient } from '@tanstack/react-query';
import type { ShellState } from './shell-state';

/**
 * Route callbacks receive an immutable snapshot for their native load. Components needing
 * current shell state subscribe through useUser, useGroups, or useTheme.
 * Additional services arrive at their implementation gates.
 */
export interface MfeRouterContext {
  readonly mfe: ShellState & { readonly signal: AbortSignal };
  readonly queryClient: QueryClient;
}
