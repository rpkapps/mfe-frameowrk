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
export const GATE_THREE_WIDGET_COUNT = 50;
export const GATE_THREE_STORAGE_KEY_COUNT = 100;
const inputSchema = z.object({ value: z.number() });
const storageNumberSchema = z.number();
const emptyEvents = {} as const;

export const gateThreeWidgetIds = Object.freeze(
  Array.from({ length: GATE_THREE_WIDGET_COUNT }, (_, index) => `gate3-widget-${index + 1}`),
);
export const gateThreeCommitCounts = new Map<string, number>();
export function resetGateThreeCommitCounts() {
  gateThreeCommitCounts.clear();
}
function ScaleWidgetBody({ id, value }: { id: string; value: number }) {
  const index = Number(id.slice('gate3-widget-'.length)) - 1;
  const outputRef = useRef<HTMLOutputElement>(null);
  const [first, setFirst] = useStoredState(`gate3-key-${index * 2}`, storageNumberSchema, {
    defaultValue: 0,
  });
  const [second] = useStoredState(`gate3-key-${index * 2 + 1}`, storageNumberSchema, {
    defaultValue: 0,
  });
  useLayoutEffect(() => {
    const commits = (gateThreeCommitCounts.get(id) ?? 0) + 1;
    gateThreeCommitCounts.set(id, commits);
    outputRef.current?.setAttribute('data-commits', String(commits));
  });
  return (
    <output
      ref={outputRef}
      data-gate-three-widget={id}
      data-storage-keys={`gate3-key-${index * 2},gate3-key-${index * 2 + 1}`}
      data-value={value}
      data-commits={gateThreeCommitCounts.get(id) ?? 0}
      data-key-values={`${first},${second}`}
    >
      <Button variant="outline" onPress={() => setFirst(first + 1)}>
        {id} · {first},{second}
      </Button>
    </output>
  );
}

export const gateThreeDefinitions = Object.freeze(
  gateThreeWidgetIds.map((id) =>
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
export const gateThreeLazyWidgets = Object.freeze(
  gateThreeWidgetIds.map((id) =>
    lazyWidget(id, { contract: { inputs: inputSchema, events: emptyEvents } }),
  ),
);

export function GateThreeWidgetGrid({
  value = 0,
  valueForWidget,
}: {
  readonly value?: number;
  readonly valueForWidget?: (index: number) => number;
}) {
  return (
    <div data-testid="gate-three-widget-grid" data-widget-count={GATE_THREE_WIDGET_COUNT}>
      {gateThreeLazyWidgets.map((Widget, index) => (
        <Widget key={gateThreeWidgetIds[index]} value={valueForWidget?.(index) ?? value} />
      ))}
    </div>
  );
}

export function createGateThreeWidgetRuntime(
  shellState: ShellStateStore,
  coordinator: InternalStorageCoordinator,
  session: ShellSessionBoundary,
): { readonly runtime: WidgetRuntime; readonly dispose: () => void } {
  const runtime = createWidgetRuntime({
    registry: gateThreeDefinitions.map((definition) => ({
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
