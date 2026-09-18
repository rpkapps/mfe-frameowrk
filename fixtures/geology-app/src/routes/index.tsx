import { createFileRoute } from '@tanstack/react-router';

import { GeologyScreen } from '../components/geology-screen';

export const Route = createFileRoute('/')({ component: GeologyScreen });
