// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ShellState } from '@company/mfe-core';
import {
  createAppRuntime,
  createBrowserNavigation,
  createShellSession,
  createShellState,
  createWidgetRuntime,
} from '@company/mfe-host';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import type { AppAdapter } from '@company/mfe-host';
import { AppHost } from './app-host';
import { MfeHostProvider } from './host-context';

afterEach(cleanup);

it('preserves the mount across inline navigation callbacks and shell-state updates', async () => {
  window.history.replaceState(null, '', '/example');
  const navigation = createBrowserNavigation(window);
  const reportError = vi.fn();
  const detach = vi.fn();
  const dispose = vi.fn();
  const create = vi.fn<AppAdapter['create']>(({ placement, shellState, createNavigation }) => ({
    mount(attempt) {
      const history = createNavigation?.();
      attempt.onDetach(() => history?.destroy());
      const content = document.createElement('p');
      content.dataset.testid = 'mounted-app';
      const update = () => {
        content.textContent = shellState.getTheme();
      };
      update();
      attempt.onDetach(shellState.subscribeTheme(update));
      attempt.commit(() => placement.append(content));
    },
    detach,
    dispose,
  }));
  const load = vi.fn(() => Promise.resolve({ kind: 'app', id: 'example' }));
  const runtime = createAppRuntime({
    registry: [{ id: 'example', kind: 'app', contractMajor: 1, adapter: 'plain-dom', load }],
    adapters: [{ id: 'plain-dom', create }],
    reportError,
  });
  const widgetRuntime = createWidgetRuntime({
    registry: [],
    adapter: { create: () => ({ mount: () => {} }) },
    reportError,
  });
  const initialState: ShellState = { user: null, groups: [], theme: 'light' };
  const shellState = createShellState(initialState);
  const sessionCoordinator = createInternalStorageCoordinator({ generation: 'app-host-test' });
  const session = createShellSession({
    coordinator: sessionCoordinator,
    createGeneration: () => 'app-host-test-next',
    initial: initialState,
    store: shellState,
  });
  const originalNavigation = vi.fn(() => navigation.createBoundaryHistory('/example'));

  try {
    const view = render(
      <MfeHostProvider
        value={{
          runtime,
          shellState,
          createNavigation: () => originalNavigation(),
          widgetRuntime,
          session,
        }}
      >
        <AppHost appId="example" basePath="/example" />
      </MfeHostProvider>,
    );
    const content = await screen.findByTestId('mounted-app');
    expect(content.textContent).toBe('light');

    shellState.update({ ...initialState, theme: 'dark' });
    await waitFor(() => expect(content.textContent).toBe('dark'));
    expect(screen.getByTestId('mounted-app')).toBe(content);
    expect(create).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(originalNavigation).toHaveBeenCalledTimes(1);
    expect(detach).not.toHaveBeenCalled();

    view.unmount();
    expect(content.isConnected).toBe(false);
    expect(detach).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    expect(reportError).not.toHaveBeenCalled();
  } finally {
    cleanup();
    shellState.dispose();
    session.dispose();
    sessionCoordinator.dispose();
    navigation.dispose();
  }
});
