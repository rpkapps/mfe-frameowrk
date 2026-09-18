import type { ShellState, ShellStateStore } from '@company/mfe-core';

type Listener = () => void;

function copyUser(user: ShellState['user']): ShellState['user'] {
  return user === null ? null : Object.freeze({ id: user.id, name: user.name });
}

function equalUsers(first: ShellState['user'], second: ShellState['user']): boolean {
  return (
    first === second ||
    (first !== null && second !== null && first.id === second.id && first.name === second.name)
  );
}

function equalGroups(current: readonly string[], next: ReadonlySet<string>): boolean {
  return current.length === next.size && current.every((group) => next.has(group));
}

/**
 * Owns one mount's cached immutable snapshots. Groups represent membership, so
 * duplicates and ordering alone do not change the snapshot. Disposal freezes the
 * final readable snapshot and makes subsequent subscriptions and updates inert.
 */
export function createShellState(initial: ShellState): ShellStateStore {
  let snapshot: ShellState = Object.freeze({
    user: copyUser(initial.user),
    groups: Object.freeze([...new Set(initial.groups)]),
    theme: initial.theme,
  });
  let disposed = false;
  const observers = new Set<Listener>();
  const userObservers = new Set<Listener>();
  const groupObservers = new Set<Listener>();
  const themeObservers = new Set<Listener>();

  function subscribeTo(listeners: Set<Listener>, listener: Listener): () => void {
    if (disposed) return () => {};
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function notify(listeners: Set<Listener>, errors: unknown[]): void {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    }
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    getUser: () => snapshot.user,
    getGroups: () => snapshot.groups,
    getTheme: () => snapshot.theme,
    subscribe: (listener: Listener) => subscribeTo(observers, listener),
    subscribeUser: (listener: Listener) => subscribeTo(userObservers, listener),
    subscribeGroups: (listener: Listener) => subscribeTo(groupObservers, listener),
    subscribeTheme: (listener: Listener) => subscribeTo(themeObservers, listener),
    update(next: ShellState): boolean {
      if (disposed) return false;
      const groups = new Set(next.groups);
      const userChanged = !equalUsers(snapshot.user, next.user);
      const groupsChanged = !equalGroups(snapshot.groups, groups);
      const themeChanged = snapshot.theme !== next.theme;
      if (!userChanged && !groupsChanged && !themeChanged) return false;

      snapshot = Object.freeze({
        user: userChanged ? copyUser(next.user) : snapshot.user,
        groups: groupsChanged ? Object.freeze([...groups]) : snapshot.groups,
        theme: next.theme,
      });

      const errors: unknown[] = [];
      // Whole-state observers receive the committed snapshot before field observers.
      notify(observers, errors);
      if (userChanged) notify(userObservers, errors);
      if (groupsChanged) notify(groupObservers, errors);
      if (themeChanged) notify(themeObservers, errors);
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Shell-state subscription callbacks failed');
      }
      return true;
    },
    dispose(): void {
      disposed = true;
      observers.clear();
      userObservers.clear();
      groupObservers.clear();
      themeObservers.clear();
    },
  });
}
