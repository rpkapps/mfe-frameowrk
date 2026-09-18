import { findVariable, referencePath, unwrap } from '../bindings.js';

const browserRoots = new Set(['window', 'globalThis', 'self']);
const storageNames = new Set(['localStorage', 'sessionStorage']);

function storageName(path) {
  if (!path || path.kind !== 'global') return undefined;
  if (storageNames.has(path.name)) return path.name;
  if (browserRoots.has(path.name)) {
    let members = path.members;
    while (browserRoots.has(members[0])) members = members.slice(1);
    if (storageNames.has(members[0])) return members[0];
  }
  return undefined;
}

function isBrowserObject(path) {
  if (!path || path.kind !== 'global' || !browserRoots.has(path.name)) return false;
  return path.members.every((member) => browserRoots.has(member));
}

function isTypeQuery(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'TSTypeQuery') return true;
    if (!current.type.startsWith('TS')) return false;
    current = current.parent;
  }
  return false;
}

function staticPropertyName(node) {
  if (!node || node.type !== 'Property') return undefined;
  if (!node.computed && node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'Literal' && typeof node.key.value === 'string') {
    return node.key.value;
  }
  return undefined;
}

function hasVariableDefinition(sourceCode, node) {
  const variable = findVariable(sourceCode, node);
  return Boolean(variable?.defs.length);
}

function isStorageDestructure(sourceCode, pattern, init) {
  if (pattern.type !== 'ObjectPattern') return undefined;
  const sourcePath = referencePath(sourceCode, init);
  if (!isBrowserObject(sourcePath)) return undefined;
  for (const property of pattern.properties) {
    const name = staticPropertyName(property);
    if (storageNames.has(name)) return name;
  }
  return undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require framework storage handles instead of direct browser storage access.',
    },
    schema: [],
    messages: {
      storage:
        'Use the framework {{store}} storage handle. Direct browser {{browserStore}} bypasses framework namespacing, validation, and reactive notifications.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function report(node, store) {
      context.report({
        node,
        messageId: 'storage',
        data: {
          store: store === 'localStorage' ? 'local' : 'session',
          browserStore: store,
        },
      });
    }

    function checkPath(node) {
      const path = referencePath(sourceCode, node);
      const store = storageName(path);
      if (store) report(node, store);
    }

    function checkDestructuring(node, init) {
      const store = isStorageDestructure(sourceCode, node, init);
      if (store) report(node, store);
    }

    return {
      VariableDeclarator(node) {
        checkDestructuring(node.id, node.init);
      },
      AssignmentExpression(node) {
        checkDestructuring(unwrap(node.left), node.right);
      },
      MemberExpression(node) {
        if (isTypeQuery(node)) return;
        const path = referencePath(sourceCode, node);
        const store = storageName(path);
        if (!store) return;
        // Report the first member that reaches browser storage. Nested members
        // (window.localStorage.getItem) are part of the same access.
        const object = unwrap(node.object);
        if (object?.type === 'MemberExpression' && storageName(referencePath(sourceCode, object))) {
          return;
        }
        // The declaration that creates an alias is the actionable violation;
        // do not repeat it at every later use of that alias.
        if (
          object?.type === 'Identifier' &&
          storageName(referencePath(sourceCode, object)) &&
          hasVariableDefinition(sourceCode, object)
        ) {
          return;
        }
        report(node, store);
      },
      Identifier(node) {
        if (isTypeQuery(node)) return;
        // MemberExpression reports its object as one access. Static property
        // names are keys, not storage reads (computed identifiers remain reads).
        if (node.parent?.type === 'MemberExpression') {
          if (
            node.parent.object === node ||
            (!node.parent.computed && node.parent.property === node)
          ) {
            return;
          }
        }
        if (node.parent?.type === 'Property' && node.parent.key === node && !node.parent.computed) {
          return;
        }
        // A binding declaration is not itself a read. Its initializer or the
        // destructuring visitor reports the browser access instead.
        if (
          hasVariableDefinition(sourceCode, node) &&
          storageName(referencePath(sourceCode, node))
        ) {
          return;
        }
        checkPath(node);
      },
    };
  },
};
