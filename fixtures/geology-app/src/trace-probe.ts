import { useEffect } from 'react';
import type { Span, Tracer } from '@company/mfe-react';

type Probe = {
  tracer: Tracer;
  request(span: Span): Promise<void>;
};

export function useTraceProbe(name: string) {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('trace')) return;
    const probe = (window as Window & { __mfeTraceProbe?: Probe }).__mfeTraceProbe;
    if (!probe) return;
    const run = async (suffix: string) => {
      await Promise.resolve();
      await probe.tracer.startActiveSpan(`${name}.${suffix}`, async (span) => {
        await Promise.resolve();
        try {
          await probe.request(span);
        } finally {
          span.end();
        }
      });
    };
    void Promise.all([run('first'), run('second')]).catch((cause: unknown) =>
      window.reportError(cause),
    );
  }, [name]);
}
