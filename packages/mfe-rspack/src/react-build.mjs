import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/postcss';
import { scopedCss } from './scoped-css.mjs';

const require = createRequire(import.meta.url);
const adapterSource = fileURLToPath(new URL('../../mfe-react/src/', import.meta.url));

function below(file, directory) {
  return file.startsWith(`${directory}${path.sep}`);
}

function reportCompilerEvent(filename, event) {
  if (!['CompileError', 'CompileSkip', 'PipelineError'].includes(event.kind)) return;
  const reason = event.reason ?? event.detail?.reason ?? event.data ?? event.kind;
  const line = event.fnLoc?.start.line ?? 1;
  console.warn(`[React Compiler] ${filename ?? 'unknown source'}:${line}: ${reason}`);
}

/** Ordinary rules shared by the shell and plugin; Babel sees TSX before SWC. */
export function reactBuild({ root, scope }) {
  const source = path.resolve(root, 'src');
  const isReactSource = (file) =>
    below(file, source) ||
    below(file, adapterSource.replace(/[\\/]$/, '')) ||
    /[\\/](?:@tecton[\\/]react|tecton-react)[\\/]src[\\/]/.test(file);
  const swc = {
    loader: 'builtin:swc-loader',
    options: {
      sourceMaps: true,
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', tsx: true },
        transform: { react: { runtime: 'automatic' } },
      },
    },
  };
  return [
    {
      test: /\.[cm]?[jt]sx?$/,
      oneOf: [
        {
          include: isReactSource,
          use: [
            swc,
            {
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                sourceMaps: true,
                cacheDirectory: path.resolve(root, '.mfe/babel'),
                parserOpts: { plugins: ['typescript', 'jsx'] },
                plugins: [
                  [
                    require.resolve('babel-plugin-react-compiler'),
                    { target: '19', logger: { logEvent: reportCompilerEvent } },
                  ],
                ],
              },
            },
          ],
        },
        { exclude: /node_modules/, use: [swc] },
      ],
    },
    {
      test: /\.css$/,
      type: 'css/auto',
      use: [
        {
          loader: require.resolve('postcss-loader'),
          options: {
            sourceMap: true,
            postcssOptions: {
              plugins: [
                tailwind({ base: root, optimize: false }),
                ...(scope ? [scopedCss(scope)] : []),
              ],
            },
          },
        },
      ],
    },
    { test: /\.(woff2?|ttf|otf|png|jpe?g|svg)$/i, type: 'asset/resource' },
  ];
}
