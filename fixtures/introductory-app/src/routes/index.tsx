import { useUser } from '@company/mfe-react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Welcome });

function Welcome() {
  const user = useUser();
  return <p>Hello, {user?.name ?? 'guest'}</p>;
}
