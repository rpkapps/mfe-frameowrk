import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, createElement, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createMfeError, createWidgetChannel, createWidgetInputRuntime } from '@company/mfe-core';
import type { MfeError, WidgetContract, WidgetEventSchemas, WidgetSchema } from '@company/mfe-core';
import type { MountAttempt, WidgetAdapterOptions, WidgetDriver } from '@company/mfe-host';
import { ShellStateProvider } from '@company/mfe-react/internal/shell-state-context';
import { MountServicesProvider } from '@company/mfe-react/internal/mount-services-context';
import { retireQueryClientNow } from './query-session';
import type {
  MfeReactMountEnvironment,
  MfeMountServices,
} from '@company/mfe-react/internal/mount-services-context';
import type { WidgetDefinition } from './widget-definition';

interface HandlerRef {
  current: Readonly<Record<string, unknown>>;
}

interface RenderTreeProps {
  readonly definition: WidgetDefinition;
  readonly inputRuntime: ReturnType<typeof createWidgetInputRuntime>;
  readonly channel: ReturnType<typeof createWidgetChannel<WidgetEventSchemas>>;
  readonly handlers: HandlerRef;
  readonly contract: WidgetContract | undefined;
  readonly services: MfeMountServices;
  readonly shellState: MfeReactMountEnvironment['shellState'];
  readonly queryClient: QueryClient;
  readonly reportError: (error: MfeError) => void;
}

class WidgetErrorBoundary extends Component<
  { readonly attempt: MountAttempt; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: true } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.attempt.fail(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function consumerContractError(
  id: string,
  version: string | undefined,
  operation: string,
  observed: string,
  path: readonly string[],
): MfeError {
  return createMfeError({
    id,
    ...(version === undefined ? {} : { definitionVersion: version }),
    code: 'contract/event-mismatch',
    operation,
    resource: 'Widget consumer event contract',
    expected: 'event schemas that are declared by the provider',
    observed,
    owner: 'the Widget consumer',
    repair: 'Remove the unsupported event or update the provider contract.',
    direction: 'event',
    path,
  });
}

function reportQueryFailure(
  options: WidgetAdapterOptions,
  operation: string,
  cause: unknown,
): void {
  try {
    options.reportError(
      createMfeError({
        id: options.id,
        code: 'mount/failure',
        operation,
        resource: 'mount-owned QueryClient',
        expected: 'Query lifecycle work to settle without an adapter failure',
        observed: 'a Query operation rejected',
        owner: 'the Widget Query integration',
        repair: 'Inspect the query error and retry the affected operation.',
        cause,
      }),
    );
  } catch {
    // Diagnostics cannot alter Query's native state.
  }
}

function isSchema(value: unknown): value is WidgetSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof value.safeParse === 'function'
  );
}

function subscribeEvents(props: RenderTreeProps): Array<{ unsubscribe: () => void }> {
  const subscriptions: Array<{ unsubscribe: () => void }> = [];
  const providerNames = new Set(Object.keys(props.definition.events));
  const consumerEvents = props.contract?.events;
  if (consumerEvents !== undefined) {
    for (const name of Object.keys(consumerEvents)) {
      if (!providerNames.has(name)) {
        try {
          props.reportError(
            consumerContractError(
              props.definition.id,
              props.definition.version,
              'bind Widget consumer contract',
              `the provider does not declare event ${name}`,
              [name],
            ),
          );
        } catch {
          // A diagnostics sink cannot prevent other event subscriptions.
        }
      }
    }
  }

  for (const name of providerNames) {
    const consumerSchema = consumerEvents?.[name];
    if (consumerSchema !== undefined && !isSchema(consumerSchema)) {
      try {
        props.reportError(
          consumerContractError(
            props.definition.id,
            props.definition.version,
            `bind Widget consumer event ${name}`,
            'the consumer schema is not a Zod schema',
            [name],
          ),
        );
      } catch {
        // A diagnostics sink cannot prevent other event subscriptions.
      }
      continue;
    }
    const handlerName = `on${name[0]!.toUpperCase()}${name.slice(1)}`;
    const listener = (payload: unknown) => {
      const handler = props.handlers.current[handlerName];
      if (typeof handler === 'function') {
        const callback = handler as (value: unknown) => void;
        callback(payload);
      }
    };
    subscriptions.push(
      consumerSchema === undefined
        ? props.channel.subscribe(name, listener)
        : props.channel.subscribe(name, listener, consumerSchema),
    );
  }
  return subscriptions;
}

function WidgetSurface(props: RenderTreeProps): ReactNode {
  const { channel, contract, definition, reportError } = props;
  const subscriptions = useRef<Array<{ unsubscribe: () => void }>>([]);
  useEffect(() => {
    subscriptions.current = subscribeEvents(props);
    return () => {
      for (const subscription of subscriptions.current) subscription.unsubscribe();
      subscriptions.current = [];
    };
    // Event delivery uses stable channel and handler refs; input renders do not
    // own subscriptions and must not resubscribe the remote channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handler refs keep callback-only updates out of subscription lifecycle.
  }, [channel, contract, definition, reportError]);

  const snapshot = props.inputRuntime.getSnapshot();
  if (snapshot === undefined) return null;
  const DefinitionComponent = props.definition.render;
  const content = createElement(DefinitionComponent, {
    inputs: snapshot,
    emit: (name: string, payload: unknown) => props.channel.emit(name, payload),
  });

  return (
    <ShellStateProvider store={props.shellState}>
      <QueryClientProvider client={props.queryClient}>
        <MountServicesProvider services={props.services}>{content}</MountServicesProvider>
      </QueryClientProvider>
    </ShellStateProvider>
  );
}

export function createReactWidgetAdapter(environment: MfeReactMountEnvironment) {
  return {
    create(options: WidgetAdapterOptions): WidgetDriver {
      if (!isWidgetDefinition(options.definition)) {
        throw createMfeError({
          id: options.id,
          code: 'registry/invalid-descriptor',
          operation: 'create Widget adapter',
          resource: 'Widget definition',
          expected: 'a React Widget definition with inputs, events, and render',
          observed: 'an incompatible definition',
          owner: 'the Widget adapter',
          repair: 'Export the definition returned by createWidget().',
        });
      }

      const definition = options.definition;
      const queryClient = new QueryClient();
      const inputRuntime = createWidgetInputRuntime({
        id: definition.id,
        schema: definition.inputs,
        ...(definition.version === undefined ? {} : { version: definition.version }),
        reportError: options.reportError,
      });
      const channel = createWidgetChannel({
        id: definition.id,
        events: definition.events,
        ...(definition.version === undefined ? {} : { version: definition.version }),
        reportError: options.reportError,
      });
      const handlers: HandlerRef = { current: {} };
      let latestInputs: unknown = {};
      let latestContract = options.contract;
      let root: Root | undefined;
      let mounted = false;
      let disposed = false;
      let activeServices: MfeMountServices | undefined;
      let activeAttempt: MountAttempt | undefined;
      let inputAttempted = false;
      let sessionEpoch = 0;
      let retiredEpoch = 0;
      const unregisterQueryRetirer = environment.session.registerQueryRetirer(() => {
        sessionEpoch += 1;
        void retireQueryClientNow(queryClient).catch((cause: unknown) => {
          reportQueryFailure(options, 'retire Widget queries for shell session update', cause);
        });
      });
      const unsubscribeSession = environment.shellState.subscribe(() => {
        if (retiredEpoch === sessionEpoch) return;
        const epoch = sessionEpoch;
        queueMicrotask(() => {
          if (disposed || epoch !== sessionEpoch) return;
          // ShellStateStore publishes before React's external-store consumers
          // commit. Flush that pending commit before invoking Query callbacks.
          flushSync(() => {});
          if (disposed || epoch !== sessionEpoch) return;
          retiredEpoch = epoch;
          void queryClient.refetchQueries({ type: 'active' }).catch((cause: unknown) => {
            reportQueryFailure(options, 'refetch Widget queries after shell session update', cause);
          });
        });
      });

      const renderTree = (attempt: MountAttempt): void => {
        const services = activeServices;
        if (services === undefined || root === undefined) return;
        const props: RenderTreeProps = {
          definition,
          inputRuntime,
          channel,
          handlers,
          contract: latestContract,
          services,
          shellState: environment.shellState,
          queryClient,
          reportError: options.reportError,
        };
        root.render(
          <WidgetErrorBoundary attempt={attempt}>
            <WidgetSurface {...props} />
          </WidgetErrorBoundary>,
        );
      };

      return {
        update(
          nextInputs: unknown,
          nextHandlers: Readonly<Record<string, unknown>>,
          contract?: WidgetContract,
        ) {
          latestInputs = nextInputs;
          handlers.current = nextHandlers;
          latestContract = contract;
          if (!mounted || disposed) return;
          const result = inputRuntime.update(nextInputs);
          if (!result.accepted || !result.changed) return;
          const attempt = activeAttempt;
          if (attempt === undefined) return;
          // The current attempt owns the root; it is still current while mounted.
          renderTree(attempt);
        },

        mount(attempt: MountAttempt): void {
          if (disposed) return;
          if (!inputAttempted) {
            inputAttempted = true;
            const result = inputRuntime.validateInitial(latestInputs);
            if (!result.ok) throw result.error;
          } else if (inputRuntime.getSnapshot() === undefined) {
            const result = inputRuntime.retry(latestInputs);
            if (!result.ok) throw result.error;
          }

          activeServices = Object.freeze({
            ...environment.services,
            id: options.id,
            kind: 'widget' as const,
            ...(options.publicStorage === undefined ? {} : { storage: options.publicStorage }),
            ...(options.storage === undefined ? {} : { internalStorage: options.storage }),
            signal: attempt.mountSignal,
          });
          activeAttempt = attempt;
          attempt.commit(() => {
            const element = options.target.ownerDocument.createElement('div');
            options.target.append(element);
            const ownedRoot = createRoot(element, { onUncaughtError: attempt.fail });
            root = ownedRoot;
            attempt.onDetach(() => {
              element.remove();
              mounted = false;
              activeServices = undefined;
              activeAttempt = undefined;
            });
            attempt.onCleanup(async () => {
              ownedRoot.unmount();
              if (root === ownedRoot) root = undefined;
              mounted = false;
              activeServices = undefined;
              activeAttempt = undefined;
              await queryClient.cancelQueries();
              queryClient.clear();
            });
            mounted = true;
            renderTree(attempt);
          });
        },

        async dispose(): Promise<void> {
          if (disposed) return;
          disposed = true;
          root?.unmount();
          root = undefined;
          mounted = false;
          activeServices = undefined;
          activeAttempt = undefined;
          channel.dispose();
          inputRuntime.dispose();
          unregisterQueryRetirer();
          unsubscribeSession();
          await queryClient.cancelQueries();
          queryClient.clear();
        },
      };
    },
  };
}

function isWidgetDefinition(value: unknown): value is WidgetDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === 'widget' &&
    typeof record.id === 'string' &&
    typeof record.render === 'function' &&
    typeof record.inputs === 'object' &&
    record.inputs !== null &&
    typeof record.events === 'object' &&
    record.events !== null
  );
}
