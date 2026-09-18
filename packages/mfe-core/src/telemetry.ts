/** Provider-neutral span handle owned by a mounted definition. */
export interface Span {
  end(): void;
}

/** Provider-neutral tracing facade; implementations own context propagation. */
export interface Tracer {
  startSpan(name: string): Span;
  startActiveSpan<T>(name: string, callback: (span: Span) => T): T;
}
