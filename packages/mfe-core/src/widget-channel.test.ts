import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { createWidgetChannel } from '@company/mfe-core';

describe('Widget event channels', () => {
  const events = { changed: z.object({ id: z.string(), added: z.string().optional() }) };

  it('validates provider emits, reports failures, and throws at the call site', () => {
    const report = vi.fn();
    const channel = createWidgetChannel({
      id: 'panel',
      version: '1.4.0',
      events,
      reportError: report,
    });
    expect(() => {
      // @ts-expect-error Provider payloads are inferred from the runtime event schema.
      channel.emit('changed', { id: 1 });
    }).toThrow();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'panel', definitionVersion: '1.4.0', direction: 'event' }),
    );
  });

  it('uses tolerant consumer schemas and latest handlers without resubscribing', () => {
    const report = vi.fn();
    const channel = createWidgetChannel({ id: 'panel', events, reportError: report });
    const first = vi.fn();
    const second = vi.fn();
    const subscription = channel.subscribe('changed', first, z.object({ id: z.string() }));
    channel.emit('changed', { id: 'a', added: 'new' });
    expect(first).toHaveBeenCalledWith({ id: 'a' });
    subscription.update(second);
    channel.emit('changed', { id: 'b', added: 'new' });
    expect(second).toHaveBeenCalledWith({ id: 'b' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();

    channel.dispose();
    channel.emit('changed', { id: 'c' });
    expect(second).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('drops an invalid consumer event and reports it', () => {
    const report = vi.fn();
    const channel = createWidgetChannel({ id: 'panel', events, reportError: report });
    const listener = vi.fn();
    channel.subscribe('changed', listener, z.object({ id: z.number() }));
    channel.emit('changed', { id: 'a' });
    expect(listener).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'panel',
        direction: 'event',
        operation: 'receive Widget event changed',
      }),
    );
  });

  it('fences delivery when consumer validation disposes the owned channel', () => {
    const listener = vi.fn();
    const consumerSchema = z.object({ id: z.string() }).transform((value) => {
      channel.dispose();
      return value;
    });
    const channel = createWidgetChannel({ id: 'panel', events });
    channel.subscribe('changed', listener, consumerSchema);
    channel.emit('changed', { id: 'a' });
    expect(listener).not.toHaveBeenCalled();
  });
});
