/** Navigation values shared by host integrations and framework adapters. */
export interface BoundaryState {
  readonly key: string;
  readonly index: number;
}
export interface BoundaryLocation {
  readonly href: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly state: BoundaryState;
}
export type HistoryAction = 'PUSH' | 'REPLACE' | 'BACK' | 'FORWARD' | 'GO';
export type HistoryNotification =
  { readonly type: Exclude<HistoryAction, 'GO'> } | { readonly type: 'GO'; readonly index: number };
export interface NavigateOptions {
  readonly ignoreBlocker?: boolean;
}
export interface BlockerArgs {
  readonly currentLocation: BoundaryLocation;
  readonly nextLocation: BoundaryLocation;
  readonly action: HistoryAction;
}
export interface NavigationBlocker {
  readonly blockerFn: (args: BlockerArgs) => boolean | Promise<boolean>;
  readonly enableBeforeUnload?: boolean | (() => boolean);
}
export interface BoundaryUpdate {
  readonly location: BoundaryLocation;
  readonly action: HistoryNotification;
}
export interface BoundaryHistory {
  readonly location: BoundaryLocation;
  readonly length: number;
  readonly subscribers: Set<(update: BoundaryUpdate) => void>;
  subscribe(listener: (update: BoundaryUpdate) => void): () => void;
  push(path: string, state?: object, options?: NavigateOptions): void;
  replace(path: string, state?: object, options?: NavigateOptions): void;
  go(delta: number, options?: NavigateOptions): void;
  back(options?: NavigateOptions): void;
  forward(options?: NavigateOptions): void;
  canGoBack(): boolean;
  createHref(href: string): string;
  block(blocker: NavigationBlocker): () => void;
  flush(): void;
  destroy(): void;
  notify(action: HistoryNotification): void;
  getBlockers(): readonly NavigationBlocker[];
}
