import { createWidgetRuntime } from '@company/mfe-host';
import type { WidgetRuntime } from '@company/mfe-host';
import type { ShellSessionBoundary } from '@company/mfe-host';
import type { InternalStorageCoordinator } from '@company/mfe-host/internal';
import { createWidget, lazyWidget, useStoredState } from '@company/mfe-react';
import { createReactWidgetAdapter } from '@company/mfe-react/internal';
import type { ShellStateStore } from '@company/mfe-core';
import { z } from 'zod';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@tecton/react/components/button';

/** Production/profiling scale: two App mounts, fifty Widget mounts, 100 keys. */
export const SCALING_WIDGET_COUNT = 50;
export const WIDGET_SCALING_STORAGE_KEY_COUNT = 100;
const inputSchema = z.object({ value: z.number() });
const storageNumberSchema = z.number();
const emptyEvents = {} as const;

export const scalingWidgetIds = Object.freeze(
  Array.from({ length: SCALING_WIDGET_COUNT }, (_, index) => `widget-scaling-${index + 1}`),
);
export const widgetScalingCommitCounts = new Map<string, number>();
export function resetWidgetScalingCommitCounts() {
  widgetScalingCommitCounts.clear();
}
function ScaleWidgetBody({ id, value }: { id: string; value: number }) {
  const index = Number(id.slice('widget-scaling-'.length)) - 1;
  const outputRef = useRef<HTMLOutputElement>(null);
  const [first, setFirst] = useStoredState(`widget-storage-key-${index * 2}`, storageNumberSchema, {
    defaultValue: 0,
  });
  const [second] = useStoredState(`widget-storage-key-${index * 2 + 1}`, storageNumberSchema, {
    defaultValue: 0,
  });
  useLayoutEffect(() => {
    const commits = (widgetScalingCommitCounts.get(id) ?? 0) + 1;
    widgetScalingCommitCounts.set(id, commits);
    outputRef.current?.setAttribute('data-commits', String(commits));
  });
  return (
    <output
      ref={outputRef}
      data-widget-scaling-id={id}
      data-storage-keys={`widget-storage-key-${index * 2},widget-storage-key-${index * 2 + 1}`}
      data-value={value}
      data-commits={widgetScalingCommitCounts.get(id) ?? 0}
      data-key-values={`${first},${second}`}
    >
      <Button variant="outline" onPress={() => setFirst(first + 1)}>
        {id} · {first},{second}
      </Button>
    </output>
  );
}

export const widgetScalingDefinitions = Object.freeze(
  scalingWidgetIds.map((id) =>
    createWidget({
      id,
      version: '0.0.0',
      inputs: inputSchema,
      events: emptyEvents,
      render: (props) => <ScaleWidgetBody id={id} value={props.inputs.value} />,
    }),
  ),
);

/** Real lazyWidget consumers used by the scaling shell route. */
export const widgetScalingLazyWidgets = Object.freeze(
  scalingWidgetIds.map((id) =>
    lazyWidget(id, { contract: { inputs: inputSchema, events: emptyEvents } }),
  ),
);

export function WidgetScalingGrid({
  value = 0,
  valueForWidget,
}: {
  readonly value?: number;
  readonly valueForWidget?: (index: number) => number;
}) {
  return (
    <div
      data-testid="widget-scaling-grid"
      data-widget-count={SCALING_WIDGET_COUNT}
      className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2"
    >
      {widgetScalingLazyWidgets.map((Widget, index) => (
        <div key={scalingWidgetIds[index]} className="min-w-0">
          <Widget value={valueForWidget?.(index) ?? value} />
        </div>
      ))}
    </div>
  );
}

export function createWidgetScalingRuntime(
  shellState: ShellStateStore,
  coordinator: InternalStorageCoordinator,
  session: ShellSessionBoundary,
): { readonly runtime: WidgetRuntime; readonly dispose: () => void } {
  const runtime = createWidgetRuntime({
    registry: widgetScalingDefinitions.map((definition) => ({
      id: definition.id,
      kind: 'widget' as const,
      contractMajor: 1,
      load: () => Promise.resolve(definition),
    })),
    reportError: (error) => console.error(error),
    adapter: {
      create: (options) =>
        createReactWidgetAdapter({
          shellState,
          session,
          services: {
            id: options.id,
            kind: 'widget',
            storage: coordinator.forDefinition(options.id),
            internalStorage: coordinator.forDefinitionInternal(options.id),
            signal: new AbortController().signal,
          },
        }).create(options),
    },
  });
  return { runtime, dispose: () => {} };
}
