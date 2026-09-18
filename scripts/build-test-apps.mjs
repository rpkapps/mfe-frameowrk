import { join } from 'node:path';
import { createRsbuild } from '@rsbuild/core';
import { applications, configuration, workspace } from './test-app-config.mjs';
import './generate.mjs';

await Promise.all(
  applications.map(async (app) => {
    const rsbuild = await createRsbuild({
      cwd: join(workspace, 'fixtures', app.directory),
      rsbuildConfig: configuration(app, 'production'),
    });
    await rsbuild.build();
    console.log(`${app.id}: production build complete`);
  }),
);
