import { MathEngineError, asMathEngineError } from "../errors.js";
import { evaluateExpressionAst } from "../expression/evaluator.js";
import { parseExpression } from "../expression/parser.js";
import type {
  AssertionEvidence,
  JsonValue,
  MathDocument,
  NormalizedMathEvent,
  RuntimeValue,
  SimulationFrame,
  SimulationObservation,
  SimulationResult,
  ValidationIssue
} from "../types.js";
import { clamp, deepClone, finiteNumber, roundForJson, toJsonValue } from "../util.js";
import { evaluateAssertions } from "./assertions.js";
import { evaluateMathDocument, type EvaluationOverrides } from "./evaluate.js";
import { isPoint } from "./geometry.js";

export interface DragSimulationAction {
  type: "drag";
  target: string;
  path: Array<[number, number]>;
  samples?: number;
  commit?: boolean;
}

export interface SetValueSimulationAction {
  type: "set_value";
  target: string;
  value: number;
  samples?: number;
  commit?: boolean;
}

export type SimulationAction = DragSimulationAction | SetValueSimulationAction;

export interface SimulationOptions {
  observe?: string[];
  timestampBase?: number;
}

function interactionAllows(document: MathDocument, target: string, permission: "drag" | "set_value"): boolean {
  const policy = document.interactions?.find(candidate => candidate.target === target);
  if (!policy) {
    const entity = document.entities.find(candidate => candidate.id === target);
    return permission === "drag" ? entity?.role === "free" : entity?.type === "scalar" && entity.role === "free";
  }
  return policy.permissions.includes(permission);
}

function interpolatePolyline(path: Array<[number, number]>, samples: number): Array<[number, number]> {
  if (path.length < 2) throw new MathEngineError("INVALID_DRAG_PATH", "Drag path needs at least two points.");
  if (samples <= 2) return [path[0]!, path[path.length - 1]!];

  const segmentLengths: number[] = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const left = path[index - 1]!;
    const right = path[index]!;
    const length = Math.hypot(right[0] - left[0], right[1] - left[1]);
    segmentLengths.push(length);
    total += length;
  }
  if (total <= 1e-15) return Array.from({ length: samples }, () => [...path[0]!] as [number, number]);

  const output: Array<[number, number]> = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const wanted = total * sample / (samples - 1);
    let consumed = 0;
    let selected = segmentLengths.length - 1;
    for (let index = 0; index < segmentLengths.length; index += 1) {
      const length = segmentLengths[index]!;
      if (wanted <= consumed + length || index === segmentLengths.length - 1) {
        selected = index;
        break;
      }
      consumed += length;
    }
    const length = segmentLengths[selected]!;
    const ratio = length <= 1e-15 ? 0 : clamp((wanted - consumed) / length, 0, 1);
    const left = path[selected]!;
    const right = path[selected + 1]!;
    output.push([
      left[0] + (right[0] - left[0]) * ratio,
      left[1] + (right[1] - left[1]) * ratio
    ]);
  }
  return output;
}

function interpolateNumbers(from: number, to: number, samples: number): number[] {
  if (samples <= 2) return [from, to];
  return Array.from({ length: samples }, (_, index) => from + (to - from) * index / (samples - 1));
}

function assertionSelection(document: MathDocument, keys: string[]): string[] {
  const explicit = keys
    .filter(key => key.startsWith("assertion:"))
    .map(key => key.slice("assertion:".length));
  return explicit.length > 0 ? explicit : (document.assertions ?? []).map(assertion => assertion.id);
}

function observationFor(
  key: string,
  evaluation: ReturnType<typeof evaluateMathDocument>,
  assertionById: Map<string, AssertionEvidence>
): SimulationObservation {
  if (key.startsWith("assertion:")) {
    const id = key.slice("assertion:".length);
    const evidence = assertionById.get(id);
    return { key, value: evidence ? toJsonValue(evidence) : null };
  }

  if (key.startsWith("entity:")) {
    const id = key.slice("entity:".length);
    const runtime = evaluation.entities.get(id);
    return { key, value: runtime?.defined ? toJsonValue(runtime.value) : null };
  }

  const expression = key.startsWith("expr:") ? key.slice("expr:".length) : key;
  try {
    const ast = parseExpression(expression);
    const value = evaluateExpressionAst(ast, identifier => evaluation.entities.get(identifier)?.value);
    return { key, value: toJsonValue(value) };
  } catch (error) {
    const normalized = asMathEngineError(error, "OBSERVATION_ERROR");
    return {
      key,
      value: {
        error: normalized.code,
        message: normalized.message
      }
    };
  }
}

function frameFor(
  document: MathDocument,
  overrides: EvaluationOverrides,
  index: number,
  total: number,
  position: [number, number] | undefined,
  observe: string[]
): SimulationFrame {
  let evaluation;
  const issues: ValidationIssue[] = [];
  try {
    evaluation = evaluateMathDocument(document, overrides);
    issues.push(...evaluation.issues);
  } catch (error) {
    const normalized = asMathEngineError(error, "SIMULATION_EVALUATION_ERROR");
    return {
      index,
      progress: total <= 1 ? 1 : index / (total - 1),
      position,
      observations: [],
      assertions: [],
      issues: [normalized.toIssue()]
    };
  }

  const assertions = evaluateAssertions(document, evaluation);
  const assertionById = new Map(assertions.map(assertion => [assertion.assertionId, assertion]));
  return {
    index,
    progress: total <= 1 ? 1 : index / (total - 1),
    position,
    observations: observe.map(key => observationFor(key, evaluation, assertionById)),
    assertions,
    issues
  };
}

function findCurrentScalar(document: MathDocument, id: string): number {
  const evaluation = evaluateMathDocument(document);
  const value = evaluation.entities.get(id)?.value;
  if (!finiteNumber(value)) {
    throw new MathEngineError("SIMULATION_TARGET_TYPE", `Entity '${id}' is not a defined scalar.`, {
      actual: id
    });
  }
  return value;
}

function normalizedJsonValue(value: RuntimeValue | undefined): JsonValue {
  if (value === undefined) return null;
  if (typeof value === "number") return roundForJson(value);
  if (typeof value === "boolean") return value;
  return toJsonValue(value);
}

export function applySimulationFinalState(document: MathDocument, action: SimulationAction): MathDocument {
  const output = deepClone(document);
  const node = output.construction.find(candidate => candidate.outputs.includes(action.target));
  if (!node) throw new MathEngineError("SIMULATION_TARGET_NOT_PRODUCED", `No construction node produces '${action.target}'.`);

  if (action.type === "drag") {
    const final = action.path[action.path.length - 1];
    if (!final) throw new MathEngineError("INVALID_DRAG_PATH", "Drag path is empty.");
    if (node.command === "point.free") node.params = { ...(node.params ?? {}), coords: final };
    else if (node.command === "point.on_path") node.params = { ...(node.params ?? {}), initial: final };
    else throw new MathEngineError("SIMULATION_TARGET_NOT_MUTABLE", `Point '${action.target}' cannot be persisted by changing its construction parameters.`);
  } else {
    if (node.command === "scalar.slider" || node.command === "scalar.constant") {
      node.params = { ...(node.params ?? {}), value: action.value };
    } else {
      throw new MathEngineError("SIMULATION_TARGET_NOT_MUTABLE", `Scalar '${action.target}' cannot be persisted by changing its construction parameters.`);
    }
  }
  output.revision += 1;
  output.provenance = {
    ...(output.provenance ?? {}),
    updatedAt: new Date().toISOString()
  };
  return output;
}

export function simulateMathDocument(
  document: MathDocument,
  action: SimulationAction,
  options: SimulationOptions = {}
): SimulationResult {
  const entity = document.entities.find(candidate => candidate.id === action.target);
  if (!entity) throw new MathEngineError("UNKNOWN_SIMULATION_TARGET", `Unknown entity '${action.target}'.`);

  const observe = options.observe ?? [
    `entity:${action.target}`,
    ...assertionSelection(document, []).map(id => `assertion:${id}`)
  ];
  const frames: SimulationFrame[] = [];
  const eventTrace: NormalizedMathEvent[] = [];
  const issues: ValidationIssue[] = [];
  const timestampBase = options.timestampBase ?? Date.now();

  if (action.type === "drag") {
    if (entity.type !== "point2") throw new MathEngineError("SIMULATION_TARGET_TYPE", "Drag target must be point2.");
    if (!interactionAllows(document, action.target, "drag")) {
      throw new MathEngineError("INTERACTION_NOT_ALLOWED", `Entity '${action.target}' does not allow drag.`);
    }
    if (!Array.isArray(action.path) || action.path.some(pair => !Array.isArray(pair) || pair.length !== 2 || !finiteNumber(pair[0]) || !finiteNumber(pair[1]))) {
      throw new MathEngineError("INVALID_DRAG_PATH", "Drag path must be an array of finite [x,y] pairs.");
    }
    const samples = clamp(Math.trunc(action.samples ?? Math.max(2, action.path.length)), 2, 256);
    const positions = interpolatePolyline(action.path, samples);
    positions.forEach((position, index) => {
      const frame = frameFor(document, { points: { [action.target]: position } }, index, positions.length, position, observe);
      frames.push(frame);
      issues.push(...frame.issues);
      eventTrace.push({
        type: index === 0 ? "object.dragStart" : index === positions.length - 1 ? "object.dragEnd" : "object.drag",
        target: action.target,
        timestamp: timestampBase + index,
        documentId: document.documentId,
        revision: document.revision,
        position,
        value: frame.observations.find(observation => observation.key === `entity:${action.target}`)?.value
      });
    });
  } else {
    if (entity.type !== "scalar") throw new MathEngineError("SIMULATION_TARGET_TYPE", "set_value target must be scalar.");
    if (!finiteNumber(action.value)) throw new MathEngineError("INVALID_SIMULATION_VALUE", "set_value requires a finite numeric value.");
    if (!interactionAllows(document, action.target, "set_value")) {
      throw new MathEngineError("INTERACTION_NOT_ALLOWED", `Entity '${action.target}' does not allow set_value.`);
    }
    const from = findCurrentScalar(document, action.target);
    const samples = clamp(Math.trunc(action.samples ?? 2), 2, 256);
    const values = interpolateNumbers(from, action.value, samples);
    values.forEach((value, index) => {
      const frame = frameFor(document, { scalars: { [action.target]: value } }, index, values.length, undefined, observe);
      frames.push(frame);
      issues.push(...frame.issues);
      eventTrace.push({
        type: "value.changed",
        target: action.target,
        timestamp: timestampBase + index,
        documentId: document.documentId,
        revision: document.revision,
        value: roundForJson(value)
      });
    });
  }

  const finalFrame = frames[frames.length - 1];
  const finalEvaluation = action.type === "drag"
    ? evaluateMathDocument(document, { points: { [action.target]: action.path[action.path.length - 1]! } })
    : evaluateMathDocument(document, { scalars: { [action.target]: action.value } });
  const finalValue = finalEvaluation.entities.get(action.target)?.value;

  return {
    documentId: document.documentId,
    revision: document.revision,
    action: toJsonValue(action) as Record<string, JsonValue>,
    eventTrace,
    frames,
    finalState: {
      target: action.target,
      value: normalizedJsonValue(finalValue),
      observations: toJsonValue(finalFrame?.observations ?? [])
    },
    issues
  };
}
