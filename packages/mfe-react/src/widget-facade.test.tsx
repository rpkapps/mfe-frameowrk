// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAppRuntime,
  createShellSession,
  createShellState,
  createWidgetRuntime,
} from '@company/mfe-host';
import type { MfeError, WidgetSchema } from '@company/mfe-core';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import { MfeHostProvider } from './host-context';
import { createWidget } from './widget-definition';
import { lazyWidget } from './lazy-widget';
import { createReactWidgetAdapter } from './widget-adapter';
import type { WidgetDefinition } from './widget-definition';
import { useUser } from './index';
import { useMfeSignal, useMfeStorage } from './index';

interface Values {
  readonly label: string;
}

interface Selected {
  readonly id: string;
}

interface DefinitionCounters {
  inputParse: number;
  render: number;
}

function schema<T>(
  parse: (value: unknown) => value is T,
  onParse?: () => void,
): WidgetSchema<T, T> {
  return {
    safeParse(value: unknown) {
      onParse?.();
      return parse(value)
        ? { success: true, data: value }
        : {
            success: false,
            error: { issues: [{ path: [], message: 'schema rejected value' }] },
          };
    },
  } as unknown as WidgetSchema<T, T>;
}

class MapStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function makeDefinition(counters?: DefinitionCounters) {
  const inputs = schema<Values>(
    (value): value is Values =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { label?: unknown }).label === 'string',
    counters === undefined ? undefined : () => (counters.inputParse += 1),
  );
  const events = {
    selected: schema<Selected>(
      (value): value is Selected =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { id?: unknown }).id === 'string',
    ),
  };
  return createWidget({
    id: 'panel',
    inputs,
    events,
    render: ({ inputs: value, emit }) => {
      if (counters !== undefined) counters.render += 1;
      return <button onClick={() => emit('selected', { id: value.label })}>{value.label}</button>;
    },
  });
}

function makeInvalidEventDefinition() {
  const definition = makeDefinition();
  return createWidget({
    id: definition.id,
    inputs: definition.inputs,
    events: definition.events,
    render: ({ emit }) => (
      <button
        onClick={() => {
          try {
            emit('selected', { id: 3 as unknown as string });
          } catch {
            providerEmitThrew = true;
          }
        }}
      >
        emit
      </button>
    ),
  });
}

let providerEmitThrew = false;

function makeQueryDefinition() {
  const definition = makeDefinition();
  return createWidget({
    id: definition.id,
    inputs: definition.inputs,
    events: definition.events,
    render: () => <QueryWidget />,
  });
}

const queryClientIds = new WeakMap<object, number>();
let queryClientSequence = 0;

function queryClientId(client: object): number {
  const existing = queryClientIds.get(client);
  if (existing !== undefined) return existing;
  queryClientSequence += 1;
  queryClientIds.set(client, queryClientSequence);
  return queryClientSequence;
}

function QueryWidget() {
  const user = useUser();
  const queryClient = useQueryClient();
  // The stable key deliberately verifies shell-session callback freshness.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- this is a stale-callback regression fixture.
  const result = useQuery({
    queryKey: ['widget-session'],
    initialData: 'old',
    queryFn: () => Promise.resolve(user?.id === 'new-user' ? 'new' : 'old'),
  });
  return (
    <p data-testid="query-value" data-query-client={queryClientId(queryClient)}>
      {result.data}
    </p>
  );
}

const signalIds = new WeakMap<object, number>();
const storageIds = new WeakMap<object, number>();
let identitySequence = 0;

function identityId(values: WeakMap<object, number>, value: object): number {
  const existing = values.get(value);
  if (existing !== undefined) return existing;
  identitySequence += 1;
  values.set(value, identitySequence);
  return identitySequence;
}

function IdentityWidget() {
  const signal = useMfeSignal();
  const storage = useMfeStorage('local');
  const queryClient = useQueryClient();
  return (
    <p data-testid="widget-identity">
      {`${identityId(queryClientIds, queryClient)}:${identityId(signalIds, signal)}:${identityId(storageIds, storage)}`}
    </p>
  );
}

function makeIdentityDefinition() {
  const definition = makeDefinition();
  return createWidget({
    id: definition.id,
    inputs: definition.inputs,
    events: definition.events,
    render: () => <IdentityWidget />,
  });
}

function mountEnvironment(
  definition: WidgetDefinition,
  reportError: (error: MfeError) => void,
  shellState = createShellState({ user: null, groups: [], theme: 'light' }),
) {
  const coordinator = createInternalStorageCoordinator({
    local: new MapStorage(),
    session: new MapStorage(),
    generation: 'widget-test',
  });
  const session = createShellSession({
    coordinator,
    createGeneration: () => 'widget-test-next',
    initial: shellState.getSnapshot(),
    store: shellState,
  });
  const adapter = createReactWidgetAdapter({
    shellState,
    session,
    services: {
      id: definition.id,
      kind: 'widget',
      storage: coordinator.forDefinition(definition.id),
      internalStorage: coordinator.forDefinitionInternal(definition.id),
      signal: new AbortController().signal,
    },
  });
  const runtime = createWidgetRuntime({
    registry: [
      {
        id: definition.id,
        kind: 'widget',
        contractMajor: 1,
        load: () => Promise.resolve(definition),
      },
    ],
    adapter,
    reportError,
  });
  const appRuntime = createAppRuntime({ registry: [], adapters: [], reportError });
  return {
    shellState,
    session,
    coordinator,
    appRuntime,
    runtime,
    dispose() {
      session.dispose();
      coordinator.dispose();
      shellState.dispose();
    },
  };
}

const Panel = lazyWidget('panel');

afterEach(cleanup);

describe('public Widget React facade', () => {
  it('reports a structured diagnostic for an empty Widget ID', () => {
    const definition = makeDefinition();
    expect(() =>
      createWidget({
        id: '   ',
        inputs: definition.inputs,
        events: definition.events,
        render: definition.render,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'registry/invalid-descriptor',
        operation: 'define Widget',
        id: '   ',
      }),
    );
  });

  it('reports invalid initial inputs and retries with the latest valid inputs', async () => {
    const definition = makeDefinition();
    const reportError = vi.fn();
    const environment = mountEnvironment(definition, reportError);
    const view = render(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <Panel
          label={3}
          fallback={({ error, retry }) => <button onClick={retry}>{`${error.code}:retry`}</button>}
        />
      </MfeHostProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toBe('contract/input-mismatch:retry'),
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'contract/input-mismatch', direction: 'input' }),
    );

    view.rerender(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <Panel
          label="latest"
          fallback={({ error, retry }) => <button onClick={retry}>{`${error.code}:retry`}</button>}
        />
      </MfeHostProvider>,
    );
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('latest'));
    view.unmount();
    environment.dispose();
  });

  it('suspends while the neutral runtime preloads a Widget', async () => {
    const definition = makeDefinition();
    const reportError = vi.fn();
    const shellState = createShellState({ user: null, groups: [], theme: 'light' });
    const coordinator = createInternalStorageCoordinator({
      local: new MapStorage(),
      session: new MapStorage(),
      generation: 'widget-test',
    });
    const session = createShellSession({
      coordinator,
      createGeneration: () => 'widget-test-next',
      initial: shellState.getSnapshot(),
      store: shellState,
    });
    let release: (definition: ReturnType<typeof makeDefinition>) => void = () => {};
    const pending = new Promise<ReturnType<typeof makeDefinition>>((resolve) => {
      release = resolve;
    });
    const adapter = createReactWidgetAdapter({
      shellState,
      session,
      services: {
        id: definition.id,
        kind: 'widget',
        storage: coordinator.forDefinition(definition.id),
        internalStorage: coordinator.forDefinitionInternal(definition.id),
        signal: new AbortController().signal,
      },
    });
    const runtime = createWidgetRuntime({
      registry: [
        {
          id: definition.id,
          kind: 'widget',
          contractMajor: 1,
          load: () => pending,
        },
      ],
      adapter,
      reportError,
    });
    const appRuntime = createAppRuntime({ registry: [], adapters: [], reportError });
    render(
      <MfeHostProvider
        value={{
          runtime: appRuntime,
          shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: runtime,
          session,
        }}
      >
        <Suspense fallback={<p>loading widget</p>}>
          <Panel label="ready" />
        </Suspense>
      </MfeHostProvider>,
    );
    expect(screen.getByText('loading widget')).toBeTruthy();
    act(() => release(definition));
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('ready'));
    coordinator.dispose();
    shellState.dispose();
  });

  it('mounts through the neutral runtime and delivers the latest committed callback', async () => {
    const counters: DefinitionCounters = { inputParse: 0, render: 0 };
    const definition = makeDefinition(counters);
    const reportError = vi.fn();
    const environment = mountEnvironment(definition, reportError);
    const first = vi.fn();
    const second = vi.fn();
    const view = render(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <StrictMode>
          <Panel label="ready" onSelected={first} />
        </StrictMode>
      </MfeHostProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('ready'));
    const committedRenderCount = counters.render;
    const committedInputParseCount = counters.inputParse;
    fireEvent.click(screen.getByRole('button'));
    expect(first).toHaveBeenCalledWith({ id: 'ready' });

    view.rerender(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <StrictMode>
          <Panel label="ready" onSelected={second} />
        </StrictMode>
      </MfeHostProvider>,
    );
    await act(async () => {});
    expect(counters.render).toBe(committedRenderCount);
    expect(counters.inputParse).toBe(committedInputParseCount);
    fireEvent.click(screen.getByRole('button'));
    expect(second).toHaveBeenCalledWith({ id: 'ready' });
    expect(first).toHaveBeenCalledTimes(1);

    view.unmount();
    environment.dispose();
  });

  it('retains the last valid render when an input update is rejected', async () => {
    const definition = makeDefinition();
    const reportError = vi.fn();
    const environment = mountEnvironment(definition, reportError);
    const view = render(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <Panel label="ready" />
      </MfeHostProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('ready'));

    view.rerender(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <Panel label={3} />
      </MfeHostProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('ready');
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'contract/input-mismatch', direction: 'input' }),
    );

    view.unmount();
    environment.dispose();
  });

  it('retires the mount Query cache before a shell session publishes', async () => {
    const reportError = vi.fn();
    const definition = makeQueryDefinition();
    const environment = mountEnvironment(definition, reportError);
    const view = render(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <Panel label="query" />
      </MfeHostProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('query-value').textContent).toBe('old'));
    const clientIdentity = screen.getByTestId('query-value').getAttribute('data-query-client');

    await act(async () => {
      environment.session.update({
        user: { id: 'new-user', name: 'New User' },
        groups: [],
        theme: 'light',
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('query-value').textContent).toBe('new'));
    expect(screen.getByTestId('query-value').getAttribute('data-query-client')).toBe(
      clientIdentity,
    );

    view.unmount();
    environment.dispose();
  });

  it('validates provider emits and drops invalid consumer payloads', async () => {
    const definition = makeInvalidEventDefinition();
    const reportError = vi.fn();
    const environment = mountEnvironment(definition, reportError);
    const handler = vi.fn();
    const InvalidConsumer = lazyWidget('panel', {
      contract: {
        inputs: definition.inputs,
        events: {
          selected: schema<{ readonly id: number }>(
            (value): value is { readonly id: number } =>
              typeof value === 'object' &&
              value !== null &&
              typeof (value as { id?: unknown }).id === 'number',
          ),
        },
      },
    });
    render(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <InvalidConsumer label="event" onSelected={handler} />
      </MfeHostProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('emit'));
    fireEvent.click(screen.getByRole('button'));
    expect(providerEmitThrew).toBe(true);
    expect(handler).toHaveBeenCalledTimes(0);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'contract/event-mismatch', direction: 'event' }),
    );
    environment.dispose();
  });

  it('isolates same-ID Query clients and signals while sharing definition storage', async () => {
    const definition = makeIdentityDefinition();
    const reportError = vi.fn();
    const environment = mountEnvironment(definition, reportError);
    const view = render(
      <MfeHostProvider
        value={{
          runtime: environment.appRuntime,
          shellState: environment.shellState,
          createNavigation: () => {
            throw new Error('Widget has no navigation.');
          },
          widgetRuntime: environment.runtime,
          session: environment.session,
        }}
      >
        <Panel label="one" />
        <Panel label="two" />
      </MfeHostProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId('widget-identity')).toHaveLength(2));
    const identities = screen
      .getAllByTestId('widget-identity')
      .map((element) => element.textContent?.split(':').map(Number));
    expect(new Set(identities.map((value) => value?.[0])).size).toBe(2);
    expect(new Set(identities.map((value) => value?.[1])).size).toBe(2);
    expect(new Set(identities.map((value) => value?.[2])).size).toBe(1);

    view.unmount();
    environment.dispose();
  });
});
