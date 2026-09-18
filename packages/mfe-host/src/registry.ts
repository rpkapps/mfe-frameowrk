import { MFE_CONTRACT_MAJOR, createMfeError } from '@company/mfe-core';
import type { MfeError, NormalizedRegistryRecord } from '@company/mfe-core';

/** Runtime shape accepted at the host registry boundary. */
export interface AdvertisedDescriptor {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly version?: unknown;
  readonly contractMajor?: unknown;
}

export interface QuarantinedRegistryEntry {
  readonly descriptor: unknown;
  readonly error: MfeError;
}

export interface NormalizedRegistry {
  readonly entries: readonly NormalizedRegistryRecord[];
  readonly quarantined: readonly QuarantinedRegistryEntry[];
}

interface AdapterTableEntry {
  readonly kind: NormalizedRegistryRecord['kind'];
  readonly matches: (descriptor: AdvertisedDescriptor) => boolean;
}

/**
 * Adapter selection is deliberately data driven. A future adapter adds one row;
 * the boundary validation and duplicate handling do not need to change.
 */
const adapterTable: readonly AdapterTableEntry[] = [
  { kind: 'app', matches: (entry) => entry.kind === 'app' },
  { kind: 'widget', matches: (entry) => entry.kind === 'widget' },
];

function isRecord(value: unknown): value is AdvertisedDescriptor {
  return typeof value === 'object' && value !== null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function descriptorId(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') return undefined;
  return value.id;
}

function safeDescriptorId(value: unknown): string | undefined {
  try {
    return descriptorId(value);
  } catch {
    return undefined;
  }
}

function errorFor(
  id: string,
  observed: string,
  code: 'registry/invalid-descriptor' | 'registry/duplicate-id' | 'contract/unsupported-major',
  cause?: unknown,
): MfeError {
  return createMfeError({
    id,
    code,
    operation: 'normalize registry',
    resource: 'advertised registry descriptor',
    expected:
      code === 'contract/unsupported-major'
        ? `contract major ${MFE_CONTRACT_MAJOR}`
        : 'one valid App or Widget descriptor',
    observed,
    owner: 'the neutral host registry',
    repair: 'Correct the descriptor and reload the registry.',
    ...(cause === undefined ? {} : { cause }),
  });
}

type Candidate =
  | { readonly descriptor: AdvertisedDescriptor; readonly record: NormalizedRegistryRecord }
  | { readonly id?: string; readonly error: MfeError };

function candidate(entry: unknown): Candidate {
  if (!isRecord(entry))
    return { error: errorFor('', 'a non-object descriptor', 'registry/invalid-descriptor') };

  const id = descriptorId(entry);
  if (id === undefined)
    return { error: errorFor('', 'a missing or empty ID', 'registry/invalid-descriptor') };

  // Presence is what advertises a new contract. An own property whose value is
  // undefined is malformed new metadata and must never be legacy-compatible.
  const advertisedNew = hasOwn(entry, 'kind') || hasOwn(entry, 'contractMajor');
  if (advertisedNew) {
    if (entry.kind !== 'app' && entry.kind !== 'widget') {
      return {
        id,
        error: errorFor(
          id,
          `unknown advertised kind ${String(entry.kind)}`,
          'registry/invalid-descriptor',
        ),
      };
    }
    if (entry.contractMajor !== MFE_CONTRACT_MAJOR) {
      return {
        id,
        error: errorFor(
          id,
          `unsupported or missing contract major ${String(entry.contractMajor)}`,
          'contract/unsupported-major',
        ),
      };
    }
  }

  if (!advertisedNew) {
    return {
      id,
      error: errorFor(id, 'no advertised App or Widget contract', 'registry/invalid-descriptor'),
    };
  }

  if (entry.version !== undefined && typeof entry.version !== 'string') {
    return { id, error: errorFor(id, 'a non-string version', 'registry/invalid-descriptor') };
  }

  const match = adapterTable.find((adapter) => adapter.matches(entry));
  if (!match) {
    return {
      id,
      error: errorFor(id, 'no compatible advertised contract', 'registry/invalid-descriptor'),
    };
  }

  // Only neutral identity and compatibility metadata cross this boundary. Raw
  // transport, legacy, and implementation fields are intentionally discarded.
  return {
    descriptor: entry,
    record: Object.freeze({
      id,
      kind: match.kind,
      ...(entry.version === undefined ? {} : { version: entry.version }),
      ...(advertisedNew ? { contractMajor: MFE_CONTRACT_MAJOR } : {}),
    }),
  };
}

interface SeenEntry {
  readonly descriptor: unknown;
  readonly id: string | undefined;
  readonly result: Candidate;
}

/** Normalizes each entry independently and quarantines every duplicate participant. */
export function normalizeRegistry(entries: readonly unknown[]): NormalizedRegistry {
  const seenEntries: SeenEntry[] = entries.map((entry) => {
    let result: Candidate;
    try {
      result = candidate(entry);
    } catch (cause) {
      const id = safeDescriptorId(entry);
      result = {
        ...(id === undefined ? {} : { id }),
        error: errorFor(
          id ?? '',
          'a descriptor property accessor threw',
          'registry/invalid-descriptor',
          cause,
        ),
      };
    }
    return { descriptor: entry, id: 'record' in result ? result.record.id : result.id, result };
  });
  const byId = new Map<string, SeenEntry[]>();
  for (const seen of seenEntries) {
    if (seen.id === undefined) continue;
    const group = byId.get(seen.id) ?? [];
    group.push(seen);
    byId.set(seen.id, group);
  }

  const duplicateIds = new Set<string>();
  for (const [id, group] of byId) {
    if (group.length > 1) duplicateIds.add(id);
  }

  const normalized: NormalizedRegistryRecord[] = [];
  const quarantined: QuarantinedRegistryEntry[] = [];
  for (const seen of seenEntries) {
    if (seen.id !== undefined && duplicateIds.has(seen.id)) {
      const conflicts = byId.get(seen.id)!;
      quarantined.push({
        descriptor: seen.descriptor,
        error: errorFor(
          seen.id,
          `duplicate ID shared by ${conflicts.length} entries`,
          'registry/duplicate-id',
        ),
      });
      continue;
    }
    if ('record' in seen.result) normalized.push(seen.result.record);
    else quarantined.push({ descriptor: seen.descriptor, error: seen.result.error });
  }

  return Object.freeze({
    entries: Object.freeze(normalized),
    quarantined: Object.freeze(quarantined),
  });
}

export function selectAdapter(record: NormalizedRegistryRecord): NormalizedRegistryRecord['kind'] {
  const match = adapterTable.find((entry) => entry.kind === record.kind);
  if (!match) {
    throw errorFor(
      record.id,
      `unsupported normalized kind ${record.kind}`,
      'registry/invalid-descriptor',
    );
  }
  return match.kind;
}
