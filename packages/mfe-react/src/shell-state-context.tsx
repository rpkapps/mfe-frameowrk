import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { ShellState, ShellStateStore } from './shell-state';

const ShellStateContext = createContext<ShellStateStore | null>(null);

/** The adapter supplies one stable store for the lifetime of this mount. */
export function ShellStateProvider({
  store,
  children,
}: {
  readonly store: ShellStateStore;
  readonly children: ReactNode;
}) {
  return <ShellStateContext value={store}>{children}</ShellStateContext>;
}

function useShellStateStore(): ShellStateStore {
  const store = useContext(ShellStateContext);
  if (store === null) {
    throw new Error('Shell-state hooks require a framework mount with ShellStateProvider.');
  }
  return store;
}

function identity<Value>(value: Value): Value {
  return value;
}

function createSelectedSnapshot<Value, Selected>(
  getSnapshot: () => Value,
  select: (value: Value) => Selected,
): () => Selected {
  let cached: { readonly snapshot: Value; readonly selection: Selected } | undefined;
  return () => {
    const snapshot = getSnapshot();
    if (cached !== undefined && Object.is(cached.snapshot, snapshot)) return cached.selection;

    const selected = select(snapshot);
    const selection =
      cached !== undefined && Object.is(cached.selection, selected) ? cached.selection : selected;
    cached = { snapshot, selection };
    return selection;
  };
}

function useSelectedField<Value, Selected>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => Value,
  select: (value: Value) => Selected,
): Selected {
  // Each selector gets its own cache, so a new render cannot overwrite another
  // render's selector. Repeated external-store reads retain one selected snapshot.
  const getSelection = useMemo(
    () => createSelectedSnapshot(getSnapshot, select),
    [getSnapshot, select],
  );

  return useSyncExternalStore(subscribe, getSelection, getSelection);
}

/** Select with Object.is equality; aggregate selectors must preserve references. */
export function useUser(): ShellState['user'];
export function useUser<Selected>(select: (user: ShellState['user']) => Selected): Selected;
export function useUser<Selected>(
  select?: (user: ShellState['user']) => Selected,
): ShellState['user'] | Selected {
  const store = useShellStateStore();
  return useSelectedField<ShellState['user'], ShellState['user'] | Selected>(
    store.subscribeUser,
    store.getUser,
    select ?? identity,
  );
}

/** Select with Object.is equality; group membership updates preserve no-op snapshots. */
export function useGroups(): ShellState['groups'];
export function useGroups<Selected>(select: (groups: ShellState['groups']) => Selected): Selected;
export function useGroups<Selected>(
  select?: (groups: ShellState['groups']) => Selected,
): ShellState['groups'] | Selected {
  const store = useShellStateStore();
  return useSelectedField<ShellState['groups'], ShellState['groups'] | Selected>(
    store.subscribeGroups,
    store.getGroups,
    select ?? identity,
  );
}

/** Select with Object.is equality; unrelated user and group updates do not notify this hook. */
export function useTheme(): ShellState['theme'];
export function useTheme<Selected>(select: (theme: ShellState['theme']) => Selected): Selected;
export function useTheme<Selected>(
  select?: (theme: ShellState['theme']) => Selected,
): ShellState['theme'] | Selected {
  const store = useShellStateStore();
  return useSelectedField<ShellState['theme'], ShellState['theme'] | Selected>(
    store.subscribeTheme,
    store.getTheme,
    select ?? identity,
  );
}
