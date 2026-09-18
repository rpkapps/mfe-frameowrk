import { Generator, getConfig } from '@tanstack/router-generator';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../fixtures/introductory-app/', import.meta.url));
const generator = new Generator({
  root,
  config: getConfig(
    {
      target: 'react',
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      quoteStyle: 'single',
      semicolons: true,
      disableLogging: true,
    },
    root,
  ),
});
await generator.run();
