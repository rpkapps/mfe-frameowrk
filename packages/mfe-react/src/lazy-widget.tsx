import type { ComponentType } from 'react';
import type { WidgetContract, WidgetSchema } from '@company/mfe-core';
import { WidgetMount } from './widget-mount';
import type { WidgetMountProps } from './widget-mount';

type InputProps<C extends WidgetContract | undefined> = C extends WidgetContract
  ? C['inputs'] extends WidgetSchema<unknown, infer Input>
    ? Input
    : Record<string, unknown>
  : Record<string, unknown>;

type EventProps<C extends WidgetContract | undefined> = C extends WidgetContract
  ? {
      [Name in keyof C['events'] as `on${Capitalize<Name & string>}`]?: (
        payload: C['events'][Name] extends WidgetSchema<infer Output, unknown> ? Output : unknown,
      ) => void;
    }
  : Record<string, unknown>;

export type LazyWidgetProps<C extends WidgetContract | undefined> = InputProps<C> &
  EventProps<C> & {
    readonly fallback?: WidgetMountProps['fallback'];
  };

function eventPropNames(contract: WidgetContract | undefined): ReadonlySet<string> {
  if (contract === undefined) return new Set();
  return new Set(
    Object.keys(contract.events).map((name) => `on${name[0]!.toUpperCase()}${name.slice(1)}`),
  );
}

export function lazyWidget<C extends WidgetContract | undefined = undefined>(
  id: string,
  options?: { readonly contract?: C },
): ComponentType<LazyWidgetProps<C>> {
  const contract = options?.contract;
  const knownEvents = eventPropNames(contract);

  function LazyWidget(props: LazyWidgetProps<C>) {
    const values: Record<string, unknown> = {};
    const handlers: Record<string, unknown> = {};
    const propsRecord: Record<string, unknown> = Object.fromEntries(Object.entries(props));

    for (const key of Object.keys(propsRecord)) {
      const value = propsRecord[key];
      if (key === 'fallback') continue;
      if (knownEvents.has(key) || (contract === undefined && /^on[A-Z]/.test(key))) {
        handlers[key] = value;
      } else {
        values[key] = value;
      }
    }

    const mountProps: WidgetMountProps = {
      id,
      inputs: values,
      handlers,
      ...(contract === undefined ? {} : { contract }),
      ...(props.fallback === undefined ? {} : { fallback: props.fallback }),
    };
    return <WidgetMount {...mountProps} />;
  }

  LazyWidget.displayName = `LazyWidget(${id})`;
  return LazyWidget;
}
