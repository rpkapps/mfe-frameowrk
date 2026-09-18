/** Neutral identity only. The React adapter owns the author-supplied router factory. */
export interface AppDescriptor {
  readonly kind: 'app';
  readonly id: string;
  readonly version?: string;
  readonly breadcrumbs?: false;
}
