/** Native navigation may await presentation after disposal removes that tree. */
export function untilAttemptRetires(work: Promise<void>, signal: AbortSignal): Promise<void> {
  let onAbort = () => {};
  const retired = new Promise<void>((resolve) => {
    onAbort = resolve;
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  // Promise.race observes the original work even if retirement wins; late errors
  // cannot become unhandled or fail a subsequent attempt.
  return Promise.race([work, retired]).finally(() => signal.removeEventListener('abort', onAbort));
}
