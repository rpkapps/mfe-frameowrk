/** Neutral identity only. The React adapter owns the author-supplied router factory. */
export interface AppDescriptor {
  readonly kind: 'app';
  readonly id: string;
  readonly version?: string;
  readonly breadcrumbs?: false;
}

/** A Widget is deliberately framework-neutral; render ownership is adapter-private. */
export interface WidgetDescriptor {
  readonly kind: 'widget';
  readonly id: string;
  readonly version?: string;
}

export type MfeDescriptor = AppDescriptor | WidgetDescriptor;

export const MFE_CONTRACT_MAJOR = 1 as const;

export interface ContractMetadata {
  readonly kind: 'app' | 'widget';
  readonly major: number;
}

export interface NormalizedRegistryRecord {
  readonly id: string;
  readonly kind: 'app' | 'widget' | 'legacy';
  readonly version?: string;
  readonly contractMajor?: number;
}
