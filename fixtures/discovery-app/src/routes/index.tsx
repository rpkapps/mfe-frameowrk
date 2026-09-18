import { createFileRoute } from '@tanstack/react-router';

import { DiscoveryScreen } from '../components/discovery-screen';
import '../styles.css';

export const Route = createFileRoute('/')({ component: DiscoveryScreen });
