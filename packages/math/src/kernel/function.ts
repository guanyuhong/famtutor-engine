import { MathEngineError } from "../errors.js";
import { evaluateNumericExpression, type IdentifierResolver } from "../expression/evaluator.js";
import type { Function1Value, FunctionBranchValue, FunctionInequalityRegion2Value, Point2Value, RuntimeValue } from "../types.js";
import { finiteNumber } from "../util.js";

export function isFunction1(value: RuntimeValue | unknown): value is Function1Value {
  return Boolean(value && typeof value === "object" && (value as Function1Value).kind === "function1");
}

/** Build a bounded piecewise function with explicit endpoint membership. */
export function piecewiseFunction(rawBranches: unknown): Function1Value {
  if (!Array.isArray(rawBranches) || rawBranches.length < 1 || rawBranches.length > 16) {
    throw new MathEngineError("PIECEWISE_INVALID_BRANCHES", "function.piecewise requires 1 to 16 branches.", { actual: Array.isArray(rawBranches) ? { count: rawBranches.length } : { type: typeof rawBranches } });
  }
  const branches: FunctionBranchValue[] = rawBranches.map((raw, index): FunctionBranchValue => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new MathEngineError("PIECEWISE_INVALID_BRANCH", "Each function.piecewise branch must be an object.", { actual: { index } });
    }
    const branch = raw as Record<string, unknown>;
    const domain = branch.domain;
    if (typeof branch.expression !== "string" || branch.expression.trim().length === 0 || !Array.isArray(domain) || domain.length !== 2 || !finiteNumber(domain[0]) || !finiteNumber(domain[1]) || domain[0] >= domain[1]) {
      throw new MathEngineError("PIECEWISE_INVALID_BRANCH", "Each function.piecewise branch requires a non-empty expression and finite increasing domain.", { actual: { index } });
    }
    if (branch.lowerClosed !== undefined && typeof branch.lowerClosed !== "boolean" || branch.upperClosed !== undefined && typeof branch.upperClosed !== "boolean") {
      throw new MathEngineError("PIECEWISE_INVALID_ENDPOINT", "Piecewise endpoint flags must be boolean.", { actual: { index } });
    }
    return {
      expression: branch.expression,
      domain: [domain[0], domain[1]] as [number, number],
      lowerClosed: branch.lowerClosed === undefined ? true : branch.lowerClosed,
      upperClosed: branch.upperClosed === undefined ? true : branch.upperClosed
    };
  }).sort((left, right) => left.domain[0] - right.domain[0]);
  for (let index = 1; index < branches.length; index += 1) {
    const previous = branches[index - 1]!;
    const current = branches[index]!;
    if (current.domain[0] < previous.domain[1] || current.domain[0] === previous.domain[1] && current.lowerClosed && previous.upperClosed) {
      throw new MathEngineError("PIECEWISE_OVERLAPPING_BRANCHES", "function.piecewise branches must not overlap or both include a shared endpoint.", { actual: { previousDomain: previous.domain, currentDomain: current.domain } });
    }
  }
  return { kind: "function1", expression: "<piecewise>", domain: [branches[0]!.domain[0], branches.at(-1)!.domain[1]], branches };
}

export function functionInequalityRegion(
  boundary: Function1Value,
  relation: "above" | "below",
  domain: [number, number],
  boundaryIncluded = true
): FunctionInequalityRegion2Value {
  const [from, to] = domain;
  if (!finiteNumber(from) || !finiteNumber(to) || from >= to) {
    throw new MathEngineError("FUNCTION_REGION_INVALID_DOMAIN", "region.function_inequality requires a finite increasing domain [from,to].", { actual: domain });
  }
  if (from < boundary.domain[0] || to > boundary.domain[1]) {
    throw new MathEngineError("FUNCTION_REGION_OUTSIDE_DOMAIN", "region.function_inequality domain must lie inside the boundary function domain.", {
      expected: boundary.domain,
      actual: domain
    });
  }
  return { kind: "region2", boundary, relation, domain, boundaryIncluded };
}

/** Evaluate a function entity at x while preserving its captured document dependencies. */
export function functionValueAt(
  value: Function1Value,
  x: number,
  resolve: IdentifierResolver
): number {
  if (!finiteNumber(x)) {
    throw new MathEngineError("FUNCTION_INPUT_NOT_FINITE", "function.value_at requires a finite scalar input.", {
      actual: x
    });
  }
  const [lower, upper] = value.domain;
  if (x < lower || x > upper) {
    throw new MathEngineError("FUNCTION_INPUT_OUTSIDE_DOMAIN", "function.value_at input lies outside the function domain.", {
      expected: value.domain,
      actual: x
    });
  }
  if (value.branches) {
    const branch = value.branches.find(candidate => {
      const aboveLower = x > candidate.domain[0] || x === candidate.domain[0] && candidate.lowerClosed;
      const belowUpper = x < candidate.domain[1] || x === candidate.domain[1] && candidate.upperClosed;
      return aboveLower && belowUpper;
    });
    if (!branch) {
      throw new MathEngineError("FUNCTION_INPUT_OUTSIDE_BRANCHES", "function.value_at input is not contained in any piecewise branch.", { actual: x });
    }
    return evaluateNumericExpression(branch.expression, name => name === "x" ? x : resolve(name));
  }
  return evaluateNumericExpression(value.expression, name => name === "x" ? x : resolve(name));
}

/** Find one function root inside a closed sign-changing bracket. */
export function functionRootInInterval(
  value: Function1Value,
  bracket: [number, number],
  resolve: IdentifierResolver,
  tolerance = 1e-9,
  maxIterations = 80
): Point2Value {
  const [from, to] = bracket;
  if (!finiteNumber(from) || !finiteNumber(to) || from >= to) {
    throw new MathEngineError("FUNCTION_ROOT_INVALID_BRACKET", "point.function_root requires a finite increasing bracket [from,to].", {
      actual: bracket
    });
  }
  if (!finiteNumber(tolerance) || tolerance <= 0 || !Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 256) {
    throw new MathEngineError("FUNCTION_ROOT_INVALID_OPTIONS", "point.function_root requires tolerance > 0 and maxIterations from 1 to 256.", {
      actual: { tolerance, maxIterations }
    });
  }
  const [domainFrom, domainTo] = value.domain;
  if (from < domainFrom || to > domainTo) {
    throw new MathEngineError("FUNCTION_ROOT_BRACKET_OUTSIDE_DOMAIN", "point.function_root bracket must lie inside the function domain.", {
      expected: value.domain,
      actual: bracket
    });
  }

  let left = from;
  let right = to;
  let leftValue = functionValueAt(value, left, resolve);
  let rightValue = functionValueAt(value, right, resolve);
  if (Math.abs(leftValue) <= tolerance) return { kind: "point2", x: left, y: 0 };
  if (Math.abs(rightValue) <= tolerance) return { kind: "point2", x: right, y: 0 };
  if (Math.sign(leftValue) === Math.sign(rightValue)) {
    throw new MathEngineError("FUNCTION_ROOT_NOT_BRACKETED", "point.function_root requires opposite signs at the bracket endpoints.", {
      actual: { bracket, values: [leftValue, rightValue] }
    });
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const midpoint = (left + right) / 2;
    const midpointValue = functionValueAt(value, midpoint, resolve);
    if (Math.abs(midpointValue) <= tolerance || (right - left) / 2 <= tolerance) {
      return { kind: "point2", x: midpoint, y: 0 };
    }
    if (Math.sign(midpointValue) === Math.sign(leftValue)) {
      left = midpoint;
      leftValue = midpointValue;
    } else {
      right = midpoint;
      rightValue = midpointValue;
    }
  }
  const root = (left + right) / 2;
  return { kind: "point2", x: root, y: 0 };
}
