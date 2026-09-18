import { createMfeError, findJsonValidationIssue, freezeJsonValue } from '@company/mfe-core';
import type {
  MfeStorage,
  MfeStorageKey,
  MfeError,
  StorageKeyOptions,
  StorageRetention,
  StorageSchema,
  StorageStore,
} from '@company/mfe-core';

/** Host-internal reactive binding; this is not part of the author storage contract. */
export interface InternalStorageSubscriptionOptions<T> extends StorageKeyOptions<T> {
  readonly defaultValue: T;
}
export type InternalStorageUpdater<T> = T | ((current: T | null) => T);
export interface InternalMfeStorageKey<T> {
  readonly get: () => T | null;
  readonly getSnapshot: () => T | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (value: InternalStorageUpdater<T>) => void;
  readonly remove: () => void;
}
export interface InternalMfeStorage extends Omit<MfeStorage, 'key'> {
  readonly key: <T>(
    name: string,
    schema: StorageSchema<T>,
    options?: StorageKeyOptions<T>,
  ) => InternalMfeStorageKey<T>;
  readonly subscribeKey: <T>(
    name: string,
    schema: StorageSchema<T>,
    options: InternalStorageSubscriptionOptions<T>,
  ) => InternalMfeStorageKey<T>;
}

const ENVELOPE_MARKER = '@company/mfe-storage/v1';
const DEFAULT_VERSION = 1;

type StorageEventLike = {
  readonly storageArea?: Storage | null;
  readonly key: string | null;
  readonly newValue: string | null;
};

export interface StorageCoordinatorOptions {
  readonly local?: Storage;
  readonly session?: Storage;
  readonly generation: string;
  readonly knownDefinitionIds?: Iterable<string>;
  readonly subscribeStorageEvents?: (listener: (event: StorageEventLike) => void) => () => void;
  readonly reportError?: (error: MfeError) => void;
}

interface Declaration {
  readonly schema: StorageSchema<unknown>;
  readonly parse: (value: unknown) => unknown;
  readonly retention: StorageRetention;
  readonly version: number;
  readonly migrate?: (value: unknown, fromVersion: number) => unknown;
  readonly hasDefault: boolean;
  readonly defaultValue?: unknown;
  readonly defaultSerialized?: string;
}

interface Envelope {
  readonly marker?: unknown;
  readonly version?: unknown;
  readonly retention?: unknown;
  readonly generation?: unknown;
  readonly value?: unknown;
}

type Snapshot =
  | { readonly state: 'missing'; readonly raw: string | null }
  | { readonly state: 'value'; readonly raw: string; readonly value: unknown }
  | { readonly state: 'error'; readonly raw: string | null; readonly error: MfeError };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const serializeDefault = (value: unknown): string | undefined => {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : serialized;
  } catch {
    return undefined;
  }
};

const makeError = (id: string, operation: string, observed: string, cause?: unknown): MfeError =>
  createMfeError({
    id,
    code: 'storage/failure',
    operation,
    resource: 'browser storage',
    expected: 'a readable schema-valid framework envelope',
    observed,
    owner: 'the framework storage boundary',
    repair: 'Repair or explicitly remove the stored value before retrying.',
    cause,
  });

const isValidVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

class StorageEntry {
  readonly listeners = new Set<() => void>();
  readonly physicalKey: string;
  /** Handles are coordinator-lifetime declarations; mounts release only their listeners. */
  declaration: Declaration | undefined;
  snapshot: Snapshot = { state: 'missing', raw: null };
  loaded = false;
  private internalHandle: InternalMfeStorageKey<unknown> | undefined;
  private publicHandle: MfeStorageKey<unknown> | undefined;
  private resetPending = false;

  constructor(
    private readonly owner: DefinitionStorage,
    readonly store: StorageStore,
    readonly name: string,
  ) {
    this.physicalKey = `${owner.id}:${name}`;
  }

  bind<T>(
    schema: StorageSchema<T>,
    options: StorageKeyOptions<T> | InternalStorageSubscriptionOptions<T>,
    allowDefault: boolean,
    publicFacade = false,
  ): MfeStorageKey<T> | InternalMfeStorageKey<T> {
    const retention = options.retention ?? 'session';
    const version = options.version ?? DEFAULT_VERSION;
    if (!Number.isInteger(version) || version < 1) {
      throw this.owner.fail('bind storage key', `invalid version ${String(version)}`);
    }

    let defaultValue: unknown;
    let defaultSerialized: string | undefined;
    const hasDefault = Object.prototype.hasOwnProperty.call(options, 'defaultValue');
    if (hasDefault && !allowDefault) {
      throw this.owner.fail('bind storage key', 'default value requires a subscribed binding');
    }
    if (hasDefault) {
      const subscriptionOptions = options as InternalStorageSubscriptionOptions<T>;
      try {
        defaultValue = this.owner.validateJsonValue(
          schema.parse(subscriptionOptions.defaultValue),
          'bind storage key',
        );
      } catch (cause) {
        throw this.owner.fail('bind storage key', 'default value failed schema validation', cause);
      }
      defaultSerialized = serializeDefault(defaultValue);
      if (defaultSerialized === undefined) {
        throw this.owner.fail('bind storage key', 'default value is not JSON serializable');
      }
    }

    const next: Declaration = {
      schema,
      parse: (value: unknown) => schema.parse(value),
      retention,
      version,
      ...(options.migrate === undefined ? {} : { migrate: options.migrate }),
      hasDefault: defaultSerialized !== undefined,
      ...(defaultSerialized === undefined ? {} : { defaultValue, defaultSerialized }),
    };
    const existing = this.declaration;
    if (existing !== undefined) {
      const sameSchema = existing.schema === next.schema;
      const sameDefault =
        existing.hasDefault === next.hasDefault &&
        (!existing.hasDefault || existing.defaultSerialized === next.defaultSerialized);
      const sameMigration = existing.migrate === next.migrate;
      if (
        !sameSchema ||
        existing.retention !== next.retention ||
        existing.version !== next.version ||
        !sameMigration ||
        (existing.hasDefault && next.hasDefault && !sameDefault)
      ) {
        throw this.owner.fail('bind storage key', 'conflicting active declaration');
      }
      if (!existing.hasDefault && next.hasDefault) this.declaration = next;
    } else {
      this.declaration = next;
    }

    if (this.internalHandle === undefined) {
      this.internalHandle = {
        get: () => this.readValue(),
        getSnapshot: () => this.readSnapshot(),
        subscribe: (listener) => this.subscribe(listener),
        set: (value) => this.setValue(value),
        remove: () => this.removeValue(),
      };
    }
    if (!publicFacade) return this.internalHandle as InternalMfeStorageKey<T>;
    if (this.publicHandle === undefined) {
      this.publicHandle = {
        get: () => this.readValue(),
        set: (value) => this.setValue(value, false),
        remove: () => this.removeValue(),
      };
    }
    return this.publicHandle as MfeStorageKey<T>;
  }

  subscribe(listener: () => void): () => void {
    this.owner.assertActive();
    this.listeners.add(listener);
    try {
      this.ensureCurrentStorageValue();
    } catch (cause) {
      this.listeners.delete(listener);
      throw cause;
    }
    return () => this.listeners.delete(listener);
  }

  resetForTransition(): void {
    if (this.declaration?.retention !== 'session') return;
    this.resetPending = this.snapshot.state !== 'missing';
    this.loaded = true;
    this.snapshot = { state: 'missing', raw: null };
  }

  publishTransitionReset(): void {
    if (!this.resetPending) return;
    this.resetPending = false;
    this.notify();
  }

  externalRaw(raw: string | null): void {
    if (raw === this.snapshot.raw && this.loaded) return;
    try {
      this.loadRaw(raw);
    } catch {
      // loadRaw caches a structured error for the next read/render.
    }
  }

  externalFailure(error: MfeError): void {
    this.setError(null, error);
  }

  removeValue(): void {
    this.owner.assertActive();
    const target = this.owner.target(this.store);
    this.owner.runStorage('remove', () => target.removeItem(this.physicalKey));
    const changed = this.snapshot.state !== 'missing';
    this.loaded = true;
    this.snapshot = { state: 'missing', raw: null };
    if (changed) this.notify();
  }

  setValue<T>(next: InternalStorageUpdater<T>, allowUpdater = true): void {
    this.owner.assertActive();
    this.ensureCurrentStorageValue();
    const declaration = this.requireDeclaration();
    if (declaration.retention === 'session' && this.owner.generation === undefined) {
      throw this.owner.fail('write', 'session generation unavailable');
    }
    const startEpoch = this.owner.epoch;
    const startGeneration = this.owner.generation;
    let candidate: unknown;
    try {
      candidate =
        allowUpdater && typeof next === 'function'
          ? (next as (current: T | null) => T)(this.currentValue() as T | null)
          : next;
      candidate = this.owner.validateJsonValue(declaration.parse(candidate), 'write');
    } catch (cause) {
      throw this.owner.fail('write', 'schema validation failed', cause);
    }
    this.owner.assertCurrent(startEpoch, startGeneration, 'write');
    const value = candidate;
    let raw: string;
    try {
      raw = JSON.stringify(this.owner.envelope(declaration, value));
    } catch (cause) {
      throw this.owner.fail('write', 'value is not JSON serializable', cause);
    }
    this.owner.assertCurrent(startEpoch, startGeneration, 'write');
    if (raw === this.snapshot.raw && this.snapshot.state === 'value') return;
    const target = this.owner.target(this.store);
    this.owner.runStorage('write', () => target.setItem(this.physicalKey, raw));
    this.owner.assertCurrent(startEpoch, startGeneration, 'write');
    this.loaded = true;
    this.snapshot = { state: 'value', raw, value };
    this.notify();
  }

  private readValue(): unknown {
    this.owner.assertActive();
    this.ensureLoaded();
    if (this.snapshot.state === 'error') throw this.snapshot.error;
    return this.snapshot.state === 'missing' ? null : this.snapshot.value;
  }

  private readSnapshot(): unknown {
    this.owner.assertActive();
    this.ensureLoaded();
    if (this.snapshot.state === 'error') throw this.snapshot.error;
    if (this.snapshot.state === 'missing') return this.declaration?.defaultValue ?? null;
    return this.snapshot.value;
  }

  private currentValue(): unknown {
    if (this.snapshot.state === 'error') throw this.snapshot.error;
    return this.snapshot.state === 'missing'
      ? (this.declaration?.defaultValue ?? null)
      : this.snapshot.value;
  }

  private requireDeclaration(): Declaration {
    if (this.declaration === undefined) throw this.owner.fail('storage key', 'key is not bound');
    return this.declaration;
  }

  private ensureLoaded(): void {
    const declaration = this.requireDeclaration();
    if (declaration.retention === 'session' && this.owner.generation === undefined) {
      throw this.owner.fail('read', 'session generation unavailable');
    }
    if (this.loaded) return;
    const target = this.owner.target(this.store);
    let raw: string | null;
    try {
      raw = target.getItem(this.physicalKey);
    } catch (cause) {
      throw this.setError(null, this.owner.fail('read', 'storage access failed', cause));
    }
    this.loadRaw(raw);
  }

  private ensureCurrentStorageValue(): void {
    const target = this.owner.target(this.store);
    let raw: string | null;
    try {
      raw = target.getItem(this.physicalKey);
    } catch (cause) {
      throw this.setError(null, this.owner.fail('read', 'storage access failed', cause));
    }
    if (this.loaded && raw === this.snapshot.raw) {
      if (this.snapshot.state === 'error') throw this.snapshot.error;
      return;
    }
    this.loadRaw(raw);
    if (this.snapshot.state === 'error') throw this.snapshot.error;
  }

  private loadRaw(raw: string | null): void {
    if (raw === this.snapshot.raw && this.loaded) return;
    const declaration = this.requireDeclaration();
    if (raw === null) {
      const changed = this.snapshot.state !== 'missing';
      this.loaded = true;
      this.snapshot = { state: 'missing', raw: null };
      if (changed) this.notify();
      return;
    }

    const startEpoch = this.owner.epoch;
    const startGeneration = this.owner.generation;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause) {
      throw this.setError(
        raw,
        this.owner.fail('read', 'malformed JSON', cause),
        startEpoch,
        startGeneration,
      );
    }
    if (!isObject(parsed)) {
      throw this.setError(
        raw,
        this.owner.fail('read', 'stored value is not an envelope'),
        startEpoch,
        startGeneration,
      );
    }
    const envelope = parsed as Envelope;
    if (
      envelope.marker !== ENVELOPE_MARKER ||
      (!isValidVersion(envelope.version) && envelope.version !== undefined) ||
      (envelope.retention !== 'session' && envelope.retention !== 'preference')
    ) {
      throw this.setError(
        raw,
        this.owner.fail('read', 'invalid framework envelope'),
        startEpoch,
        startGeneration,
      );
    }
    if (envelope.retention !== declaration.retention) {
      throw this.setError(
        raw,
        this.owner.fail('read', 'stored retention conflicts with declaration'),
        startEpoch,
        startGeneration,
      );
    }
    if (declaration.retention === 'session') {
      if (typeof envelope.generation !== 'string') {
        throw this.setError(
          raw,
          this.owner.fail('read', 'session generation is missing'),
          startEpoch,
          startGeneration,
        );
      }
      if (envelope.generation !== startGeneration) {
        const changed = this.snapshot.state !== 'missing';
        this.loaded = true;
        this.snapshot = { state: 'missing', raw };
        if (changed) this.notify();
        return;
      }
    }

    const storedVersion = envelope.version === undefined ? 0 : envelope.version;
    if (!Number.isInteger(storedVersion) || storedVersion < 0) {
      throw this.setError(
        raw,
        this.owner.fail('read', 'invalid stored version'),
        startEpoch,
        startGeneration,
      );
    }
    let value = envelope.value;
    let committedRaw = raw;
    if (storedVersion !== declaration.version) {
      if (storedVersion > declaration.version) {
        throw this.setError(
          raw,
          this.owner.fail('migrate', `unsupported future version ${storedVersion}`),
          startEpoch,
          startGeneration,
        );
      }
      if (declaration.migrate === undefined) {
        throw this.setError(
          raw,
          this.owner.fail('migrate', `unsupported version ${storedVersion}`),
          startEpoch,
          startGeneration,
        );
      }
      let migrated: unknown;
      try {
        migrated = declaration.migrate(value, storedVersion);
        value = this.owner.validateJsonValue(declaration.parse(migrated), 'migrate');
      } catch (cause) {
        throw this.setError(
          raw,
          this.owner.fail('migrate', 'migration failed', cause),
          startEpoch,
          startGeneration,
        );
      }
      this.owner.assertCurrent(startEpoch, startGeneration, 'migrate');
      try {
        committedRaw = JSON.stringify(this.owner.envelope(declaration, value));
      } catch (cause) {
        throw this.setError(
          raw,
          this.owner.fail('migrate', 'migrated value is not JSON serializable', cause),
          startEpoch,
          startGeneration,
        );
      }
      this.owner.assertCurrent(startEpoch, startGeneration, 'migrate');
      try {
        this.owner.target(this.store).setItem(this.physicalKey, committedRaw);
      } catch (cause) {
        throw this.setError(
          raw,
          this.owner.fail('migrate', 'migration write failed', cause),
          startEpoch,
          startGeneration,
        );
      }
      this.owner.assertCurrent(startEpoch, startGeneration, 'migrate');
    } else {
      try {
        value = this.owner.validateJsonValue(declaration.parse(value), 'read');
      } catch (cause) {
        throw this.setError(
          raw,
          this.owner.fail('read', 'schema validation failed', cause),
          startEpoch,
          startGeneration,
        );
      }
      this.owner.assertCurrent(startEpoch, startGeneration, 'read');
    }

    const changed = this.snapshot.raw !== committedRaw || this.snapshot.state !== 'value';
    this.loaded = true;
    this.snapshot = { state: 'value', raw: committedRaw, value };
    if (changed) this.notify();
  }
  private setError(
    raw: string | null,
    error: MfeError,
    expectedEpoch?: number,
    expectedGeneration?: string,
  ): MfeError {
    if (
      expectedEpoch !== undefined &&
      (expectedEpoch !== this.owner.epoch || expectedGeneration !== this.owner.generation)
    ) {
      throw this.owner.fail('read', 'operation belongs to a retired generation');
    }
    this.loaded = true;
    this.snapshot = { state: 'error', raw, error };
    this.notify();
    return error;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (cause) {
        this.owner.fail('notify', 'subscriber callback failed', cause);
      }
    }
  }
}

class DefinitionStorage {
  readonly local: MfeStorage;
  readonly session: MfeStorage;
  readonly internalLocal: InternalMfeStorage;
  readonly internalSession: InternalMfeStorage;
  readonly entries = new Map<string, StorageEntry>();

  constructor(
    readonly id: string,
    private readonly coordinator: StorageCoordinatorImpl,
  ) {
    this.local = this.makeStore('local');
    this.session = this.makeStore('session');
    this.internalLocal = this.makeInternalStore('local');
    this.internalSession = this.makeInternalStore('session');
  }

  get generation(): string | undefined {
    return this.coordinator.generation;
  }

  get epoch(): number {
    return this.coordinator.epoch;
  }

  assertActive(): void {
    this.coordinator.assertActive();
  }

  target(store: StorageStore): Storage {
    this.coordinator.assertActive();
    return this.coordinator.target(store);
  }

  fail(operation: string, observed: string, cause?: unknown): MfeError {
    return this.coordinator.fail(this.id, operation, observed, cause);
  }

  runStorage(operation: string, action: () => void): void {
    try {
      action();
    } catch (cause) {
      throw this.fail(operation, 'storage access failed', cause);
    }
  }

  envelope(declaration: Declaration, value: unknown): Record<string, unknown> {
    return {
      marker: ENVELOPE_MARKER,
      version: declaration.version,
      retention: declaration.retention,
      ...(declaration.retention === 'session' ? { generation: this.coordinator.generation } : {}),
      value,
    };
  }

  validateJsonValue(value: unknown, operation: string): unknown {
    const issue = findJsonValidationIssue(value);
    if (issue !== undefined) {
      throw this.fail(operation, `value is not JSON serializable (${issue.reason})`, issue);
    }
    return freezeJsonValue(value);
  }

  assertCurrent(epoch: number, generation: string | undefined, operation: string): void {
    this.coordinator.assertCurrent(epoch, generation, operation);
  }

  invalidateSession(): void {
    for (const entry of this.entries.values()) entry.resetForTransition();
  }

  publishTransitionReset(): void {
    for (const entry of this.entries.values()) entry.publishTransitionReset();
  }

  external(store: StorageStore, name: string, raw: string | null): void {
    this.entries.get(`${store}\0${name}`)?.externalRaw(raw);
  }

  private makeStore(store: StorageStore): MfeStorage {
    return {
      key: <T>(name: string, schema: StorageSchema<T>, options: StorageKeyOptions<T> = {}) => {
        const entry = this.entry(store, name);
        return entry.bind(schema, options, false, true) as MfeStorageKey<T>;
      },
      remove: (name) => {
        const entry = this.entries.get(`${store}\0${name}`);
        if (entry !== undefined) {
          entry.removeValue();
          return;
        }
        const target = this.target(store);
        this.runStorage('remove', () => target.removeItem(`${this.id}:${name}`));
      },
      clear: () => {
        const target = this.target(store);
        const keys: string[] = [];
        this.runStorage('clear', () => {
          for (let index = 0; index < target.length; index += 1) {
            const key = target.key(index);
            if (key?.startsWith(`${this.id}:`)) keys.push(key);
          }
        });
        for (const key of keys) {
          const name = key.slice(this.id.length + 1);
          this.runStorage('clear', () => target.removeItem(key));
          this.entries.get(`${store}\0${name}`)?.externalRaw(null);
        }
      },
    };
  }

  private makeInternalStore(store: StorageStore): InternalMfeStorage {
    return {
      key: <T>(name: string, schema: StorageSchema<T>, options: StorageKeyOptions<T> = {}) => {
        const entry = this.entry(store, name);
        return entry.bind(schema, options, false) as InternalMfeStorageKey<T>;
      },
      subscribeKey: <T>(
        name: string,
        schema: StorageSchema<T>,
        options: InternalStorageSubscriptionOptions<T>,
      ) => {
        const entry = this.entry(store, name);
        return entry.bind(schema, options, true) as InternalMfeStorageKey<T>;
      },
      remove: (name) => {
        const entry = this.entries.get(`${store}\0${name}`);
        if (entry !== undefined) {
          entry.removeValue();
          return;
        }
        const target = this.target(store);
        this.runStorage('remove', () => target.removeItem(`${this.id}:${name}`));
      },
      clear: () => {
        const target = this.target(store);
        const keys: string[] = [];
        this.runStorage('clear', () => {
          for (let index = 0; index < target.length; index += 1) {
            const key = target.key(index);
            if (key?.startsWith(`${this.id}:`)) keys.push(key);
          }
        });
        for (const key of keys) {
          const name = key.slice(this.id.length + 1);
          this.runStorage('clear', () => target.removeItem(key));
          this.entries.get(`${store}\0${name}`)?.externalRaw(null);
        }
      },
    };
  }

  private entry(store: StorageStore, name: string): StorageEntry {
    if (!name || name.includes(':')) throw this.fail('bind storage key', 'invalid key name');
    const existing = this.entries.get(`${store}\0${name}`);
    if (existing !== undefined) return existing;
    const entry = new StorageEntry(this, store, name);
    this.entries.set(`${store}\0${name}`, entry);
    return entry;
  }
}

class StorageCoordinatorImpl {
  readonly definitions = new Map<string, DefinitionStorage>();
  readonly knownDefinitionIds: Set<string>;
  generation: string;
  readonly retiredGenerations = new Set<string>();
  epoch = 0;
  private transitioning = false;
  private disposed = false;
  private readonly unsubscribeEvents: (() => void) | undefined;

  constructor(private readonly options: StorageCoordinatorOptions) {
    if (typeof options.generation !== 'string' || options.generation.length === 0) {
      throw makeError('storage', 'create', 'session generation unavailable');
    }
    this.generation = options.generation;
    this.knownDefinitionIds = new Set(options.knownDefinitionIds ?? []);
    this.unsubscribeEvents = options.subscribeStorageEvents?.((event) =>
      this.onStorageEvent(event),
    );
  }

  assertActive(): void {
    if (this.disposed) throw this.fail('storage', 'storage access', 'coordinator is disposed');
  }

  target(store: StorageStore): Storage {
    this.assertActive();
    const target = store === 'local' ? this.options.local : this.options.session;
    if (target === undefined)
      throw this.fail('storage', 'storage access', `${store} storage unavailable`);
    return target;
  }

  fail(id: string, operation: string, observed: string, cause?: unknown): MfeError {
    const failure = makeError(id, operation, observed, cause);
    try {
      this.options.reportError?.(failure);
    } catch {
      // Diagnostics must not replace the storage error delivered to the caller.
    }
    return failure;
  }

  assertCurrent(epoch: number, generation: string | undefined, operation: string): void {
    if (this.disposed || epoch !== this.epoch || generation !== this.generation) {
      throw this.fail('storage', operation, 'operation belongs to a retired generation');
    }
  }

  forDefinition(id: string): DefinitionStorage {
    if (!id || id.includes(':'))
      throw this.fail(id || 'storage', 'bind storage key', 'invalid definition id');
    this.knownDefinitionIds.add(id);
    const existing = this.definitions.get(id);
    if (existing !== undefined) return existing;
    const definition = new DefinitionStorage(id, this);
    this.definitions.set(id, definition);
    return definition;
  }

  setKnownDefinitionIds(ids: Iterable<string>): void {
    this.knownDefinitionIds.clear();
    for (const id of ids) this.knownDefinitionIds.add(id);
  }

  transition(nextGeneration: string): boolean {
    this.assertActive();
    if (typeof nextGeneration !== 'string' || nextGeneration.length === 0) {
      throw this.fail('storage', 'transition', 'session generation is unavailable');
    }
    if (nextGeneration === this.generation) return false;
    if (this.retiredGenerations.has(nextGeneration)) {
      throw this.fail('storage', 'transition', 'generation token was already retired');
    }
    const previousGeneration = this.generation;
    this.retiredGenerations.add(previousGeneration);
    this.epoch += 1;
    this.transitioning = true;
    for (const definition of this.definitions.values()) definition.invalidateSession();
    this.deleteSessionRecords();
    this.generation = nextGeneration;
    this.transitioning = false;
    for (const definition of this.definitions.values()) definition.publishTransitionReset();
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.unsubscribeEvents?.();
    for (const definition of this.definitions.values()) {
      for (const entry of definition.entries.values()) entry.listeners.clear();
    }
  }

  private deleteSessionRecords(): void {
    for (const store of ['local', 'session'] as const) {
      const target = store === 'local' ? this.options.local : this.options.session;
      if (target === undefined) continue;
      const keys: string[] = [];
      try {
        for (let index = 0; index < target.length; index += 1) {
          const key = target.key(index);
          if (key !== null) keys.push(key);
        }
      } catch (cause) {
        this.fail('storage', 'transition', `${store} storage enumeration failed`, cause);
        continue;
      }
      for (const key of keys) {
        const separator = key.indexOf(':');
        if (separator <= 0) continue;
        const definitionId = key.slice(0, separator);
        if (
          !this.knownDefinitionIds.has(definitionId) &&
          !this.isMarkedFrameworkRecord(target, key)
        ) {
          continue;
        }
        let record: unknown;
        try {
          const raw = target.getItem(key);
          if (raw === null) continue;
          record = JSON.parse(raw) as unknown;
        } catch (cause) {
          this.fail('storage', 'transition', 'stored record could not be inspected', cause);
          continue;
        }
        if (
          !isObject(record) ||
          record.marker !== ENVELOPE_MARKER ||
          record.retention !== 'session' ||
          !isValidVersion(record.version) ||
          typeof record.generation !== 'string'
        ) {
          continue;
        }
        try {
          target.removeItem(key);
        } catch (cause) {
          this.fail(definitionId, 'transition', 'session record deletion failed', cause);
        }
      }
    }
  }

  private isMarkedFrameworkRecord(target: Storage, key: string): boolean {
    try {
      const raw = target.getItem(key);
      if (raw === null) return false;
      const parsed = JSON.parse(raw) as unknown;
      return isObject(parsed) && parsed.marker === ENVELOPE_MARKER;
    } catch (cause) {
      this.fail('storage', 'transition', 'stored record could not be inspected', cause);
      return false;
    }
  }

  private onStorageEvent(event: StorageEventLike): void {
    if (this.disposed || this.transitioning) return;
    if (event.key === null) {
      if (event.storageArea === undefined || event.storageArea === null) return;
      const store = this.storeFor(event.storageArea);
      if (store === undefined) return;
      for (const definition of this.definitions.values()) {
        for (const entry of definition.entries.values()) {
          if (entry.store === store) {
            try {
              const raw = event.storageArea.getItem(entry.physicalKey);
              entry.externalRaw(raw);
            } catch (cause) {
              const failure = this.fail('storage', 'external read', 'storage access failed', cause);
              entry.externalFailure(failure);
            }
          }
        }
      }
      return;
    }
    const separator = event.key.indexOf(':');
    if (separator <= 0) return;
    const id = event.key.slice(0, separator);
    const name = event.key.slice(separator + 1);
    const definition = this.definitions.get(id);
    if (definition === undefined) return;
    const store =
      event.storageArea === undefined || event.storageArea === null
        ? undefined
        : this.storeFor(event.storageArea);
    if (store === undefined) return;
    const entry = definition.entries.get(`${store}\0${name}`);
    entry?.externalRaw(event.newValue);
  }

  private storeFor(storage: Storage): StorageStore | undefined {
    if (storage === this.options.local) return 'local';
    if (storage === this.options.session) return 'session';
    return undefined;
  }
}

export interface MfeDefinitionStorage {
  readonly id: string;
  readonly local: MfeStorage;
  readonly session: MfeStorage;
}

export interface InternalMfeDefinitionStorage extends MfeDefinitionStorage {
  readonly local: InternalMfeStorage;
  readonly session: InternalMfeStorage;
}

export interface StorageCoordinator {
  readonly forDefinition: (id: string) => MfeDefinitionStorage;
  readonly transition: (generation: string) => boolean;
  readonly setKnownDefinitionIds: (ids: Iterable<string>) => void;
  readonly dispose: () => void;
}

export interface InternalStorageCoordinator extends StorageCoordinator {
  readonly forDefinitionInternal: (id: string) => InternalMfeDefinitionStorage;
}

const publicDefinition = (definition: DefinitionStorage): MfeDefinitionStorage => ({
  id: definition.id,
  local: definition.local,
  session: definition.session,
});

export function createStorageCoordinator(options: StorageCoordinatorOptions): StorageCoordinator {
  const coordinator = new StorageCoordinatorImpl(options);
  return {
    forDefinition: (id) => publicDefinition(coordinator.forDefinition(id)),
    transition: coordinator.transition.bind(coordinator),
    setKnownDefinitionIds: coordinator.setKnownDefinitionIds.bind(coordinator),
    dispose: coordinator.dispose.bind(coordinator),
  };
}

/** Internal host seam for reactive storage bindings and functional updates. */
export function createInternalStorageCoordinator(
  options: StorageCoordinatorOptions,
): InternalStorageCoordinator {
  const coordinator = new StorageCoordinatorImpl(options);
  return {
    forDefinition: (id) => publicDefinition(coordinator.forDefinition(id)),
    transition: coordinator.transition.bind(coordinator),
    setKnownDefinitionIds: coordinator.setKnownDefinitionIds.bind(coordinator),
    dispose: coordinator.dispose.bind(coordinator),
    forDefinitionInternal: (id) => {
      const definition = coordinator.forDefinition(id);
      return {
        ...definition,
        local: definition.internalLocal,
        session: definition.internalSession,
      };
    },
  };
}

export type { StorageEventLike };
