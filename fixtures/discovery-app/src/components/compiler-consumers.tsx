import { useTheme, useUser } from '@company/mfe-react';
import { Badge } from '@tecton/react/components/badge';

/** This consumer is intentionally eligible for the React Compiler. */
export function CompiledAdapterConsumer() {
  const theme = useTheme();
  const user = useUser();
  return (
    <div data-testid="compiled-adapter-consumer">
      <Badge variant="outline">Compiled: {theme}</Badge>
      <span>{user?.id ?? 'signed-out'}</span>
    </div>
  );
}

/** The directive is fixture-local evidence that an excluded consumer stays uncompiled. */
export function UncompiledAdapterConsumer() {
  'use no memo';

  const theme = useTheme();
  const user = useUser();
  return (
    <div data-testid="uncompiled-adapter-consumer">
      <Badge variant="outline">Excluded: {theme}</Badge>
      <span>{user?.id ?? 'signed-out'}</span>
    </div>
  );
}
