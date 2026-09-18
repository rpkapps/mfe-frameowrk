import { referencePath } from '../bindings.js';

const definitionFactories = new Set(['createApp', 'createWidget', 'lazyWidget']);
const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Keep framework definitions and lazy components at module scope.' },
    schema: [],
    messages: {
      unstable:
        'Move {{name}} to module scope. Creating a definition or lazy component inside a function can recreate its identity on rendering; pass changing data through the documented mount inputs.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const reference = referencePath(context.sourceCode, node.callee);
        if (reference?.kind !== 'import' || reference.source !== '@company/mfe-react') return;
        const name = reference.name === '*' ? reference.members[0] : reference.name;
        const expectedMembers = reference.name === '*' ? 1 : 0;
        if (reference.members.length !== expectedMembers || !definitionFactories.has(name)) return;
        if (
          !context.sourceCode
            .getAncestors(node)
            .some((ancestor) => functionTypes.has(ancestor.type))
        ) {
          return;
        }
        context.report({ node, messageId: 'unstable', data: { name } });
      },
    };
  },
};
