import { createMemoryHistory } from '@tanstack/history';
import { createRootRouteWithContext, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './index';
import type { AppRouterOptions, MfeRouterContext } from './index';

describe('App definitions before activation', () => {
  it('retains identity and options without constructing or mounting a router', () => {
    const router = vi.fn(({ basePath, context }: AppRouterOptions) =>
      createRouter({
        routeTree: createRootRouteWithContext<MfeRouterContext>()(),
        basepath: basePath,
        context,
        history: createMemoryHistory(),
      }),
    );

    const definition = createApp({
      id: 'operations',
      version: '2.1.0',
      router,
      breadcrumbs: false,
    });

    expect(definition.id).toBe('operations');
    expect(definition.kind).toBe('app');
    expect(definition.version).toBe('2.1.0');
    expect(definition.breadcrumbs).toBe(false);
    expect(definition.router).toBe(router);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(router).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('rejects unusable definition identity %j with an actionable error', (id) => {
    expect(() =>
      createApp({
        id,
        router: () => {
          throw new Error('Router construction must not run during definition.');
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: 'registry/invalid-descriptor', id, operation: 'define App' }),
    );
  });
});
