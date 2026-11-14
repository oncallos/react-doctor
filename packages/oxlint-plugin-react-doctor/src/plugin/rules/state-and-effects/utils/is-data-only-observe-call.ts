import { getStaticKeyName } from "../../../utils/get-static-key-name.js";
import { isSymbolReadOnly } from "../../../utils/is-symbol-read-only.js";
import { hasUnsupportedLexicalRuntime } from "../../../utils/has-unsupported-lexical-runtime.js";
import type { ScopeAnalysis } from "../../../semantic/scope-analysis.js";
import type { EsTreeNode } from "../../../utils/es-tree-node.js";
import { resolveStaticLocalCallFunction } from "../../../utils/get-order-independent-local-function.js";
import { isFunctionLike } from "../../../utils/is-function-like.js";
import { isNodeOfType } from "../../../utils/is-node-of-type.js";
import { stripParenExpression } from "../../../utils/strip-paren-expression.js";

export const isDataOnlyObserveCall = (call: EsTreeNode, scopes: ScopeAnalysis): boolean => {
  if (!isNodeOfType(call, "CallExpression") || hasUnsupportedLexicalRuntime(scopes)) return false;
  const callee = stripParenExpression(call.callee);
  if (
    !isNodeOfType(callee, "MemberExpression") ||
    callee.computed ||
    !isNodeOfType(callee.object, "Identifier")
  )
    return false;
  const receiver = scopes.symbolFor(callee.object);
  if (
    !receiver ||
    receiver.kind !== "const" ||
    !isNodeOfType(receiver.initializer, "ObjectExpression") ||
    receiver.declarationNode.parent?.parent?.type === "ExportNamedDeclaration" ||
    !receiver.references.every((reference) => {
      const member = reference.identifier.parent;
      return (
        reference.flag === "read" &&
        isNodeOfType(member, "MemberExpression") &&
        member.object === reference.identifier &&
        !member.computed &&
        isNodeOfType(member.property, "Identifier") &&
        member.property.name === "observe" &&
        isNodeOfType(member.parent, "CallExpression") &&
        member.parent.callee === member
      );
    })
  )
    return false;
  if (
    !receiver.initializer.properties.every((property) => {
      if (!isNodeOfType(property, "Property") || property.computed) return false;
      if (getStaticKeyName(property.key) !== "observe") return true;
      const propertyValue = stripParenExpression(property.value);
      if (isFunctionLike(propertyValue)) return true;
      if (!isNodeOfType(propertyValue, "Identifier")) return false;
      const binding = scopes.symbolFor(propertyValue);
      return Boolean(
        binding &&
        binding.kind === "const" &&
        isSymbolReadOnly(binding) &&
        isFunctionLike(binding.initializer),
      );
    })
  )
    return false;
  const implementation = resolveStaticLocalCallFunction(call, scopes);
  if (
    !isFunctionLike(implementation) ||
    implementation.async ||
    implementation.generator ||
    !implementation.params.every(
      (parameter) => isNodeOfType(parameter, "Identifier") && parameter.name !== "this",
    ) ||
    !isNodeOfType(implementation.body, "BlockStatement") ||
    call.arguments.some((argument) => isNodeOfType(argument, "SpreadElement"))
  )
    return false;
  return implementation.body.body.every((statement) => {
    if (isNodeOfType(statement, "EmptyStatement")) return true;
    if (isNodeOfType(statement, "ReturnStatement")) return !statement.argument;
    if (!isNodeOfType(statement, "ExpressionStatement")) return false;
    const assignment = stripParenExpression(statement.expression);
    if (
      !isNodeOfType(assignment, "AssignmentExpression") ||
      assignment.operator !== "=" ||
      !isNodeOfType(assignment.left, "Identifier")
    )
      return false;
    const target = scopes.symbolFor(assignment.left);
    if (!target || target.kind !== "let") return false;
    const value = stripParenExpression(assignment.right);
    if (!isNodeOfType(value, "Identifier")) return false;
    const parameterIndex = implementation.params.findIndex(
      (parameter) => scopes.symbolFor(parameter) === scopes.symbolFor(value),
    );
    if (parameterIndex < 0) return false;
    const argument = call.arguments[parameterIndex];
    return (
      !argument ||
      (isNodeOfType(argument, "Literal") &&
        !("regex" in argument) &&
        (argument.value === null ||
          ["string", "number", "boolean", "bigint"].includes(typeof argument.value)))
    );
  });
};
