// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ShellState } from '@company/mfe-core';
import { createAppRuntime, createBrowserNavigation } from '@company/mfe-host';
import type { AppAdapter } from '@company/mfe-host';
import { AppHost } from './app-host';

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
    registry: [{ id: 'example', adapter: 'plain-dom', load }],
    adapters: [{ id: 'plain-dom', create }],
    reportError,
  });
  const initialState: ShellState = { user: null, groups: [], theme: 'light' };
  const originalNavigation = vi.fn(() => navigation.createBoundaryHistory('/example'));
  const freshNavigation = vi.fn(() => navigation.createBoundaryHistory('/example'));

  try {
    const view = render(
      <AppHost
        runtime={runtime}
        id="example"
        basePath="/example"
        shellState={initialState}
        createNavigation={() => originalNavigation()}
      />,
    );
    const content = await screen.findByTestId('mounted-app');
    expect(content.textContent).toBe('light');

    view.rerender(
      <AppHost
        runtime={runtime}
        id="example"
        basePath="/example"
        shellState={{ ...initialState, theme: 'dark' }}
        createNavigation={() => freshNavigation()}
      />,
    );
    await waitFor(() => expect(content.textContent).toBe('dark'));
    expect(screen.getByTestId('mounted-app')).toBe(content);
    expect(create).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(originalNavigation).toHaveBeenCalledTimes(1);
    expect(freshNavigation).not.toHaveBeenCalled();
    expect(detach).not.toHaveBeenCalled();

    view.unmount();
    expect(content.isConnected).toBe(false);
    expect(detach).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    expect(reportError).not.toHaveBeenCalled();
  } finally {
    cleanup();
    navigation.dispose();
  }
});
