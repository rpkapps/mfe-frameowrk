// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRootRouteWithContext, createRouter } from '@tanstack/react-router';
import { z } from 'zod';
import type { MfeRouterContext, AppRouterOptions } from '@company/mfe-react';
import { createApp, createWidget, useMfeSignal, useMfeStorage, useTheme } from '@company/mfe-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createMfeTestEnvironment,
  createTestStorageCoordinator,
  renderApp,
  renderWidget,
} from '@company/mfe-react/testing';

afterEach(cleanup);

let appHookQuery: ReturnType<typeof useQueryClient> | undefined;
let appHookSignal: AbortSignal | undefined;
let appHookStorage: ReturnType<typeof useMfeStorage> | undefined;
let appFactorySignal: AbortSignal | undefined;

function AppContent() {
  const query = useQueryClient();
  const signal = useMfeSignal();
  const storage = useMfeStorage('local');
  useEffect(() => {
    appHookQuery = query;
    appHookSignal = signal;
    appHookStorage = storage;
  }, [query, signal, storage]);
  return <p data-testid="app-content">{contextText()}</p>;
}

function appDefinition() {
  const root = createRootRouteWithContext<MfeRouterContext>()({
    component: AppContent,
  });
  const routeTree = root;
  return createApp({
    id: 'inventory',
    router: ({ basePath, history, context }: AppRouterOptions) => (
      (appFactorySignal = context.mfe.signal),
      createRouter({ routeTree, basepath: basePath, history, context })
    ),
  });
}

function contextText() {
  return 'mounted';
}

describe('author testing facade', () => {
  it('supports component-only providers with stable Query/router identities and shell hooks', async () => {
    const environment = createMfeTestEnvironment({
      id: 'component-only',
      shellState: { user: { id: 'u1', name: 'User' }, groups: ['ops'], theme: 'light' },
    });
    let observedQuery: ReturnType<typeof useQueryClient> | undefined;
    let observedSignal: AbortSignal | undefined;
    let observedStorage: ReturnType<typeof useMfeStorage> | undefined;
    const Probe = () => {
      const query = useQueryClient();
      const signal = useMfeSignal();
      const storage = useMfeStorage('local');
      useEffect(() => {
        observedQuery = query;
        observedSignal = signal;
        observedStorage = storage;
      }, [query, signal, storage]);
      return <output data-testid="theme">{useTheme()}</output>;
    };
    const firstQueryClient = environment.queryClient;
    environment.queryClient.setQueryData(['component'], 'owned');
    render(<Probe />, { wrapper: environment.wrapper });
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(observedQuery).toBe(environment.routerContext.queryClient);
    expect(observedSignal).toBe(environment.routerContext.mfe.signal);
    expect(observedStorage).toBe(environment.routerContext.mfe.storage.local);
    await act(() => environment.setShellState({ theme: 'dark' }));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(environment.routerContext.queryClient).toBe(firstQueryClient);
    expect(environment.queryClient.getQueryData(['component'])).toBe('owned');
    await environment.dispose();
    expect(environment.queryClient.getQueryData(['component'])).toBeUndefined();
    await environment.dispose();
    expect(environment.target.isConnected).toBe(false);
  });

  it('renders an actual App through the neutral runtime and React adapter', async () => {
    const result = await renderApp({ id: 'inventory', definition: appDefinition() });
    expect(result.getQueries().getByTestId('app-content').textContent).toBe('mounted');
    expect(appHookQuery).toBe(result.queryClient);
    expect(appHookStorage).toBe(result.routerContext.mfe.storage.local);
    expect(appHookSignal).toBe(appFactorySignal);
    await result.dispose();
    await result.dispose();
  });

  it('renders an actual Widget through the neutral runtime and adapter and rerenders inputs', async () => {
    const definition = createWidget({
      id: 'badge',
      inputs: z.object({ value: z.number() }),
      events: {},
      render: ({ inputs }) => <output data-testid="widget">{JSON.stringify(inputs)}</output>,
    });
    const result = await renderWidget({ definition, inputs: { value: 1 } });
    await waitFor(() => expect(result.getByTestId('widget').textContent).toBe('{"value":1}'));
    act(() => result.rerender({ inputs: { value: 2 } }));
    await waitFor(() => expect(result.getByTestId('widget').textContent).toBe('{"value":2}'));
    await result.unmount();
  });

  it('isolates storage by default and resets session-retained values on identity changes', async () => {
    const first = createMfeTestEnvironment({ id: 'notes' });
    const second = createMfeTestEnvironment({ id: 'notes' });
    expect(first.storage.coordinator).not.toBe(second.storage.coordinator);
    first.storage.local.setItem(
      'notes:draft',
      JSON.stringify({
        marker: '@company/mfe-storage/v1',
        version: 1,
        retention: 'session',
        generation: 'test-generation-0',
        value: 'old draft',
      }),
    );
    await first.setShellState({ user: { id: 'u2', name: 'New user' } });
    expect(first.storage.local.getItem('notes:draft')).toBeNull();
    expect(second.storage.local.getItem('notes:draft')).toBeNull();
    await first.dispose();
    await second.dispose();
  });
  it('shares coordinated key updates and keeps a caller-owned coordinator alive', async () => {
    const shared = createTestStorageCoordinator({ generation: 'shared-generation' });
    const first = createMfeTestEnvironment({ id: 'shared', storageCoordinator: shared });
    const second = createMfeTestEnvironment({ id: 'shared', storageCoordinator: shared });
    const schema = z.string();
    const firstKey = first.storage.coordinator
      .forDefinitionInternal('shared')
      .local.subscribeKey('note', schema, { defaultValue: 'empty' });
    const secondKey = second.storage.coordinator
      .forDefinitionInternal('shared')
      .local.subscribeKey('note', schema, { defaultValue: 'empty' });
    let notifications = 0;
    secondKey.subscribe(() => {
      notifications += 1;
    });
    firstKey.set('from-first');
    expect(secondKey.getSnapshot()).toBe('from-first');
    expect(notifications).toBeGreaterThan(0);
    await first.dispose();
    secondKey.set('from-second');
    expect(secondKey.getSnapshot()).toBe('from-second');
    await second.dispose();
    expect(() => shared.forDefinition('shared')).not.toThrow();
    shared.dispose();
  });
});
