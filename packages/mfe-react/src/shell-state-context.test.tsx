// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createShellState } from '@company/mfe-host';
import type { ShellState, ShellStateStore } from '@company/mfe-core';
import { ShellStateProvider, useGroups, useTheme, useUser } from './shell-state-context';

const initialState: ShellState = {
  user: { id: 'user-1', name: 'Ada' },
  groups: ['readers'],
  theme: 'light',
};

interface ProbeProps {
  readonly onCommit: (name: string) => void;
}

function UserProbe({ onCommit }: ProbeProps) {
  const user = useUser();
  expectTypeOf(user).toEqualTypeOf<ShellState['user']>();
  useEffect(() => onCommit('user'));
  return <span data-testid="user">{user?.name ?? 'Signed out'}</span>;
}

function SignedInProbe({ onCommit }: ProbeProps) {
  const signedIn = useUser((user) => user !== null);
  expectTypeOf(signedIn).toEqualTypeOf<boolean>();
  useEffect(() => onCommit('signed-in'));
  return <span data-testid="signed-in">{String(signedIn)}</span>;
}

function GroupsProbe({ onCommit }: ProbeProps) {
  const groups = useGroups();
  expectTypeOf(groups).toEqualTypeOf<readonly string[]>();
  useEffect(() => onCommit('groups'));
  return <span data-testid="groups">{groups.join(',')}</span>;
}

function ThemeProbe({ onCommit }: ProbeProps) {
  const theme = useTheme();
  expectTypeOf(theme).toEqualTypeOf<'light' | 'dark'>();
  useEffect(() => onCommit('theme'));
  return <span data-testid="theme">{theme}</span>;
}

function DynamicUserProbe({ field }: { readonly field: 'id' | 'name' }) {
  const value = useUser((user) => user?.[field] ?? 'Signed out');
  return <span data-testid="dynamic-user">{value}</span>;
}

function NumericProbe({ onCommit }: ProbeProps) {
  const value = useUser((user) => Number(user?.name));
  useEffect(() => onCommit('numeric'));
  return <span data-testid="numeric">{Object.is(value, -0) ? '-0' : String(value)}</span>;
}

function SelectedGroupsProbe({ onCommit }: ProbeProps) {
  const hasReaders = useGroups((groups) => groups.includes('readers'));
  expectTypeOf(hasReaders).toEqualTypeOf<boolean>();
  useEffect(() => onCommit('selected-groups'));
  return <span data-testid="selected-groups">{String(hasReaders)}</span>;
}

function SelectedThemeProbe({ onCommit }: ProbeProps) {
  const dark = useTheme((theme) => theme === 'dark');
  expectTypeOf(dark).toEqualTypeOf<boolean>();
  useEffect(() => onCommit('selected-theme'));
  return <span data-testid="selected-theme">{String(dark)}</span>;
}

function trackUserSubscriptions(store: ShellStateStore) {
  const active = new Set<() => void>();
  const subscribeUser = vi.fn((listener: () => void) => {
    active.add(listener);
    const unsubscribe = store.subscribeUser(listener);
    return () => {
      active.delete(listener);
      unsubscribe();
    };
  });
  return { store: { ...store, subscribeUser }, active, subscribeUser };
}

afterEach(cleanup);

describe('shell-state hooks', () => {
  it('updates only field consumers whose selected values changed', () => {
    const store = createShellState(initialState);
    const onCommit = vi.fn();
    render(
      <ShellStateProvider store={store}>
        <UserProbe onCommit={onCommit} />
        <SignedInProbe onCommit={onCommit} />
        <GroupsProbe onCommit={onCommit} />
        <ThemeProbe onCommit={onCommit} />
      </ShellStateProvider>,
    );
    onCommit.mockClear();

    act(() => {
      store.update({ ...initialState, theme: 'dark' });
    });

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('user').textContent).toBe('Ada');
    expect(onCommit.mock.calls).toEqual([['theme']]);
    onCommit.mockClear();

    act(() => {
      store.update({ ...store.getSnapshot(), user: { id: 'user-1', name: 'Grace' } });
    });

    expect(screen.getByTestId('user').textContent).toBe('Grace');
    expect(screen.getByTestId('signed-in').textContent).toBe('true');
    expect(onCommit.mock.calls).toEqual([['user']]);
    onCommit.mockClear();

    act(() => {
      store.update({ ...store.getSnapshot(), user: null });
    });

    expect(screen.getByTestId('signed-in').textContent).toBe('false');
    expect(onCommit.mock.calls).toEqual([['user'], ['signed-in']]);
  });

  it('narrows group and theme subscriptions with inferred selectors', () => {
    const store = createShellState(initialState);
    const onCommit = vi.fn();
    render(
      <ShellStateProvider store={store}>
        <SelectedGroupsProbe onCommit={onCommit} />
        <SelectedThemeProbe onCommit={onCommit} />
      </ShellStateProvider>,
    );
    onCommit.mockClear();

    act(() => {
      store.update({ ...initialState, groups: ['readers', 'editors'], theme: 'dark' });
    });

    expect(screen.getByTestId('selected-groups').textContent).toBe('true');
    expect(screen.getByTestId('selected-theme').textContent).toBe('true');
    expect(onCommit.mock.calls).toEqual([['selected-theme']]);
  });

  it('uses the latest selector without recreating its subscription', () => {
    const state = createShellState(initialState);
    const tracked = trackUserSubscriptions(state);
    const view = render(
      <ShellStateProvider store={tracked.store}>
        <DynamicUserProbe field="id" />
      </ShellStateProvider>,
    );
    expect(screen.getByTestId('dynamic-user').textContent).toBe('user-1');

    view.rerender(
      <ShellStateProvider store={tracked.store}>
        <DynamicUserProbe field="name" />
      </ShellStateProvider>,
    );
    expect(screen.getByTestId('dynamic-user').textContent).toBe('Ada');
    act(() => {
      state.update({ ...initialState, user: { id: 'user-2', name: 'Grace' } });
    });

    expect(screen.getByTestId('dynamic-user').textContent).toBe('Grace');
    expect(tracked.subscribeUser).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(tracked.active.size).toBe(0);
  });

  it('uses Object.is for NaN and signed-zero selection results', () => {
    const store = createShellState(initialState);
    const onCommit = vi.fn();
    render(
      <ShellStateProvider store={store}>
        <NumericProbe onCommit={onCommit} />
      </ShellStateProvider>,
    );
    onCommit.mockClear();

    act(() => {
      store.update({ ...initialState, user: { id: 'user-1', name: 'still not a number' } });
    });
    expect(screen.getByTestId('numeric').textContent).toBe('NaN');
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      store.update({ ...initialState, user: { id: 'user-1', name: '-0' } });
    });
    expect(screen.getByTestId('numeric').textContent).toBe('-0');
    act(() => {
      store.update({ ...initialState, user: { id: 'user-1', name: '0' } });
    });
    expect(screen.getByTestId('numeric').textContent).toBe('0');
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('cleans up Strict Mode subscriptions and isolates independent provider stores', () => {
    const first = trackUserSubscriptions(createShellState(initialState));
    const second = trackUserSubscriptions(
      createShellState({ ...initialState, user: { id: 'user-2', name: 'Grace' } }),
    );
    const onCommit = vi.fn();
    const firstView = render(
      <StrictMode>
        <ShellStateProvider store={first.store}>
          <UserProbe onCommit={onCommit} />
          <ShellStateProvider store={second.store}>
            <DynamicUserProbe field="name" />
          </ShellStateProvider>
        </ShellStateProvider>
      </StrictMode>,
    );
    expect(first.active.size).toBe(1);
    expect(second.active.size).toBe(1);
    onCommit.mockClear();

    act(() => {
      second.store.update({ ...initialState, user: { id: 'user-2', name: 'Katherine' } });
    });

    expect(screen.getByTestId('dynamic-user').textContent).toBe('Katherine');
    expect(screen.getByTestId('user').textContent).toBe('Ada');
    expect(onCommit).not.toHaveBeenCalled();
    firstView.unmount();
    expect(first.active.size).toBe(0);
    expect(second.active.size).toBe(0);
  });

  it('explains the missing mount boundary when a provider is absent', () => {
    expect(() => render(<DynamicUserProbe field="name" />)).toThrow(
      'Shell-state hooks require a framework mount with ShellStateProvider.',
    );
  });
});
