import type { RsbuildPlugins } from '@rsbuild/core';
export interface ReactPluginOptions {
  readonly root?: string;
  readonly scope?: string;
}
export interface MfePluginOptions {
  readonly name?: string;
  readonly root?: string;
}
export function sharedReactPlugin(options?: ReactPluginOptions): RsbuildPlugins;
export function mfePlugin(options?: MfePluginOptions): RsbuildPlugins;
export function sharedDependencies(): Record<
  string,
  { singleton: true; strictVersion: true; requiredVersion: string; packageName?: string }
>;
