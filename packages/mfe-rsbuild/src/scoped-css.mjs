import postcss from 'postcss';

const supportedRules = new Set([
  'container',
  'keyframes',
  '-webkit-keyframes',
  'layer',
  'media',
  'property',
  'scope',
  'starting-style',
  'supports',
]);

export function assertScope(scope) {
  if (typeof scope !== 'string' || !/^[a-z][a-z0-9-]*$/.test(scope)) {
    throw new Error(
      'The MFE scope must start with a lowercase letter and contain only a-z, 0-9, or -.',
    );
  }
}

/** Runs after Tailwind, so generated utilities and authored CSS share a boundary. */
export function scopedCss(scope) {
  assertScope(scope);
  return {
    postcssPlugin: 'mfe-scoped-css',
    OnceExit(root) {
      const keyframes = new Map();
      const properties = new Map();
      root.walkAtRules((rule) => {
        if (!supportedRules.has(rule.name)) {
          throw rule.error(
            `@${rule.name} is not supported inside an MFE. Global CSS belongs to the shell.`,
          );
        }
        if (rule.name.endsWith('keyframes')) {
          if (!/^[a-zA-Z_][\w-]*$/.test(rule.params)) {
            throw rule.error('MFE keyframes require an unquoted CSS identifier.');
          }
          keyframes.set(rule.params, `mfe-${scope}-${rule.params}`);
        }
        if (rule.name === 'property') {
          // Tailwind registrations are global by CSS design. Give both their
          // registrations and uses an MFE namespace; shell tokens stay intact.
          if (!/^--tw-[\w-]+$/.test(rule.params)) {
            throw rule.error(
              'Only generated Tailwind @property declarations are supported in MFEs.',
            );
          }
          properties.set(rule.params, `--mfe-${scope}-${rule.params.slice(2)}`);
        }
      });
      root.walkRules((rule) => {
        if (/(^|[\s,>+~])(?:html|body)(?=[:.#\s,>+~[]|$)|:root\b/.test(rule.selector)) {
          throw rule.error(
            'MFE styles cannot select html, body, or :root. Import global styles in the shell only.',
          );
        }
      });
      const renameProperties = (value) =>
        value.replace(/--tw-[\w-]+/g, (name) => properties.get(name) ?? name);
      root.walkDecls((declaration) => {
        declaration.prop = properties.get(declaration.prop) ?? declaration.prop;
        declaration.value = renameProperties(declaration.value);
        if (
          /^(?:-webkit-)?animation(?:-name)?$/.test(declaration.prop) ||
          declaration.prop.startsWith('--animate-')
        ) {
          declaration.value = declaration.value.replace(
            /\b[a-zA-Z_][\w-]*\b/g,
            (name) => keyframes.get(name) ?? name,
          );
        }
      });
      root.walkAtRules((rule) => {
        if (rule.name.endsWith('keyframes')) rule.params = keyframes.get(rule.params);
        else rule.params = renameProperties(rule.params);
      });
      const boundary = postcss.atRule({
        name: 'scope',
        params: `([data-mfe-scope="${scope}"]) to ([data-mfe-scope])`,
      });
      // Registered properties must remain top-level, with their namespaced names.
      const registrations = [];
      root.walkAtRules('property', (rule) => {
        registrations.push(rule.clone());
        rule.remove();
      });
      boundary.append(root.nodes);
      root.removeAll();
      root.append(...registrations, boundary);
    },
  };
}
