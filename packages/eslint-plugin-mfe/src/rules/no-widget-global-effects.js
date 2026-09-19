/**
 * Guard the small set of browser-owned effects that Widgets are not allowed
 * to perform. This is deliberately syntax based: the author preset enables it
 * only for an explicit Widget source glob supplied by the project.
 */
const historyMethods = new Set(['pushState', 'replaceState', 'go', 'back', 'forward']);
const metaMethods = new Set(['setAttribute', 'removeAttribute', 'appendChild', 'replaceChildren']);

function propertyName(node) {
  if (!node || node.type !== 'MemberExpression' || node.computed) return node?.property?.name;
  return (
    node.property?.name ?? (node.property?.type === 'Literal' ? node.property.value : undefined)
  );
}

function rootName(node) {
  let current = node;
  while (current?.type === 'MemberExpression') current = current.object;
  return current?.type === 'Identifier' ? current.name : undefined;
}

function isHistory(node) {
  if (!node || node.type !== 'MemberExpression') return false;
  const name = propertyName(node);
  if (name !== 'history') return false;
  return (
    rootName(node) === 'window' || rootName(node) === 'globalThis' || rootName(node) === 'self'
  );
}

function isHistoryObject(node) {
  return node?.type === 'Identifier' && node.name === 'history';
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow browser-global navigation and document metadata effects in Widgets.',
    },
    schema: [],
    messages: {
      navigation:
        'Widgets must not mutate browser history or navigation state; use the mount navigation contract.',
      metadata:
        'Widgets must not mutate document title, metadata, or favicon; request this through the host contract.',
    },
  },
  create(context) {
    function isUnshadowed(node, name) {
      if (node?.type !== 'Identifier' || node.name !== name) return false;
      let scope = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set?.get(name);
        if (variable) return variable.defs.length === 0;
        scope = scope.upper;
      }
      return true;
    }
    function isGlobalHistoryObject(node) {
      return isHistoryObject(node) && isUnshadowed(node, 'history');
    }
    function isGlobalHistory(node) {
      if (!isHistory(node)) return false;
      let root = node;
      while (root?.type === 'MemberExpression') root = root.object;
      return isUnshadowed(root, root.name);
    }
    function isGlobalDocument(node) {
      if (node?.type !== 'Identifier' || node.name !== 'document') return false;
      return isUnshadowed(node, 'document');
    }
    const report = (node, messageId) => context.report({ node, messageId });
    return {
      AssignmentExpression(node) {
        const left = node.left;
        if (
          left.type === 'MemberExpression' &&
          ((isGlobalHistory(left.object) && historyMethods.has(propertyName(left))) ||
            (isGlobalHistoryObject(left.object) && historyMethods.has(propertyName(left))))
        )
          report(node, 'navigation');
        if (left.type !== 'MemberExpression') return;
        const name = propertyName(left);
        const root = rootName(left);
        if (
          root === 'document' &&
          isGlobalDocument(left.object) &&
          (name === 'title' || name === 'cookie' || name === 'favicon')
        )
          report(node, 'metadata');
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        const method = propertyName(callee);
        if (
          (isGlobalHistory(callee.object) || isGlobalHistoryObject(callee.object)) &&
          historyMethods.has(method)
        )
          report(node, 'navigation');
        const owner = callee.object;
        if (
          owner.type === 'MemberExpression' &&
          isGlobalDocument(owner.object) &&
          (propertyName(owner) === 'head' || propertyName(owner) === 'documentElement') &&
          metaMethods.has(method)
        )
          report(node, 'metadata');
      },
    };
  },
};
