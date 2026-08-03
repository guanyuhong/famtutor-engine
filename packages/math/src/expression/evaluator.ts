import { MathEngineError } from "../errors.js";
import {
  angleAt,
  distance,
  dot,
  isAngle,
  isCircle,
  isLine,
  isPoint,
  isPolygon,
  isRay,
  isSegment,
  isVector,
  lineLikeToLine,
  norm,
  polygonArea,
  slope,
  valueLength
} from "../kernel/geometry.js";
import type { RuntimeValue } from "../types.js";
import type { ExpressionNode } from "./ast.js";
import { parseExpression } from "./parser.js";

export type ExpressionRuntimeValue = RuntimeValue | undefined;
export type IdentifierResolver = (name: string) => ExpressionRuntimeValue;

const NUMERIC_BUILTINS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  pow: Math.pow,
  hypot: Math.hypot
};

export const SAFE_BUILTIN_NAMES = Object.freeze([
  ...Object.keys(NUMERIC_BUILTINS),
  "distance",
  "length",
  "radius",
  "x",
  "xcoord",
  "y",
  "ycoord",
  "angle",
  "dot",
  "norm",
  "slope",
  "area",
  "value"
]);

function requireNumber(value: ExpressionRuntimeValue, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MathEngineError("EXPRESSION_TYPE_ERROR", `${context} requires a finite numeric value.`, {
      actual: typeof value === "number" ? value : String((value as { kind?: string } | undefined)?.kind ?? typeof value)
    });
  }
  return value;
}

function requireBoolean(value: ExpressionRuntimeValue, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new MathEngineError("EXPRESSION_TYPE_ERROR", `${context} requires a boolean value.`, {
      actual: String(typeof value)
    });
  }
  return value;
}

function compareEquality(left: ExpressionRuntimeValue, right: ExpressionRuntimeValue): boolean {
  if (typeof left === "number" && typeof right === "number") return left === right;
  if (typeof left === "boolean" && typeof right === "boolean") return left === right;
  return left === right;
}

function evaluateCall(name: string, args: ExpressionRuntimeValue[]): ExpressionRuntimeValue {
  const lowered = name.toLowerCase();
  // Never resolve built-ins through Object.prototype (for example
  // `constructor`, `toString`, or `__proto__`). Only explicitly registered
  // own properties are callable.
  const numeric = Object.prototype.hasOwnProperty.call(NUMERIC_BUILTINS, lowered)
    ? NUMERIC_BUILTINS[lowered]
    : undefined;
  if (numeric) {
    const values = args.map((value, index) => requireNumber(value, `${name} argument ${index + 1}`));
    const result = numeric(...values);
    if (!Number.isFinite(result)) {
      throw new MathEngineError("EXPRESSION_DOMAIN_ERROR", `${name} produced a non-finite value.`, {
        actual: result
      });
    }
    return result;
  }

  if (lowered === "distance") {
    if (args.length !== 2 || !isPoint(args[0]) || !isPoint(args[1])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "distance() requires two point2 arguments.");
    }
    return distance(args[0], args[1]);
  }
  if (lowered === "length") {
    if (args.length !== 1 || args[0] === undefined || typeof args[0] === "boolean") {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "length() requires one measurable argument.");
    }
    return valueLength(args[0]);
  }
  if (lowered === "radius") {
    if (args.length !== 1 || !isCircle(args[0])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "radius() requires one circle2 argument.");
    }
    return args[0].radius;
  }
  if (lowered === "x" || lowered === "xcoord") {
    if (args.length !== 1 || !isPoint(args[0])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", `${name}() requires one point2 argument.`);
    }
    return args[0].x;
  }
  if (lowered === "y" || lowered === "ycoord") {
    if (args.length !== 1 || !isPoint(args[0])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", `${name}() requires one point2 argument.`);
    }
    return args[0].y;
  }
  if (lowered === "angle") {
    if (args.length !== 3 || !isPoint(args[0]) || !isPoint(args[1]) || !isPoint(args[2])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "angle() requires three point2 arguments.");
    }
    return angleAt(args[0], args[1], args[2]);
  }
  if (lowered === "dot") {
    if (args.length !== 2 || !isVector(args[0]) || !isVector(args[1])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "dot() requires two vector2 arguments.");
    }
    return dot(args[0], args[1]);
  }
  if (lowered === "norm") {
    if (args.length !== 1 || !isVector(args[0])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "norm() requires one vector2 argument.");
    }
    return norm(args[0]);
  }
  if (lowered === "slope") {
    if (args.length !== 1 || args[0] === undefined || typeof args[0] === "number" || typeof args[0] === "boolean") {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "slope() requires a line-like argument.");
    }
    if (!isLine(args[0]) && !isSegment(args[0]) && !isRay(args[0])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "slope() requires a line2, segment2 or ray2 argument.");
    }
    return slope(args[0]);
  }
  if (lowered === "area") {
    if (args.length !== 1 || !isPolygon(args[0])) {
      throw new MathEngineError("EXPRESSION_TYPE_ERROR", "area() requires one polygon2 argument.");
    }
    return polygonArea(args[0]);
  }
  if (lowered === "value") {
    if (args.length !== 1) throw new MathEngineError("EXPRESSION_TYPE_ERROR", "value() requires one argument.");
    if (typeof args[0] === "number" || typeof args[0] === "boolean") return args[0];
    if (isAngle(args[0])) return args[0].radians;
    if (isCircle(args[0])) return args[0].radius;
    throw new MathEngineError("EXPRESSION_TYPE_ERROR", "value() cannot convert this entity to a scalar.");
  }

  throw new MathEngineError("EXPRESSION_UNKNOWN_FUNCTION", `Unknown function '${name}'.`, {
    actual: name,
    expected: [...SAFE_BUILTIN_NAMES]
  });
}

export function evaluateExpressionAst(node: ExpressionNode, resolve: IdentifierResolver): ExpressionRuntimeValue {
  if (node.type === "number" || node.type === "boolean") return node.value;
  if (node.type === "identifier") {
    const lowered = node.name.toLowerCase();
    if (lowered === "pi") return Math.PI;
    if (lowered === "e") return Math.E;
    const resolved = resolve(node.name);
    if (resolved === undefined) {
      throw new MathEngineError("EXPRESSION_UNKNOWN_IDENTIFIER", `Unknown or undefined identifier '${node.name}'.`, {
        path: `expression[${node.start}:${node.end}]`,
        actual: node.name
      });
    }
    return resolved;
  }
  if (node.type === "unary") {
    const value = evaluateExpressionAst(node.argument, resolve);
    if (node.operator === "!") return !requireBoolean(value, "Unary '!'");
    const numeric = requireNumber(value, `Unary '${node.operator}'`);
    return node.operator === "-" ? -numeric : numeric;
  }
  if (node.type === "binary") {
    if (node.operator === "&&") {
      const left = requireBoolean(evaluateExpressionAst(node.left, resolve), "'&&' left operand");
      return left ? requireBoolean(evaluateExpressionAst(node.right, resolve), "'&&' right operand") : false;
    }
    if (node.operator === "||") {
      const left = requireBoolean(evaluateExpressionAst(node.left, resolve), "'||' left operand");
      return left ? true : requireBoolean(evaluateExpressionAst(node.right, resolve), "'||' right operand");
    }
    const left = evaluateExpressionAst(node.left, resolve);
    const right = evaluateExpressionAst(node.right, resolve);
    if (node.operator === "==") return compareEquality(left, right);
    if (node.operator === "!=") return !compareEquality(left, right);
    const leftNumber = requireNumber(left, `Operator '${node.operator}' left operand`);
    const rightNumber = requireNumber(right, `Operator '${node.operator}' right operand`);
    let result: number | boolean;
    switch (node.operator) {
      case "+": result = leftNumber + rightNumber; break;
      case "-": result = leftNumber - rightNumber; break;
      case "*": result = leftNumber * rightNumber; break;
      case "/":
        if (rightNumber === 0) throw new MathEngineError("EXPRESSION_DIVISION_BY_ZERO", "Division by zero.");
        result = leftNumber / rightNumber;
        break;
      case "^": result = leftNumber ** rightNumber; break;
      case "<": result = leftNumber < rightNumber; break;
      case "<=": result = leftNumber <= rightNumber; break;
      case ">": result = leftNumber > rightNumber; break;
      case ">=": result = leftNumber >= rightNumber; break;
      default: throw new MathEngineError("EXPRESSION_OPERATOR_ERROR", `Unsupported operator '${node.operator}'.`);
    }
    if (typeof result === "number" && !Number.isFinite(result)) {
      throw new MathEngineError("EXPRESSION_DOMAIN_ERROR", `Operator '${node.operator}' produced a non-finite value.`, {
        actual: result
      });
    }
    return result;
  }
  const args = node.arguments.map(argument => evaluateExpressionAst(argument, resolve));
  return evaluateCall(node.callee, args);
}

export function evaluateExpression(source: string, resolve: IdentifierResolver): ExpressionRuntimeValue {
  return evaluateExpressionAst(parseExpression(source), resolve);
}

export function evaluateNumericExpression(source: string | number, resolve: IdentifierResolver): number {
  if (typeof source === "number") {
    if (!Number.isFinite(source)) throw new MathEngineError("EXPRESSION_NON_FINITE", "Numeric value must be finite.");
    return source;
  }
  return requireNumber(evaluateExpression(source, resolve), "Expression result");
}

export function evaluateBooleanExpression(source: string, resolve: IdentifierResolver): boolean {
  return requireBoolean(evaluateExpression(source, resolve), "Expression result");
}

export function runtimeLineValue(value: RuntimeValue): ReturnType<typeof lineLikeToLine> {
  return lineLikeToLine(value);
}
