import { createApp, type AppRouterOptions } from '@company/mfe-react';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import './utilities.css';

function makeRouter({ basePath, history, context }: AppRouterOptions) {
  return createRouter({
    routeTree,
    basepath: basePath,
    history,
    context,
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}

export default createApp({ id: 'geology', version: '0.0.0', router: makeRouter });
