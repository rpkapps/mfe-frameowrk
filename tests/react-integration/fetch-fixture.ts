/** Test-only generated fetch alias; it records requests without auth behavior. */
export interface FixtureRequest {
  readonly input: RequestInfo | URL;
  readonly init: RequestInit | undefined;
}

const requests: FixtureRequest[] = [];
let fetchImplementation: typeof globalThis.fetch = () =>
  Promise.resolve(
    new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    }),
  );

export function configureTestFetch(implementation: typeof globalThis.fetch): void {
  fetchImplementation = implementation;
}

export function getFixtureRequests(): readonly FixtureRequest[] {
  return requests;
}

export function resetTestFetch(): void {
  requests.length = 0;
  fetchImplementation = () =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
}

export const fetch: typeof globalThis.fetch = (input, init) => {
  requests.push({ input, init });
  return fetchImplementation(input, init);
};
