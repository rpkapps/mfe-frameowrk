import type { MfeError } from './error';

export type MountState =
  | { readonly status: 'pending'; readonly attempt: number }
  | { readonly status: 'mounted' }
  | { readonly status: 'error'; readonly error: MfeError }
  | { readonly status: 'disposed' };

/** One handle owns one mount, its attempts, subscriptions, and all teardown. */
export interface MountHandle {
  readonly state: MountState;
  /** Cached immutable snapshot; unchanged state retains its reference. */
  readonly getState: () => MountState;
  /** Notifications belong to this mount. The returned unsubscribe is idempotent. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Explicitly retries a failed attempt; rejects if that attempt fails. */
  readonly retry: () => Promise<void>;
  /** Detaches synchronously; every call returns the same cleanup promise. */
  readonly dispose: () => Promise<void>;
}
