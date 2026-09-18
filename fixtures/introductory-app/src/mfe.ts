import { createApp, type AppRouterOptions } from '@company/mfe-react';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

function makeRouter({ basePath, context }: AppRouterOptions) {
  return createRouter({
    routeTree,
    basepath: basePath,
    context: { ...context },
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}

export default createApp({ id: 'operations', version: '0.0.0', router: makeRouter });
