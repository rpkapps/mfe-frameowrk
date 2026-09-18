import type { Compiler, RuleSetRule } from '@rspack/core';

export interface ReactBuildOptions {
  /** Absolute application directory, containing src/. */
  readonly root: string;
  /** Omit for the shell; remotes use their public App id. */
  readonly scope?: string;
}

export interface MfePluginOptions {
  /** Defaults to the unscoped package name. */
  readonly name?: string;
  /** Defaults to Rspack's context. */
  readonly root?: string;
}

export function reactBuild(options: ReactBuildOptions): RuleSetRule[];
export function sharedDependencies(): Record<
  string,
  {
    singleton: true;
    strictVersion: true;
    requiredVersion: string;
    packageName?: string;
  }
>;
export function mfePlugin(options?: MfePluginOptions): {
  readonly name: string;
  apply(compiler: Compiler): void;
};
