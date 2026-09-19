import type { ReactNode } from 'react';
import { createMfeError } from '@company/mfe-core';
import type {
  WidgetContract,
  WidgetDescriptor,
  WidgetEventSchemas,
  WidgetSchema,
} from '@company/mfe-core';

export interface WidgetRenderProps<Inputs, Events extends WidgetEventSchemas> {
  readonly inputs: Inputs;
  readonly emit: <Name extends keyof Events & string>(
    name: Name,
    payload: Events[Name] extends WidgetSchema<unknown, infer Input> ? Input : unknown,
  ) => void;
}

export interface WidgetDefinition<
  I extends WidgetSchema = WidgetSchema,
  E extends WidgetEventSchemas = WidgetEventSchemas,
>
  extends WidgetDescriptor, WidgetContract<I, E> {
  readonly render: (
    props: WidgetRenderProps<I extends WidgetSchema<infer Output, unknown> ? Output : unknown, E>,
  ) => ReactNode;
}

function shapeKeys(schema: WidgetSchema): readonly string[] {
  const candidate = schema as WidgetSchema & {
    readonly shape?: Record<string, WidgetSchema> | (() => Record<string, WidgetSchema>);
  };
  const shape = typeof candidate.shape === 'function' ? candidate.shape() : candidate.shape;
  return shape === undefined ? [] : Object.keys(shape);
}

function validateNames(id: string, inputs: WidgetSchema, events: WidgetEventSchemas): void {
  const inputNames = shapeKeys(inputs);
  const reserved = inputNames.find(
    (name) => name === 'key' || name === 'ref' || name === 'fallback' || /^on[A-Z]/.test(name),
  );
  if (reserved !== undefined) {
    throw createMfeError({
      id,
      code: 'registry/invalid-descriptor',
      operation: 'define Widget',
      resource: `input ${reserved}`,
      expected: 'an input name that is not reserved for host controls or events',
      observed: reserved,
      owner: 'the Widget definition',
      repair: 'Rename the input field.',
    });
  }

  const handlers = new Map<string, string>();
  for (const name of Object.keys(events)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(name)) {
      throw createMfeError({
        id,
        code: 'registry/invalid-descriptor',
        operation: 'define Widget',
        resource: `event ${name}`,
        expected: 'a lower-camel-case event name',
        observed: name,
        owner: 'the Widget definition',
        repair: 'Rename the event.',
      });
    }
    const handler = `on${name[0]!.toUpperCase()}${name.slice(1)}`;
    const prior = handlers.get(handler);
    if (prior !== undefined || inputNames.includes(handler)) {
      throw createMfeError({
        id,
        code: 'registry/invalid-descriptor',
        operation: 'define Widget',
        resource: `event ${name}`,
        expected: 'a unique generated handler prop',
        observed:
          prior === undefined
            ? `${handler} collides with an input`
            : `${name} collides with ${prior}`,
        owner: 'the Widget definition',
        repair: 'Rename the event or input.',
      });
    }
    handlers.set(handler, name);
  }
}

export function createWidget<I extends WidgetSchema, E extends WidgetEventSchemas>(
  options: Omit<WidgetDefinition<I, E>, 'kind'>,
): WidgetDefinition<I, E> {
  if (options.id.trim() === '') {
    throw createMfeError({
      id: options.id,
      code: 'registry/invalid-descriptor',
      operation: 'define Widget',
      resource: 'id',
      expected: 'a non-empty public definition ID',
      observed: 'an empty or whitespace-only ID',
      owner: 'the Widget entry',
      repair: 'Set id to a stable, globally unique name in src/mfe.ts.',
    });
  }
  validateNames(options.id, options.inputs, options.events);
  return Object.freeze({ ...options, kind: 'widget' as const });
}
