import { createFileRoute } from '@tanstack/react-router';

import { GeologyScreen } from '../components/geology-screen';
import '../styles.css';

export const Route = createFileRoute('/')({ component: GeologyScreen });
