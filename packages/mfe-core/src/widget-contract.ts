import type { z } from 'zod';

import { createMfeError } from './error';
import { findJsonValidationIssue, freezeJsonValue } from './json-validation';
import type { MfeError } from './error';

export type WidgetSchema<Output = unknown, Input = unknown> = z.ZodType<Output, Input>;
export type WidgetEventSchemas = Readonly<Record<string, WidgetSchema>>;

/** Runtime contract shared by a Widget provider and an optional consumer. */
export interface WidgetContract<
  Inputs extends WidgetSchema = WidgetSchema,
  Events extends WidgetEventSchemas = WidgetEventSchemas,
> {
  readonly inputs: Inputs;
  readonly events: Events;
}

export type WidgetInputsOf<Contract extends WidgetContract> = z.output<Contract['inputs']>;
export type WidgetEventName<Contract extends WidgetContract> = keyof Contract['events'] & string;
export type WidgetEventPayload<
  Contract extends WidgetContract,
  Name extends WidgetEventName<Contract>,
> = z.output<Contract['events'][Name]>;

export interface WidgetContractAttribution {
  readonly id: string;
  readonly version?: string;
  readonly owner?: 'provider' | 'consumer';
}

export interface WidgetInputValidationOptions extends WidgetContractAttribution {
  readonly schema: WidgetSchema;
  readonly operation: 'initial mount' | 'input update' | 'retry';
  readonly value: unknown;
}

export interface WidgetInputValidationSuccess<T = unknown> {
  readonly ok: true;
  readonly value: T;
  readonly snapshot: T;
}

export interface WidgetInputValidationFailure {
  readonly ok: false;
  readonly error: MfeError;
}

export type WidgetInputValidationResult<T = unknown> =
  WidgetInputValidationSuccess<T> | WidgetInputValidationFailure;

function reportContractError(
  reportError: ((error: MfeError) => void) | undefined,
  error: MfeError,
): void {
  try {
    reportError?.(error);
  } catch {
    // Diagnostics must never change the provider's contract outcome.
  }
}

function issueObserved(issue: { readonly message?: string; readonly code?: string }): string {
  return issue.message ?? issue.code ?? 'schema rejected the value';
}

function contractPath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return path.map((part) => (typeof part === 'number' ? part : String(part)));
}

function inputError(
  options: WidgetInputValidationOptions,
  path: readonly (string | number)[],
  expected: string,
  observed: string,
  cause?: unknown,
): MfeError {
  return createMfeError({
    id: options.id,
    ...(options.version === undefined ? {} : { definitionVersion: options.version }),
    code: 'contract/input-mismatch',
    operation: `validate Widget inputs during ${options.operation}`,
    resource: 'Widget inputs',
    expected,
    observed,
    owner: options.owner === 'consumer' ? 'the Widget consumer' : 'the Widget provider',
    repair: 'Provide values matching the declared inputs schema and retry the mount if needed.',
    direction: 'input',
    path,
    ...(cause === undefined ? {} : { cause }),
  });
}

/** Parses and freezes one input value at the provider boundary. */
export function validateWidgetInputs<T extends WidgetSchema>(
  options: WidgetInputValidationOptions & { readonly schema: T },
): WidgetInputValidationResult<z.output<T>> {
  const serialIssue = findJsonValidationIssue(options.value);
  if (serialIssue) {
    return {
      ok: false,
      error: inputError(
        options,
        serialIssue.path,
        'a JSON-serializable value',
        `a value containing ${serialIssue.reason}`,
      ),
    };
  }

  let parsed: ReturnType<typeof options.schema.safeParse>;
  try {
    parsed = options.schema.safeParse(options.value);
  } catch (cause) {
    return {
      ok: false,
      error: inputError(
        options,
        [],
        'a value accepted by the schema',
        'schema evaluation threw',
        cause,
      ),
    };
  }
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = contractPath(issue?.path ?? []);
    return {
      ok: false,
      error: inputError(
        options,
        path,
        'a value accepted by the schema',
        issue ? issueObserved(issue) : 'schema rejected the value',
        parsed.error,
      ),
    };
  }

  const parsedSerialIssue = findJsonValidationIssue(parsed.data);
  if (parsedSerialIssue) {
    return {
      ok: false,
      error: inputError(
        options,
        parsedSerialIssue.path,
        'a JSON-serializable value',
        `a schema result containing ${parsedSerialIssue.reason}`,
      ),
    };
  }
  const snapshot = freezeJsonValue(parsed.data);
  return { ok: true, value: snapshot, snapshot };
}

function shallowEqualInputs(previous: unknown, next: unknown): boolean {
  if (
    previous === null ||
    next === null ||
    typeof previous !== 'object' ||
    typeof next !== 'object'
  ) {
    return Object.is(previous, next);
  }
  if (Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next)) return false;
  const previousOwnKeys = Reflect.ownKeys(previous);
  const nextOwnKeys = Reflect.ownKeys(next);
  if (previousOwnKeys.length !== nextOwnKeys.length) return false;
  if (previousOwnKeys.some((key) => typeof key !== 'string')) return false;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;
  return previousKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
    const previousDescriptor = Object.getOwnPropertyDescriptor(previous, key);
    const nextDescriptor = Object.getOwnPropertyDescriptor(next, key);
    return (
      previousDescriptor !== undefined &&
      nextDescriptor !== undefined &&
      'value' in previousDescriptor &&
      'value' in nextDescriptor &&
      Object.is(previousDescriptor.value, nextDescriptor.value)
    );
  });
}

function copySuppliedInputs(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  try {
    const copy: object = Array.isArray(value)
      ? []
      : (Object.create(Object.getPrototypeOf(value) as object | null) as object);
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor) Object.defineProperty(copy, key, descriptor);
    }
    return Object.freeze(copy);
  } catch {
    // Validation will report the original value; never invoke a getter just
    // to prepare the no-op comparison snapshot.
    return value;
  }
}

export interface WidgetInputUpdateResult<T = unknown> {
  readonly changed: boolean;
  readonly accepted: boolean;
  readonly snapshot: T | undefined;
  readonly error?: MfeError;
}

export interface WidgetInputRuntime<T = unknown> {
  readonly getSnapshot: () => T | undefined;
  readonly validateInitial: (value: unknown) => WidgetInputValidationResult<T>;
  readonly retry: (value?: unknown) => WidgetInputValidationResult<T>;
  readonly update: (value: unknown) => WidgetInputUpdateResult<T>;
  readonly dispose: () => void;
}

export interface WidgetInputRuntimeOptions<T extends WidgetSchema> extends Omit<
  WidgetInputValidationOptions,
  'value' | 'operation'
> {
  readonly schema: T;
  readonly reportError?: (error: MfeError) => void;
}

/**
 * Owns one mount's input snapshot. Input equality is checked before any JSON
 * or Zod work, so unchanged immutable props cannot cause validation churn.
 */
export function createWidgetInputRuntime<T extends WidgetSchema>(
  options: WidgetInputRuntimeOptions<T>,
): WidgetInputRuntime<z.output<T>> {
  let supplied: unknown;
  let snapshot: z.output<T> | undefined;
  let hasValidSnapshot = false;
  let hasSupplied = false;
  let disposed = false;

  function validate(value: unknown, operation: WidgetInputValidationOptions['operation']) {
    if (disposed) {
      return {
        ok: false as const,
        error: inputError(
          { ...options, value, operation },
          [],
          'an active Widget mount',
          'a disposed Widget mount',
        ),
      };
    }
    const result = validateWidgetInputs({ ...options, value, operation });
    if (disposed && result.ok) {
      const error = inputError(
        { ...options, value, operation },
        [],
        'an active Widget mount',
        'the mount was disposed while its schema was evaluated',
      );
      reportContractError(options.reportError, error);
      return { ok: false as const, error };
    }
    if (!result.ok) reportContractError(options.reportError, result.error);
    return result;
  }

  function commit(value: unknown, result: WidgetInputValidationSuccess<z.output<T>>) {
    supplied = copySuppliedInputs(value);
    hasSupplied = true;
    hasValidSnapshot = true;
    snapshot = result.snapshot;
  }

  return {
    getSnapshot: () => snapshot,
    validateInitial(value) {
      supplied = copySuppliedInputs(value);
      hasSupplied = true;
      const result = validate(value, 'initial mount');
      if (result.ok) commit(value, result);
      return result;
    },
    retry(value = supplied) {
      const result = validate(value, 'retry');
      if (result.ok) commit(value, result);
      return result;
    },
    update(value) {
      if (disposed) {
        const result = validate(value, 'input update');
        if (result.ok) return { changed: false, accepted: false, snapshot };
        return {
          changed: false,
          accepted: false,
          snapshot,
          error: result.error,
        };
      }
      // This comparison intentionally precedes serializability and schema checks.
      if (hasSupplied && shallowEqualInputs(supplied, value)) {
        return {
          changed: false,
          accepted: hasValidSnapshot,
          snapshot,
        };
      }
      // A failed initial mount can stage newer props, but only explicit retry
      // may establish the first valid committed snapshot.
      if (!hasValidSnapshot) {
        supplied = copySuppliedInputs(value);
        hasSupplied = true;
        const result = validate(value, 'input update');
        if (!result.ok) return { changed: true, accepted: false, snapshot, error: result.error };
        return { changed: true, accepted: false, snapshot };
      }
      const result = validate(value, 'input update');
      if (!result.ok) return { changed: true, accepted: false, snapshot, error: result.error };
      commit(value, result);
      return { changed: true, accepted: true, snapshot };
    },
    dispose() {
      disposed = true;
      supplied = undefined;
      snapshot = undefined;
    },
  };
}
