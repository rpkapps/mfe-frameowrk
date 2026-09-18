import { createFileRoute } from '@tanstack/react-router';

import { DiscoveryScreen } from '../components/discovery-screen';

export const Route = createFileRoute('/framing')({
  loader: ({ context }) => ({ loadedUserId: context.mfe.user?.id ?? 'guest' }),
  component: Framing,
});

function Framing() {
  return <DiscoveryScreen framing />;
}
