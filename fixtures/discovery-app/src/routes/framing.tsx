import { createFileRoute } from '@tanstack/react-router';

import { DiscoveryScreen } from '../components/discovery-screen';

export const Route = createFileRoute('/framing')({ component: Framing });

function Framing() {
  return <DiscoveryScreen framing />;
}
