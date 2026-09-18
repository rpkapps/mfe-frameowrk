/** Readonly shell values shared by adapters and their subscriptions. */
export interface ShellState {
  readonly user: { readonly id: string; readonly name: string } | null;
  readonly groups: readonly string[];
  readonly theme: 'light' | 'dark';
}

type Listener = () => void;

/** Host-owned state observed by framework adapters. */
export interface ShellStateStore {
  readonly getSnapshot: () => ShellState;
  readonly getUser: () => ShellState['user'];
  readonly getGroups: () => ShellState['groups'];
  readonly getTheme: () => ShellState['theme'];
  readonly subscribe: (listener: Listener) => () => void;
  readonly subscribeUser: (listener: Listener) => () => void;
  readonly subscribeGroups: (listener: Listener) => () => void;
  readonly subscribeTheme: (listener: Listener) => () => void;
  /** Commits before notification; listener failures are aggregated after all observers run. */
  readonly update: (next: ShellState) => boolean;
  readonly dispose: () => void;
}
