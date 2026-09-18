/** Peel off syntax that does not change the referenced value. */
export function unwrap(node) {
  while (
    node &&
    [
      'ChainExpression',
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
    ].includes(node.type)
  ) {
    node = node.expression;
  }
  return node;
}

export function propertyName(node) {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.property.type === 'Literal' && typeof node.property.value === 'string') {
    return node.property.value;
  }
  return undefined;
}

export function findVariable(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

/** Only follow aliases whose binding cannot have been reassigned. */
function aliasInitializer(variable) {
  if (variable.defs.length !== 1) return undefined;
  const definition = variable.defs[0];
  if (definition.type !== 'Variable' || !definition.node.init) return undefined;
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
    return undefined;
  }
  const declaration = definition.node;
  if (declaration.id.type === 'Identifier') return { node: declaration.init, suffix: [] };
  if (declaration.id.type !== 'ObjectPattern') return undefined;
  const property = declaration.id.properties.find(
    (candidate) => candidate.type === 'Property' && candidate.value === definition.name,
  );
  if (!property) return undefined;
  const key = property.computed ? property.key.value : (property.key.name ?? property.key.value);
  return typeof key === 'string' ? { node: declaration.init, suffix: [key] } : undefined;
}

/**
 * Resolve a static member path to its lexical origin. Mutable/dynamic aliases
 * intentionally remain unknown; treating every matching name as global is unsafe.
 */
export function referencePath(sourceCode, original, seen = new Set()) {
  const node = unwrap(original);
  if (!node) return undefined;
  if (node.type === 'MemberExpression') {
    const property = propertyName(node);
    const object = referencePath(sourceCode, node.object, seen);
    return object && property ? { ...object, members: [...object.members, property] } : undefined;
  }
  if (node.type !== 'Identifier') return undefined;
  const variable = findVariable(sourceCode, node);
  if (!variable || variable.defs.length === 0) {
    return { kind: 'global', name: node.name, members: [] };
  }
  if (seen.has(variable)) return undefined;
  const visited = new Set(seen).add(variable);
  const definition = variable.defs[0];
  if (definition.type === 'ImportBinding') {
    const specifier = definition.node;
    if (definition.parent.importKind === 'type' || specifier.importKind === 'type') {
      return undefined;
    }
    return {
      kind: 'import',
      source: definition.parent.source.value,
      name:
        specifier.type === 'ImportNamespaceSpecifier'
          ? '*'
          : specifier.type === 'ImportSpecifier'
            ? (specifier.imported.name ?? specifier.imported.value)
            : 'default',
      members: [],
    };
  }
  const alias = aliasInitializer(variable);
  if (!alias) return undefined;
  const origin = referencePath(sourceCode, alias.node, visited);
  return origin ? { ...origin, members: [...origin.members, ...alias.suffix] } : undefined;
}
