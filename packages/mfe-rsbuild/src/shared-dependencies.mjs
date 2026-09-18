const versions = {
  react: '19.3.0',
  'react-dom': '19.3.0',
  '@tanstack/history': '1.162.4',
  '@tanstack/react-router': '1.170.38',
  '@tanstack/react-query': '5.103.1',
  '@company/mfe-react': '0.0.0',
  'react-aria': '3.52.1',
  'react-aria-components': '1.21.1',
};

/** The shell and every remote use one exact compatibility set. */
export function sharedDependencies() {
  const shared = Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [
      name,
      { singleton: true, strictVersion: true, requiredVersion: version },
    ]),
  );
  for (const subpath of ['jsx-runtime', 'jsx-dev-runtime', 'compiler-runtime']) {
    shared[`react/${subpath}`] = {
      singleton: true,
      strictVersion: true,
      requiredVersion: versions.react,
      packageName: 'react',
    };
  }
  shared['react-dom/client'] = {
    singleton: true,
    strictVersion: true,
    requiredVersion: versions['react-dom'],
    packageName: 'react-dom',
  };
  // The facade and adapter can be supplied by different containers. Sharing the
  // context module itself preserves provider/hook identity across either one.
  shared['@company/mfe-react/internal/shell-state-context'] = {
    singleton: true,
    strictVersion: true,
    requiredVersion: versions['@company/mfe-react'],
    packageName: '@company/mfe-react',
  };
  // A trailing slash includes the component and provider subpath exports.
  shared['@tecton/react/'] = {
    singleton: true,
    strictVersion: true,
    requiredVersion: '0.0.0-local.8b1aa66c',
    packageName: '@tecton/react',
  };
  return shared;
}
