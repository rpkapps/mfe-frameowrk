import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Welcome });

function Welcome() {
  const user = Route.useRouteContext({ select: (context) => context.mfe.user });
  return <p>Hello, {user?.name ?? 'guest'}</p>;
}
