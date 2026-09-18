import { createFileRoute } from '@tanstack/react-router';

import { DiscoveryScreen } from '../../components/discovery-screen';

export const Route = createFileRoute('/project/framing')({
  loader: ({ context }) => ({ loadedUserId: context.mfe.user?.id ?? 'guest' }),
  component: () => <DiscoveryScreen framing />,
});
