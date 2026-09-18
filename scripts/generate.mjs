import { Generator, getConfig } from '@tanstack/router-generator';
import { fileURLToPath } from 'node:url';

for (const fixture of ['introductory-app', 'discovery-app', 'geology-app']) {
  const root = fileURLToPath(new URL(`../fixtures/${fixture}/`, import.meta.url));
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
}
