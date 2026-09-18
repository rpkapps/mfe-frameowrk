const errorCodes = [
  'registry/invalid-descriptor',
  'registry/duplicate-id',
  'contract/unsupported-major',
  'contract/input-mismatch',
  'contract/event-mismatch',
  'config/missing',
  'config/unreachable',
  'config/invalid',
  'load/manifest-failure',
  'load/entry-failure',
  'load/share-conflict',
  'load/timeout',
  'mount/failure',
  'mount/timeout',
  'command/duplicate-name',
  'app/invalid-base-path',
  'app/invalid-router',
  'storage/failure',
  'auth/undeclared-origin',
  'dispose/failure',
  'dispose/timeout',
] as const;

/** Adding a code is a deliberate public contract change. */
export type MfeErrorCode = (typeof errorCodes)[number];

export interface MfeError extends Error {
  readonly code: MfeErrorCode;
  readonly id: string;
  readonly definitionVersion?: string;
  readonly operation: string;
  readonly direction?: 'input' | 'event';
  readonly path?: readonly (string | number)[];
  readonly cause?: unknown;
}

/** Diagnostic text describes the condition; never include raw credentials or payloads. */
export interface MfeErrorOptions {
  readonly code: MfeErrorCode;
  readonly id: string;
  readonly definitionVersion?: string;
  readonly operation: string;
  readonly resource: string;
  readonly expected: string;
  readonly observed: string;
  readonly owner: string;
  readonly repair: string;
  readonly direction?: 'input' | 'event';
  readonly path?: readonly (string | number)[];
  readonly cause?: unknown;
}

/** Creates one actionable error shape shared by adapters and neutral orchestration. */
export function createMfeError(options: MfeErrorOptions): MfeError {
  const version = options.definitionVersion ? ` (${options.definitionVersion})` : '';
  const error = new Error(
    `${options.id}${version}: ${options.operation} failed for ${options.resource}. ` +
      `Expected ${options.expected}; observed ${options.observed}. ` +
      `Owned by ${options.owner}. ${options.repair}`,
    { cause: options.cause },
  );
  error.name = 'MfeError';
  return Object.assign(error, {
    code: options.code,
    id: options.id,
    operation: options.operation,
    ...(options.definitionVersion === undefined
      ? {}
      : { definitionVersion: options.definitionVersion }),
    ...(options.direction === undefined ? {} : { direction: options.direction }),
    ...(options.path === undefined ? {} : { path: Object.freeze([...options.path]) }),
  });
}

const errorCodeSet: ReadonlySet<string> = new Set(errorCodes);

/** Structural recognition also accepts errors created by another compatible bundle. */
export function isMfeError(value: unknown): value is MfeError {
  return (
    value instanceof Error &&
    'code' in value &&
    typeof value.code === 'string' &&
    errorCodeSet.has(value.code) &&
    'id' in value &&
    typeof value.id === 'string' &&
    'operation' in value &&
    typeof value.operation === 'string' &&
    (!('definitionVersion' in value) || typeof value.definitionVersion === 'string') &&
    (!('direction' in value) || value.direction === 'input' || value.direction === 'event') &&
    (!('path' in value) ||
      (Array.isArray(value.path) &&
        value.path.every((part: unknown) => typeof part === 'string' || typeof part === 'number')))
  );
}
