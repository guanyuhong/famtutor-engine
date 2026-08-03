import { MathEngineError, asMathEngineError } from "../errors.js";
import { evaluateExpression } from "../expression/evaluator.js";
import { parseExpression, type ExpressionNode } from "../expression/index.js";
import type {
  AssertionArgument,
  AssertionEvidence,
  EvaluationResult,
  MathAssertion,
  MathDocument,
  RuntimeValue
} from "../types.js";
import { stableStringify } from "../util.js";
import { buildConstructionGraph } from "./dag.js";
import {
  DEFAULT_TOLERANCE,
  cross,
  distance,
  distancePointPath,
  dot,
  isAngle,
  isCircle,
  isLine,
  isPoint,
  isRay,
  isSegment,
  isVector,
  lineLikeToLine,
  norm,
  pointsAlmostEqual,
  subtractPoints,
  valueLength
} from "./geometry.js";
import { runtimeValueMap } from "./evaluate.js";

interface ProofResult {
  proved: boolean;
  dependencies?: string[];
}

function refOf(argument: AssertionArgument | undefined): string | undefined {
  return argument && "ref" in argument ? argument.ref : undefined;
}

function argumentValue(argument: AssertionArgument, values: Map<string, RuntimeValue>): RuntimeValue | unknown {
  if ("ref" in argument) {
    const value = values.get(argument.ref);
    if (value === undefined) throw new MathEngineError("ASSERTION_UNDEFINED_ARGUMENT", `Assertion entity '${argument.ref}' is undefined.`);
    return value;
  }
  if ("expr" in argument) return evaluateExpression(argument.expr, name => values.get(name));
  return argument.value;
}

function samePair(inputs: string[], left: string, right: string): boolean {
  return inputs.length >= 2 && ((inputs[0] === left && inputs[1] === right) || (inputs[0] === right && inputs[1] === left));
}

function inputRefs(node: { inputs?: Array<{ ref: string } | { value: unknown }> }): string[] {
  return (node.inputs ?? [])
    .filter((input): input is { ref: string } => "ref" in input)
    .map(input => input.ref);
}

function matchDistanceCall(node: ExpressionNode): [string, string] | null {
  if (node.type !== "call" || node.callee.toLowerCase() !== "distance" || node.arguments.length !== 2) return null;
  const left = node.arguments[0];
  const right = node.arguments[1];
  if (left?.type !== "identifier" || right?.type !== "identifier") return null;
  return [left.name, right.name];
}

function provePerpendicularBisectorEquality(document: MathDocument, assertion: MathAssertion): ProofResult {
  if (assertion.predicate !== "expression_equal" || assertion.arguments.length !== 2) return { proved: false };
  const leftArgument = assertion.arguments[0];
  const rightArgument = assertion.arguments[1];
  if (!leftArgument || !rightArgument || !("expr" in leftArgument) || !("expr" in rightArgument)) return { proved: false };
  const leftDistance = matchDistanceCall(parseExpression(leftArgument.expr));
  const rightDistance = matchDistanceCall(parseExpression(rightArgument.expr));
  if (!leftDistance || !rightDistance) return { proved: false };

  let sharedPoint: string | undefined;
  let endpointA: string | undefined;
  let endpointB: string | undefined;
  for (const candidate of leftDistance) {
    if (rightDistance.includes(candidate)) {
      sharedPoint = candidate;
      endpointA = leftDistance.find(value => value !== candidate);
      endpointB = rightDistance.find(value => value !== candidate);
      break;
    }
  }
  if (!sharedPoint || !endpointA || !endpointB || endpointA === endpointB) return { proved: false };

  const graph = buildConstructionGraph(document);
  const pointNodeId = graph.producerByEntity.get(sharedPoint);
  const pointNode = pointNodeId ? graph.nodeById.get(pointNodeId) : undefined;
  if (!pointNode || pointNode.command !== "point.on_path") return { proved: false };
  const pathId = inputRefs(pointNode)[0];
  if (!pathId) return { proved: false };

  const pathNodeId = graph.producerByEntity.get(pathId);
  const pathNode = pathNodeId ? graph.nodeById.get(pathNodeId) : undefined;
  if (!pathNode || pathNode.command !== "line.perpendicular_through") return { proved: false };
  const [midpointId, baseId] = inputRefs(pathNode);
  if (!midpointId || !baseId) return { proved: false };

  const midpointNodeId = graph.producerByEntity.get(midpointId);
  const midpointNode = midpointNodeId ? graph.nodeById.get(midpointNodeId) : undefined;
  if (!midpointNode || midpointNode.command !== "point.midpoint" || !samePair(inputRefs(midpointNode), endpointA, endpointB)) {
    return { proved: false };
  }

  const baseNodeId = graph.producerByEntity.get(baseId);
  const baseNode = baseNodeId ? graph.nodeById.get(baseNodeId) : undefined;
  if (!baseNode || !["segment.through_points", "line.through_points"].includes(baseNode.command) || !samePair(inputRefs(baseNode), endpointA, endpointB)) {
    return { proved: false };
  }

  return {
    proved: true,
    dependencies: [pointNode.id, pathNode.id, midpointNode.id, baseNode.id]
  };
}

function constructionProof(document: MathDocument, assertion: MathAssertion): ProofResult {
  const graph = buildConstructionGraph(document);
  const refs = assertion.arguments.map(refOf);

  if (assertion.predicate === "point_on" && refs[0] && refs[1]) {
    const producerId = graph.producerByEntity.get(refs[0]);
    const producer = producerId ? graph.nodeById.get(producerId) : undefined;
    if (producer?.command === "point.on_path" && inputRefs(producer)[0] === refs[1]) {
      return { proved: true, dependencies: [producer.id] };
    }
  }

  if ((assertion.predicate === "perpendicular" || assertion.predicate === "parallel") && refs[0] && refs[1]) {
    const command = assertion.predicate === "perpendicular" ? "line.perpendicular_through" : "line.parallel_through";
    for (const [candidate, target] of [[refs[0], refs[1]], [refs[1], refs[0]]] as const) {
      const producerId = graph.producerByEntity.get(candidate);
      const producer = producerId ? graph.nodeById.get(producerId) : undefined;
      if (producer?.command === command && inputRefs(producer)[1] === target) {
        return { proved: true, dependencies: [producer.id] };
      }
    }
  }

  if (assertion.predicate === "coincident" && refs[0] && refs[0] === refs[1]) {
    return { proved: true, dependencies: [] };
  }

  if (assertion.predicate === "expression_equal") {
    const perpendicularBisector = provePerpendicularBisectorEquality(document, assertion);
    if (perpendicularBisector.proved) return perpendicularBisector;
    const left = assertion.arguments[0];
    const right = assertion.arguments[1];
    if (left && right && "expr" in left && "expr" in right) {
      if (stableStringify(parseExpression(left.expr)) === stableStringify(parseExpression(right.expr))) {
        return { proved: true, dependencies: [] };
      }
    }
  }

  return { proved: false };
}

function numericPredicate(
  assertion: MathAssertion,
  values: Map<string, RuntimeValue>,
  tolerance: number
): { passed: boolean; residual: number } {
  const args = assertion.arguments.map(argument => argumentValue(argument, values));
  switch (assertion.predicate) {
    case "expression_equal": {
      if (args.length !== 2) throw new MathEngineError("ASSERTION_ARITY", "expression_equal requires two arguments.");
      if (typeof args[0] === "number" && typeof args[1] === "number") {
        const scale = Math.max(1, Math.abs(args[0]), Math.abs(args[1]));
        const residual = Math.abs(args[0] - args[1]);
        return { passed: residual <= tolerance * scale, residual };
      }
      return { passed: args[0] === args[1], residual: args[0] === args[1] ? 0 : 1 };
    }
    case "point_on": {
      if (!isPoint(args[0]) || args[1] === undefined || typeof args[1] === "number" || typeof args[1] === "boolean") {
        throw new MathEngineError("ASSERTION_TYPE", "point_on requires a point and a supported path.");
      }
      const residual = distancePointPath(args[0], args[1] as RuntimeValue);
      return { passed: residual <= tolerance, residual };
    }
    case "collinear": {
      if (!isPoint(args[0]) || !isPoint(args[1]) || !isPoint(args[2])) {
        throw new MathEngineError("ASSERTION_TYPE", "collinear requires three points.");
      }
      const left = subtractPoints(args[1], args[0]);
      const right = subtractPoints(args[2], args[0]);
      const denominator = Math.max(1, norm(left) * norm(right));
      const residual = Math.abs(cross(left, right)) / denominator;
      return { passed: residual <= tolerance, residual };
    }
    case "parallel":
    case "perpendicular": {
      if (
        args[0] === undefined || args[1] === undefined ||
        typeof args[0] === "number" || typeof args[0] === "boolean" ||
        typeof args[1] === "number" || typeof args[1] === "boolean" ||
        (!isLine(args[0]) && !isSegment(args[0]) && !isRay(args[0])) ||
        (!isLine(args[1]) && !isSegment(args[1]) && !isRay(args[1]))
      ) {
        throw new MathEngineError("ASSERTION_TYPE", `${assertion.predicate} requires two line-like entities.`);
      }
      const left = lineLikeToLine(args[0]);
      const right = lineLikeToLine(args[1]);
      const residual = assertion.predicate === "parallel"
        ? Math.abs(cross(left.direction, right.direction))
        : Math.abs(dot(left.direction, right.direction));
      return { passed: residual <= tolerance, residual };
    }
    case "coincident": {
      if (isPoint(args[0]) && isPoint(args[1])) {
        const residual = distance(args[0], args[1]);
        return { passed: pointsAlmostEqual(args[0], args[1], tolerance), residual };
      }
      if (typeof args[0] === "number" && typeof args[1] === "number") {
        const residual = Math.abs(args[0] - args[1]);
        return { passed: residual <= tolerance * Math.max(1, Math.abs(args[0]), Math.abs(args[1])), residual };
      }
      return { passed: args[0] === args[1], residual: args[0] === args[1] ? 0 : 1 };
    }
    case "equal_length": {
      if (args.length === 2 && args[0] !== undefined && args[1] !== undefined && typeof args[0] !== "boolean" && typeof args[1] !== "boolean") {
        const left = valueLength(args[0] as RuntimeValue);
        const right = valueLength(args[1] as RuntimeValue);
        const residual = Math.abs(left - right);
        return { passed: residual <= tolerance * Math.max(1, left, right), residual };
      }
      if (args.length === 4 && args[0] && args[1] && args[2] && args[3] && args.every(isPoint)) {
        const points = args as [import("../types.js").Point2Value, import("../types.js").Point2Value, import("../types.js").Point2Value, import("../types.js").Point2Value];
        const left = distance(points[0], points[1]);
        const right = distance(points[2], points[3]);
        const residual = Math.abs(left - right);
        return { passed: residual <= tolerance * Math.max(1, left, right), residual };
      }
      throw new MathEngineError("ASSERTION_TYPE", "equal_length requires two measurable entities or four points.");
    }
    case "equal_angle": {
      if (args.length !== 2) throw new MathEngineError("ASSERTION_ARITY", "equal_angle requires two angle values.");
      const toRadians = (value: unknown): number => {
        if (typeof value === "number") return value;
        if (isAngle(value)) return value.radians;
        throw new MathEngineError("ASSERTION_TYPE", "equal_angle arguments must be angles or numeric radians.");
      };
      const left = toRadians(args[0]);
      const right = toRadians(args[1]);
      const residual = Math.abs(left - right);
      return { passed: residual <= tolerance * Math.max(1, left, right), residual };
    }
    case "value_in_range": {
      if (args.length !== 3 || typeof args[0] !== "number" || typeof args[1] !== "number" || typeof args[2] !== "number") {
        throw new MathEngineError("ASSERTION_TYPE", "value_in_range requires numeric value, min and max.");
      }
      const [value, min, max] = args;
      const residual = value < min ? min - value : value > max ? value - max : 0;
      return { passed: residual <= tolerance, residual };
    }
  }
}

export function evaluateAssertions(document: MathDocument, evaluation: EvaluationResult): AssertionEvidence[] {
  const values = runtimeValueMap(evaluation);
  return (document.assertions ?? []).map(assertion => {
    const tolerance = assertion.tolerance ?? DEFAULT_TOLERANCE;
    try {
      const proof = constructionProof(document, assertion);
      const numeric = numericPredicate(assertion, values, tolerance);
      const expected = assertion.expected ?? true;
      const numericallyPassed = expected ? numeric.passed : !numeric.passed;
      const method = proof.proved ? "construction" as const : "numeric" as const;
      let status: AssertionEvidence["status"] = numericallyPassed ? "passed" : "failed";
      if (status === "passed" && assertion.requiredMethod && assertion.requiredMethod !== "any" && assertion.requiredMethod !== method) {
        status = "unverified";
      }
      return {
        assertionId: assertion.id,
        status,
        method,
        residual: numeric.residual,
        tolerance,
        message: assertion.message,
        dependencies: proof.dependencies
      };
    } catch (error) {
      const normalized = asMathEngineError(error, "ASSERTION_EVALUATION_ERROR");
      return {
        assertionId: assertion.id,
        status: "undefined",
        method: "numeric",
        tolerance,
        message: `${assertion.message ? `${assertion.message} ` : ""}${normalized.message}`
      };
    }
  });
}
