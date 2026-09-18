/** A JSON value contains only finite primitives, arrays, and plain objects. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface JsonValidationIssue {
  readonly path: readonly (string | number)[];
  readonly reason:
    | 'undefined'
    | 'function'
    | 'symbol'
    | 'bigint'
    | 'nonfinite-number'
    | 'class-instance'
    | 'accessor'
    | 'symbol-key'
    | 'non-enumerable-key'
    | 'sparse-array'
    | 'cycle';
}

/**
 * Finds the first value that cannot cross a JSON-only Widget boundary.
 *
 * This deliberately does not use JSON.stringify: stringify silently drops
 * undefined, functions, and symbol keys, and invokes user supplied toJSON
 * methods. Those values are contract errors rather than coercible values.
 */
export function findJsonValidationIssue(value: unknown): JsonValidationIssue | undefined {
  const active = new WeakSet<object>();

  function visit(
    current: unknown,
    path: readonly (string | number)[],
  ): JsonValidationIssue | undefined {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') {
      return undefined;
    }
    if (typeof current === 'number') {
      return Number.isFinite(current) ? undefined : { path, reason: 'nonfinite-number' };
    }
    if (typeof current === 'undefined') return { path, reason: 'undefined' };
    if (typeof current === 'function') return { path, reason: 'function' };
    if (typeof current === 'symbol') return { path, reason: 'symbol' };
    if (typeof current === 'bigint') return { path, reason: 'bigint' };
    if (typeof current !== 'object') return { path, reason: 'class-instance' };

    if (active.has(current)) return { path, reason: 'cycle' };
    active.add(current);

    const prototype: object | null = Object.getPrototypeOf(current) as object | null;
    const array = Array.isArray(current);
    if (array) {
      if (prototype !== Array.prototype) {
        active.delete(current);
        return { path, reason: 'class-instance' };
      }
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor) {
          active.delete(current);
          return { path: [...path, index], reason: 'sparse-array' };
        }
        if (!('value' in descriptor)) {
          active.delete(current);
          return { path: [...path, index], reason: 'accessor' };
        }
        const issue = visit(descriptor.value, [...path, index]);
        if (issue) {
          active.delete(current);
          return issue;
        }
      }
      for (const key of Reflect.ownKeys(current)) {
        if (
          key === 'length' ||
          (typeof key === 'string' &&
            /^\d+$/.test(key) &&
            Number.isSafeInteger(Number(key)) &&
            String(Number(key)) === key &&
            Number(key) < current.length)
        )
          continue;
        active.delete(current);
        return {
          path: [...path, typeof key === 'string' ? key : String(key)],
          reason: typeof key === 'symbol' ? 'symbol-key' : 'non-enumerable-key',
        };
      }
    } else {
      if (prototype !== Object.prototype && prototype !== null) {
        active.delete(current);
        return { path, reason: 'class-instance' };
      }
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key === 'symbol') {
          active.delete(current);
          return { path: [...path, String(key)], reason: 'symbol-key' };
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable) {
          active.delete(current);
          return { path: [...path, key], reason: 'non-enumerable-key' };
        }
        if (!('value' in descriptor)) {
          active.delete(current);
          return { path: [...path, key], reason: 'accessor' };
        }
        const issue = visit(descriptor.value, [...path, key]);
        if (issue) {
          active.delete(current);
          return issue;
        }
      }
    }
    active.delete(current);
    return undefined;
  }

  return visit(value, []);
}

export function isJsonSerializable(value: unknown): value is JsonValue {
  return findJsonValidationIssue(value) === undefined;
}

/** Recursively freezes a value already accepted by findJsonValidationIssue. */
export function freezeJsonValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'string' && key === 'length' && Array.isArray(value)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) freezeJsonValue(descriptor.value);
  }
  return Object.freeze(value);
}
