// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StorageSchema } from '@company/mfe-core';
import { createInternalStorageCoordinator } from '@company/mfe-host/internal';
import type { MfeMountServices } from './mount-services-context';
import {
  MountServicesProvider,
  useBasePath,
  useMfeSignal,
  useMfeStorage,
  useStoredState,
} from './mount-services-context';

afterEach(cleanup);

const numberSchema = {
  parse: (value: unknown) => {
    if (typeof value !== 'number') throw new Error('number');
    return value;
  },
} as StorageSchema<number>;

function Probe() {
  const [value, setValue] = useStoredState('count', numberSchema, { defaultValue: 1 });
  useMfeStorage('local');
  const signal = useMfeSignal();
  const basePath = useBasePath();
  return (
    <button
      onClick={() => setValue((current) => current + 1)}
    >{`${value}:reports:${basePath}:${signal.aborted}`}</button>
  );
}

describe('mount service hooks', () => {
  it('shares coordinator handles and supports functional subscribed updates', () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    const coordinator = createInternalStorageCoordinator({
      local: window.localStorage,
      session: window.sessionStorage,
      generation: 'g1',
    });
    const services: MfeMountServices = {
      id: 'reports',
      kind: 'app',
      storage: coordinator.forDefinition('reports'),
      internalStorage: coordinator.forDefinitionInternal('reports'),
      signal: new AbortController().signal,
      basePath: '/reports',
    };
    render(
      <MountServicesProvider services={services}>
        <Probe />
      </MountServicesProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('1:reports:/reports:false');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button').textContent).toBe('2:reports:/reports:false');
  });
});
