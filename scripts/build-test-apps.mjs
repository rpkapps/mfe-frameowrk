import { rspack } from '@rspack/core';
import { applications, configuration } from './test-app-config.mjs';
import './generate.mjs';

await Promise.all(
  applications.map(
    (app) =>
      new Promise((resolve, reject) => {
        const compiler = rspack(configuration(app, 'production'));
        compiler.run((error, stats) => {
          compiler.close((closeError) => {
            if (error || closeError) return reject(error ?? closeError);
            if (stats?.hasErrors())
              return reject(new Error(stats.toString({ all: false, errors: true })));
            console.log(`${app.id}: ${stats?.toString({ all: false, timings: true })}`);
            resolve();
          });
        });
      }),
  ),
);
