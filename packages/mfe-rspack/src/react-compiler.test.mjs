import { createRequire } from 'node:module';
import { transformAsync } from '@babel/core';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);

it('compiles typed components with default destructured props before TSX is erased', async () => {
  const events = [];
  const result = await transformAsync(
    'export function Example({name = "Orion"}: {name?: string}) { return <p>{name}</p>; }',
    {
      filename: 'example.tsx',
      configFile: false,
      babelrc: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [
        [
          require.resolve('babel-plugin-react-compiler'),
          { target: '19', logger: { logEvent: (_filename, event) => events.push(event) } },
        ],
      ],
    },
  );

  expect(events.some((event) => event.kind === 'CompileSuccess')).toBe(true);
  expect(events.filter((event) => event.kind === 'CompileError')).toEqual([]);
  expect(result.code).toContain('from "react/compiler-runtime"');
  expect(result.code).toContain('<p>');
});
