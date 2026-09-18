import { referencePath, unwrap } from '../bindings.js';

const browserRoots = new Set(['window', 'globalThis', 'self']);
const historyMethods = new Set(['pushState', 'replaceState', 'back', 'forward', 'go']);
const listenerMethods = new Set(['addEventListener', 'removeEventListener']);

function protectedPath(path) {
  if (!path || path.kind !== 'global') return false;
  let parts = [path.name, ...path.members];
  while (browserRoots.has(parts[0])) {
    if (parts.length === 2 && (parts[1] === 'fetch' || listenerMethods.has(parts[1]))) {
      return true;
    }
    parts = parts.slice(1);
  }
  if (parts.length === 1 && (parts[0] === 'fetch' || listenerMethods.has(parts[0]))) {
    return true;
  }
  if (parts.length === 2 && parts[0] === 'history') return historyMethods.has(parts[1]);
  if (parts.length === 2 && parts[0] === 'document') return listenerMethods.has(parts[1]);
  if (parts.length !== 3 || parts[1] !== 'prototype') return false;
  if (parts[0] === 'History') return historyMethods.has(parts[2]);
  return ['EventTarget', 'Window', 'Document'].includes(parts[0]) && listenerMethods.has(parts[2]);
}

function ownPropertyName(property) {
  if (property.type !== 'Property') return undefined;
  if (!property.computed && property.key.type === 'Identifier') return property.key.name;
  return property.key.type === 'Literal' && typeof property.key.value === 'string'
    ? property.key.value
    : undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Prevent replacement of shared browser APIs.' },
    schema: [],
    messages: {
      patch:
        'Do not replace {{target}}. Use the explicit navigation/request service or an owned event subscription; global patches affect every mounted application.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    function report(node, path) {
      if (!protectedPath(path)) return;
      context.report({
        node,
        messageId: 'patch',
        data: { target: [path.name, ...path.members].join('.') },
      });
    }
    function checkAssignment(node) {
      const target = unwrap(node);
      if (!target) return;
      if (target.type === 'ObjectPattern') {
        for (const property of target.properties) {
          checkAssignment(property.type === 'RestElement' ? property.argument : property.value);
        }
        return;
      }
      if (target.type === 'ArrayPattern') {
        for (const element of target.elements) checkAssignment(element);
        return;
      }
      if (target.type === 'AssignmentPattern') {
        checkAssignment(target.left);
        return;
      }
      if (target.type === 'RestElement') {
        checkAssignment(target.argument);
        return;
      }
      // Assigning a local alias changes that variable, not the shared API.
      if (target.type === 'Identifier') {
        const path = referencePath(sourceCode, target);
        if (path?.name !== target.name || path.members.length > 0) return;
        report(target, path);
        return;
      }
      report(target, referencePath(sourceCode, target));
    }
    return {
      AssignmentExpression(node) {
        checkAssignment(node.left);
      },
      UpdateExpression(node) {
        checkAssignment(node.argument);
      },
      UnaryExpression(node) {
        if (node.operator === 'delete') checkAssignment(node.argument);
      },
      CallExpression(node) {
        const callee = referencePath(sourceCode, node.callee);
        if (!callee || callee.kind !== 'global' || !['Object', 'Reflect'].includes(callee.name)) {
          return;
        }
        const method = callee.members[0];
        const methods =
          callee.name === 'Object'
            ? ['defineProperty', 'defineProperties', 'assign']
            : ['defineProperty', 'set'];
        if (callee.members.length !== 1 || !methods.includes(method)) {
          return;
        }
        const target = referencePath(sourceCode, node.arguments[0]);
        if (!target) return;
        if (method === 'defineProperty' || method === 'set') {
          const property = node.arguments[1];
          if (property?.type === 'Literal' && typeof property.value === 'string') {
            report(node, { ...target, members: [...target.members, property.value] });
          }
          return;
        }
        for (const argument of node.arguments.slice(1)) {
          if (argument.type !== 'ObjectExpression') continue;
          for (const property of argument.properties) {
            const name = ownPropertyName(property);
            if (name) report(property, { ...target, members: [...target.members, name] });
          }
        }
      },
    };
  },
};
