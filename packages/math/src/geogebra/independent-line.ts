/** Compile a proven independent affine equation, never its cached coordinates.
 * This is syntax lowering into the existing line primitive, not a second kernel.
 */
import type { ExpressionNode } from "../expression/ast.js";
import { parseExpression, collectExpressionIdentifiers } from "../expression/parser.js";
import { evaluateExpressionAst } from "../expression/evaluator.js";
import { ggbFail } from "./xml.js";

type Affine = readonly [number, number, number];
const constant = (p: Affine): boolean => p[0] === 0 && p[1] === 0;
function finite(p: Affine): Affine {
  if (!p.every(Number.isFinite)) ggbFail("LINE_EQUATION_UNSUPPORTED", "Nonfinite line coefficients.");
  return p;
}
function affine(node: ExpressionNode): Affine {
  const ids = collectExpressionIdentifiers(node);
  if ([...ids].some(n => !["x", "y", "pi", "e"].includes(n))) {
    ggbFail("LINE_EQUATION_DEPENDENCY_UNSUPPORTED", "Dependent line equations require dynamic coefficient lowering; cached coefficients are not used.");
  }
  if (!ids.has("x") && !ids.has("y")) {
    const value = evaluateExpressionAst(node, () => undefined);
    if (typeof value !== "number") ggbFail("LINE_EQUATION_UNSUPPORTED", "A coefficient must be numeric.");
    return finite([0, 0, value]);
  }
  if (node.type === "identifier") return node.name === "x" ? [1, 0, 0] : [0, 1, 0];
  if (node.type === "unary" && ["+", "-"].includes(node.operator)) {
    const a = affine(node.argument), sign = node.operator === "-" ? -1 : 1;
    return finite([sign*a[0], sign*a[1], sign*a[2]]);
  }
  if (node.type === "binary") {
    const a = affine(node.left), b = affine(node.right);
    if (node.operator === "+" || node.operator === "-") {
      const s = node.operator === "+" ? 1 : -1;
      return finite([a[0]+s*b[0], a[1]+s*b[1], a[2]+s*b[2]]);
    }
    if (node.operator === "*" && (constant(a) || constant(b))) {
      const factor = constant(a) ? a[2] : b[2], p = constant(a) ? b : a;
      return finite([p[0]*factor, p[1]*factor, p[2]*factor]);
    }
    if (node.operator === "/" && constant(b) && b[2] !== 0) {
      return finite([a[0]/b[2], a[1]/b[2], a[2]/b[2]]);
    }
  }
  return ggbFail("LINE_EQUATION_UNSUPPORTED", "Only independent affine equations are supported; no sampling or saved-coordinate fallback.");
}
export function independentLineCoefficients(left: string, right: string): Affine {
  const a = affine(parseExpression(left)), b = affine(parseExpression(right));
  const p = finite([a[0]-b[0], a[1]-b[1], a[2]-b[2]]);
  if (p[0] === 0 && p[1] === 0) ggbFail("DEGENERATE_LINE", "Equation has no nonzero line normal.");
  return p;
}
