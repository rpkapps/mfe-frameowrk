import type { z } from 'zod';

import { createMfeError } from './error';
import { findJsonValidationIssue, freezeJsonValue } from './json-validation';
import type { MfeError } from './error';
import type {
  WidgetContractAttribution,
  WidgetEventSchemas,
  WidgetSchema,
} from './widget-contract';

export interface WidgetChannelOptions<
  Events extends WidgetEventSchemas,
> extends WidgetContractAttribution {
  readonly events: Events;
  readonly reportError?: (error: MfeError) => void;
}

export interface WidgetEventSubscription<T> {
  readonly update: (listener: (payload: T) => void) => void;
  readonly unsubscribe: () => void;
}

export interface WidgetChannel<Events extends WidgetEventSchemas> {
  readonly emit: <Name extends keyof Events & string>(
    name: Name,
    payload: z.input<Events[Name]>,
  ) => void;
  readonly subscribe: {
    <Name extends keyof Events & string>(
      name: Name,
      listener: (payload: z.output<Events[Name]>) => void,
    ): WidgetEventSubscription<z.output<Events[Name]>>;
    <Name extends keyof Events & string, Consumer extends WidgetSchema>(
      name: Name,
      listener: (payload: z.output<Consumer>) => void,
      consumerSchema: Consumer,
    ): WidgetEventSubscription<z.output<Consumer>>;
  };
  readonly dispose: () => void;
}

function eventError(
  options: WidgetChannelOptions<WidgetEventSchemas>,
  direction: 'input' | 'event',
  operation: string,
  path: readonly (string | number)[],
  expected: string,
  observed: string,
  owner: 'provider' | 'consumer',
  cause?: unknown,
): MfeError {
  return createMfeError({
    id: options.id,
    ...(options.version === undefined ? {} : { definitionVersion: options.version }),
    code: 'contract/event-mismatch',
    operation,
    resource: 'Widget event payload',
    expected,
    observed,
    owner: owner === 'provider' ? 'the Widget provider' : 'the Widget consumer',
    repair:
      owner === 'provider'
        ? 'Emit a payload matching the declared event schema.'
        : 'Update the consumer event schema or investigate the provider contract.',
    direction,
    path,
    ...(cause === undefined ? {} : { cause }),
  });
}

function eventPath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return path.map((part) => (typeof part === 'number' ? part : String(part)));
}

function reportError(report: ((error: MfeError) => void) | undefined, error: MfeError): void {
  try {
    report?.(error);
  } catch {
    // Diagnostics are advisory and cannot alter event delivery semantics.
  }
}

function reportProviderFailure<Events extends WidgetEventSchemas>(
  options: WidgetChannelOptions<Events>,
  name: string,
  payload: unknown,
): unknown {
  const fail = (error: MfeError): never => {
    reportError(options.reportError, error);
    throw error;
  };
  const serialIssue = findJsonValidationIssue(payload);
  if (serialIssue) {
    return fail(
      eventError(
        options,
        'event',
        `emit Widget event ${name}`,
        eventPath(serialIssue.path),
        'a JSON-serializable payload',
        `a value containing ${serialIssue.reason}`,
        'provider',
      ),
    );
  }
  const schema = options.events[name];
  if (!schema) {
    return fail(
      eventError(
        options,
        'event',
        `emit Widget event ${name}`,
        [name],
        'an event declared by the provider',
        'an undeclared event',
        'provider',
      ),
    );
  }
  let result: ReturnType<typeof schema.safeParse>;
  try {
    result = schema.safeParse(payload);
  } catch (cause) {
    return fail(
      eventError(
        options,
        'event',
        `emit Widget event ${name}`,
        [name],
        'a payload accepted by the event schema',
        'schema evaluation threw',
        'provider',
        cause,
      ),
    );
  }
  if (!result.success) {
    const issue = result.error.issues[0];
    return fail(
      eventError(
        options,
        'event',
        `emit Widget event ${name}`,
        eventPath(issue?.path ?? []),
        'a payload accepted by the event schema',
        issue?.message ?? 'schema rejected the payload',
        'provider',
        result.error,
      ),
    );
  }
  const resultIssue = findJsonValidationIssue(result.data);
  if (resultIssue) {
    return fail(
      eventError(
        options,
        'event',
        `emit Widget event ${name}`,
        eventPath(resultIssue.path),
        'a JSON-serializable payload',
        `a schema result containing ${resultIssue.reason}`,
        'provider',
      ),
    );
  }
  return freezeJsonValue(result.data);
}

/** Creates one owned provider/consumer event channel. */
export function createWidgetChannel<Events extends WidgetEventSchemas>(
  options: WidgetChannelOptions<Events>,
): WidgetChannel<Events> {
  type Name = keyof Events & string;
  type Entry = {
    readonly name: Name;
    readonly consumerSchema?: WidgetSchema;
    listener: (payload: unknown) => void;
    active: boolean;
  };
  const subscriptions = new Set<Entry>();
  let disposed = false;

  const channel: WidgetChannel<Events> = {
    emit(name, payload) {
      if (disposed) return;
      const validated = reportProviderFailure(options, name, payload);
      // A provider schema may synchronously dispose its owner while parsing.
      if (disposed) return;
      for (const entry of [...subscriptions]) {
        if (!entry.active || entry.name !== name) continue;
        if (entry.consumerSchema) {
          let received: ReturnType<typeof entry.consumerSchema.safeParse>;
          try {
            received = entry.consumerSchema.safeParse(validated);
          } catch (cause) {
            reportError(
              options.reportError,
              eventError(
                options,
                'event',
                `receive Widget event ${name}`,
                [name],
                'a payload accepted by the consumer schema',
                'schema evaluation threw',
                'consumer',
                cause,
              ),
            );
            continue;
          }
          if (!received.success) {
            const issue = received.error.issues[0];
            reportError(
              options.reportError,
              eventError(
                options,
                'event',
                `receive Widget event ${name}`,
                eventPath(issue?.path ?? []),
                'a payload accepted by the consumer schema',
                issue?.message ?? 'schema rejected the payload',
                'consumer',
                received.error,
              ),
            );
            continue;
          }
          const serialIssue = findJsonValidationIssue(received.data);
          if (serialIssue) {
            reportError(
              options.reportError,
              eventError(
                options,
                'event',
                `receive Widget event ${name}`,
                eventPath(serialIssue.path),
                'a JSON-serializable payload',
                `a value containing ${serialIssue.reason}`,
                'consumer',
              ),
            );
            continue;
          }
          if (!disposed && entry.active) entry.listener(freezeJsonValue(received.data));
          continue;
        }
        if (!disposed && entry.active) entry.listener(validated);
      }
    },
    subscribe: ((
      name: Name,
      listener: (payload: unknown) => void,
      consumerSchema?: WidgetSchema,
    ) => {
      if (disposed) return { update: () => undefined, unsubscribe: () => undefined };
      const entry: Entry = {
        name,
        ...(consumerSchema === undefined ? {} : { consumerSchema }),
        listener,
        active: true,
      };
      subscriptions.add(entry);
      return {
        update(nextListener: (payload: unknown) => void) {
          if (entry.active && !disposed) entry.listener = nextListener;
        },
        unsubscribe() {
          if (!entry.active) return;
          entry.active = false;
          subscriptions.delete(entry);
        },
      };
    }) as WidgetChannel<Events>['subscribe'],
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of subscriptions) entry.active = false;
      subscriptions.clear();
    },
  };
  return channel;
}
