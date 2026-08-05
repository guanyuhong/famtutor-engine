import { MathEngineError, asMathEngineError } from "../errors.js";
import { evaluateBooleanExpression, evaluateNumericExpression } from "../expression/evaluator.js";
import { getCommandDefinition, typeConstraintMatches } from "../catalog/commands.js";
import type {
  CollectionValue,
  CommandInput,
  ConstructionNode,
  EntityType,
  EvaluationResult,
  JsonValue,
  Line2Value,
  MathDocument,
  Point2Value,
  Point3Value,
  Polygon2Value,
  Ray2Value,
  RuntimeEntity,
  RuntimeValue,
  Segment2Value,
  ValidationIssue
} from "../types.js";
import { finiteNumber } from "../util.js";
import { buildConstructionGraph } from "./dag.js";
import {
  addPointVector,
  angleBisectorRay,
  angleValue,
  applyTransform,
  arcFromCenterPoints,
  arcFromThreePoints,
  arcLength,
  circle,
  circleArea,
  circlePerimeter,
  commonTangentLine,
  circumcircle,
  dilatePoint,
  dilateTransform,
  distance,
  ellipseFromFoci,
  hyperbolaFromFoci,
  intersectCircles,
  intersectLineCircle,
  intersectLineConic,
  intersectLines,
  invertCircleInCircle,
  invertPointInCircle,
  isAngle,
  isArc,
  isCircle,
  isConic,
  isLine,
  isPoint,
  isPolygon,
  isRay,
  isSector,
  isSegment,
  isTransform,
  isVector,
  lineFromPointDirection,
  lineFromPoints,
  lineLikeToLine,
  midpoint,
  parallelChevronMarker,
  parabolaFromFocusDirectrix,
  point,
  polygonArea,
  polygonDiagonals,
  polygonPerimeter,
  projectPointToPath,
  regularPolygon,
  ray,
  reflectPointAcrossLine,
  reflectTransform,
  rightAngleMarkerPolygon,
  rotatePoint,
  rotateTransform,
  scaleVector,
  segmentTickMarker,
  sectorArea,
  sectorFromArc,
  segment,
  slope,
  subtractPoints,
  translateTransform,
  valueLength,
  vector
} from "./geometry.js";
import { intervalFromBounds, isInterval } from "./interval.js";
import { functionInequalityRegion, functionRootInInterval, functionValueAt, isFunction1, piecewiseFunction } from "./function.js";
import {
  isLine3,
  isPlane3,
  isPoint3,
  isSegment3,
  isVector3,
  line3FromPoints,
  plane3ThroughPoints,
  point3,
  segment3,
  sphere3,
  subtractPoints3
} from "./geometry3d.js";

export interface EvaluationOverrides {
  points?: Record<string, [number, number]>;
  scalars?: Record<string, number>;
}

function valueAtInput(input: CommandInput, values: Map<string, RuntimeValue>): RuntimeValue | JsonValue {
  if ("value" in input) return input.value;
  const value = values.get(input.ref);
  if (value === undefined) {
    throw new MathEngineError("UNDEFINED_INPUT", `Input entity '${input.ref}' is undefined.`, {
      actual: input.ref
    });
  }
  return value;
}

function requirePointValue(value: RuntimeValue | JsonValue, context: string): Point2Value {
  if (!isPoint(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires point2.`);
  return value;
}

function requirePoint3Value(value: RuntimeValue | JsonValue, context: string): Point3Value {
  if (!isPoint3(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires point3.`);
  return value;
}

function requireLineLikeValue(value: RuntimeValue | JsonValue, context: string): Line2Value | Segment2Value | Ray2Value {
  if (!isLine(value) && !isSegment(value) && !isRay(value)) {
    throw new MathEngineError("TYPE_MISMATCH", `${context} requires line2, segment2, or ray2.`);
  }
  return value;
}

function requireSegmentValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isSegment(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires segment2.`);
  return value;
}

function requireCircleValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isCircle(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires circle2.`);
  return value;
}

function requirePolygonValue(value: RuntimeValue | JsonValue, context: string): Polygon2Value {
  if (!isPolygon(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires polygon2.`);
  return value;
}

function requireVectorValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isVector(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires vector2.`);
  return value;
}

function requireScalarValue(value: RuntimeValue | JsonValue, context: string): number {
  if (!finiteNumber(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires a finite scalar.`);
  return value;
}

function requireBooleanValue(value: RuntimeValue | JsonValue, context: string): boolean {
  if (typeof value !== "boolean") throw new MathEngineError("TYPE_MISMATCH", `${context} requires a boolean.`);
  return value;
}

function requireFunctionValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isFunction1(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires function1.`);
  return value;
}

function paramsObject(node: ConstructionNode): Record<string, JsonValue> {
  return node.params ?? {};
}

function numberParam(node: ConstructionNode, name: string): number {
  const value = paramsObject(node)[name];
  if (!finiteNumber(value)) {
    throw new MathEngineError("INVALID_PARAMETER", `Command '${node.command}' requires numeric params.${name}.`, {
      path: `$.construction.${node.id}.params.${name}`,
      actual: value ?? null
    });
  }
  return value;
}

function pairParam(node: ConstructionNode, name: string): [number, number] {
  const value = paramsObject(node)[name];
  if (!Array.isArray(value) || value.length !== 2 || !finiteNumber(value[0]) || !finiteNumber(value[1])) {
    throw new MathEngineError("INVALID_PARAMETER", `Command '${node.command}' requires params.${name} = [x,y].`, {
      path: `$.construction.${node.id}.params.${name}`,
      actual: value ?? null
    });
  }
  return [value[0], value[1]];
}

function tripleParam(node: ConstructionNode, name: string): [number, number, number] {
  const value = paramsObject(node)[name];
  if (!Array.isArray(value) || value.length !== 3 || value.some(item => !finiteNumber(item))) {
    throw new MathEngineError("INVALID_PARAMETER", `Command '${node.command}' requires params.${name} = [x,y,z].`, {
      path: `$.construction.${node.id}.params.${name}`,
      actual: value ?? null
    });
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function namedDomainParam(node: ConstructionNode, name: string): [number, number] {
  const value = paramsObject(node)[name];
  if (!Array.isArray(value) || value.length !== 2 || !finiteNumber(value[0]) || !finiteNumber(value[1]) || value[0] >= value[1]) {
    throw new MathEngineError("INVALID_DOMAIN", `Command '${node.command}' requires params.${name} = [min,max] with min < max.`, {
      path: `$.construction.${node.id}.params.${name}`,
      actual: value ?? null
    });
  }
  return [value[0], value[1]];
}

function domainParam(node: ConstructionNode): [number, number] {
  const value = paramsObject(node).domain;
  if (!Array.isArray(value) || value.length !== 2 || !finiteNumber(value[0]) || !finiteNumber(value[1]) || value[0] >= value[1]) {
    throw new MathEngineError("INVALID_DOMAIN", `Command '${node.command}' requires params.domain = [min,max] with min < max.`, {
      path: `$.construction.${node.id}.params.domain`,
      actual: value ?? null
    });
  }
  return [value[0], value[1]];
}

function stringParam(node: ConstructionNode, name: string): string {
  const value = paramsObject(node)[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new MathEngineError("INVALID_PARAMETER", `Command '${node.command}' requires non-empty string params.${name}.`, {
      path: `$.construction.${node.id}.params.${name}`,
      actual: value ?? null
    });
  }
  return value;
}

function expressionNumber(
  raw: JsonValue | undefined,
  values: Map<string, RuntimeValue>,
  locals: Record<string, number> = {}
): number {
  if (finiteNumber(raw)) return raw;
  if (typeof raw !== "string") {
    throw new MathEngineError("INVALID_EXPRESSION_PARAMETER", "Expected a numeric value or safe expression string.", {
      actual: raw ?? null
    });
  }
  return evaluateNumericExpression(raw, name => locals[name] ?? values.get(name));
}

function expressionBoolean(raw: JsonValue | undefined, values: Map<string, RuntimeValue>): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") {
    throw new MathEngineError("INVALID_EXPRESSION_PARAMETER", "Expected a boolean or safe expression string.", {
      actual: raw ?? null
    });
  }
  return evaluateBooleanExpression(raw, name => values.get(name));
}

function runtimeTypeMatches(type: EntityType, value: RuntimeValue): boolean {
  if (type === "scalar") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "point2") return isPoint(value);
  if (type === "vector2") return isVector(value);
  if (type === "line2") return isLine(value);
  if (type === "segment2") return isSegment(value);
  if (type === "ray2") return isRay(value);
  if (type === "circle2") return isCircle(value);
  if (type === "arc2") return isArc(value);
  if (type === "sector2") return isSector(value);
  if (type === "polygon2") return isPolygon(value);
  if (type === "conic2") return isConic(value);
  if (type === "transform2") return isTransform(value);
  if (type === "angle") return typeof value === "object" && value.kind === "angle";
  if (type === "interval1") return isInterval(value);
  if (type === "function1") return typeof value === "object" && value.kind === "function1";
  if (type === "region2") return typeof value === "object" && value.kind === "region2";
  if (type === "curve2") return typeof value === "object" && value.kind === "curve2";
  if (type === "collection") return isCollectionValue(value);
  if (type === "point3") return isPoint3(value);
  if (type === "vector3") return isVector3(value);
  if (type === "line3") return isLine3(value);
  if (type === "segment3") return isSegment3(value);
  if (type === "plane3") return isPlane3(value);
  if (type === "polygon3") return typeof value === "object" && value.kind === "polygon3";
  if (type === "sphere3") return typeof value === "object" && value.kind === "sphere3";
  if (type === "curve3") return typeof value === "object" && value.kind === "curve3";
  if (type === "surface3") return typeof value === "object" && value.kind === "surface3";
  if (type === "text") return typeof value === "object" && value.kind === "text";
  return false;
}

function requirePathValue(value: RuntimeValue | JsonValue, context: string): RuntimeValue {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    throw new MathEngineError("TYPE_MISMATCH", `${context} requires a geometry path.`);
  }
  if (
    !isLine(value) &&
    !isSegment(value) &&
    !isRay(value) &&
    !isCircle(value) &&
    !isArc(value) &&
    !isPolygon(value)
  ) {
    throw new MathEngineError("TYPE_MISMATCH", `${context} requires line, segment, ray, circle, arc, or polygon.`);
  }
  return value;
}

function requireTransformValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isTransform(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires transform2.`);
  return value;
}

function requireArcValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isArc(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires arc2.`);
  return value;
}

function requireAngleValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isAngle(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires angle.`);
  return value;
}

function requireConicValue(value: RuntimeValue | JsonValue, context: string) {
  if (!isConic(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires conic2.`);
  return value;
}

function isCollectionValue(value: RuntimeValue | JsonValue): value is CollectionValue {
  return typeof value === "object" && value !== null && !Array.isArray(value) && value.kind === "collection";
}

function requireCollectionValue(value: RuntimeValue | JsonValue, context: string): CollectionValue {
  if (!isCollectionValue(value)) throw new MathEngineError("TYPE_MISMATCH", `${context} requires collection.`);
  return value;
}

function collectionItemType(node: ConstructionNode): Exclude<EntityType, "collection"> {
  const value = paramsObject(node).itemType;
  if (typeof value !== "string" || value === "collection") {
    throw new MathEngineError("INVALID_COLLECTION_ITEM_TYPE", `Command '${node.command}' requires params.itemType to name a non-collection entity type.`, { actual: value ?? null });
  }
  const known = ["point2", "segment2", "circle2", "polygon2"] as const;
  if (!(known as readonly string[]).includes(value)) {
    throw new MathEngineError("INVALID_COLLECTION_ITEM_TYPE", `Unknown collection item type '${value}'.`, { actual: value });
  }
  return value as Exclude<EntityType, "collection">;
}

function collectionLimit(node: ConstructionNode): number {
  const value = numberParam(node, "maxItems");
  if (!Number.isInteger(value) || value < 1 || value > 256) {
    throw new MathEngineError("INVALID_COLLECTION_LIMIT", "params.maxItems must be an integer from 1 to 256.", { actual: value, expected: "1..256" });
  }
  return value;
}

function collectionVariable(node: ConstructionNode): string {
  const variable = stringParam(node, "variable");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable) || variable === "pi" || variable === "e") {
    throw new MathEngineError("INVALID_COLLECTION_VARIABLE", "params.variable must be a plain, non-reserved identifier.", { actual: variable });
  }
  return variable;
}

function templateObject(node: ConstructionNode): Record<string, JsonValue> {
  const value = paramsObject(node).template;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MathEngineError("INVALID_COLLECTION_TEMPLATE", "params.template must be an object.", { actual: value ?? null });
  }
  return value;
}

function evaluateCollectionTemplate(
  owner: ConstructionNode,
  outerInputs: CommandInput[],
  values: Map<string, RuntimeValue>,
  overrides: EvaluationOverrides,
  variable: string,
  localValue: RuntimeValue,
  expectedType: Exclude<EntityType, "collection">
): RuntimeValue {
  if (values.has(variable)) {
    throw new MathEngineError("COLLECTION_LOCAL_COLLISION", `Collection variable '${variable}' collides with an entity id.`, { actual: variable });
  }
  const template = templateObject(owner);
  const command = template.command;
  if (typeof command !== "string" || command.startsWith("collection.")) {
    throw new MathEngineError("INVALID_COLLECTION_TEMPLATE_COMMAND", "Collection templates require a non-collection L0 command.", { actual: command ?? null });
  }
  const definition = getCommandDefinition(command);
  if (!definition || definition.outputTypes.length !== 1 || !typeConstraintMatches(definition.outputTypes[0]!, expectedType)) {
    throw new MathEngineError("COLLECTION_TEMPLATE_TYPE_MISMATCH", `Template command '${command}' must have one '${expectedType}' output.`, {
      actual: definition ? definition.outputTypes.map(constraint => Array.isArray(constraint) ? [...constraint] : constraint) as JsonValue : null,
      expected: expectedType
    });
  }
  const rawInputs = template.inputs ?? [];
  if (!Array.isArray(rawInputs)) throw new MathEngineError("INVALID_COLLECTION_TEMPLATE", "template.inputs must be an array.");
  const inputs: CommandInput[] = rawInputs.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new MathEngineError("INVALID_COLLECTION_TEMPLATE_INPUT", `template.inputs[${index}] must be an object.`);
    }
    if (raw.local === true) return { ref: variable };
    if (typeof raw.input === "number" && Number.isInteger(raw.input) && raw.input >= 0 && raw.input < outerInputs.length) {
      return outerInputs[raw.input]!;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "value")) return { value: raw.value as JsonValue };
    throw new MathEngineError("INVALID_COLLECTION_TEMPLATE_INPUT", `template.inputs[${index}] requires {local:true}, {input:index}, or {value:...}.`, { actual: raw });
  });
  const rawParams = template.params;
  if (rawParams !== undefined && (!rawParams || typeof rawParams !== "object" || Array.isArray(rawParams))) {
    throw new MathEngineError("INVALID_COLLECTION_TEMPLATE", "template.params must be an object when present.");
  }
  const scopedValues = new Map(values);
  scopedValues.set(variable, localValue);
  const virtual: ConstructionNode = {
    id: `${owner.id}::template`,
    command,
    inputs,
    params: (rawParams ?? {}) as Record<string, JsonValue>,
    outputs: [`${owner.id}::item`]
  };
  const result = executeNode(virtual, scopedValues, overrides);
  const value = result[0];
  if (value === undefined || !runtimeTypeMatches(expectedType, value)) {
    throw new MathEngineError("COLLECTION_TEMPLATE_RUNTIME_TYPE_MISMATCH", `Template command '${command}' did not produce '${expectedType}'.`);
  }
  return value;
}

function executeNode(
  node: ConstructionNode,
  values: Map<string, RuntimeValue>,
  overrides: EvaluationOverrides
): RuntimeValue[] {
  const inputs = (node.inputs ?? []).map(input => valueAtInput(input, values));
  const params = paramsObject(node);
  const firstOutput = node.outputs[0];

  switch (node.command) {
    case "scalar.constant":
      return [numberParam(node, "value")];
    case "scalar.slider": {
      const min = numberParam(node, "min");
      const max = numberParam(node, "max");
      if (min >= max) throw new MathEngineError("INVALID_SLIDER_RANGE", "Slider min must be less than max.");
      const candidate = firstOutput ? overrides.scalars?.[firstOutput] : undefined;
      const value = candidate ?? numberParam(node, "value");
      if (value < min || value > max) {
        throw new MathEngineError("SLIDER_VALUE_OUT_OF_RANGE", "Slider value must be inside [min,max].", {
          expected: [min, max],
          actual: value
        });
      }
      return [value];
    }
    case "boolean.constant": {
      const value = params.value;
      if (typeof value !== "boolean") throw new MathEngineError("INVALID_PARAMETER", "boolean.constant requires boolean params.value.", {
        path: `$.construction.${node.id}.params.value`,
        actual: value ?? null
      });
      return [value];
    }
    case "collection.sequence": {
      const itemType = collectionItemType(node);
      const variable = collectionVariable(node);
      const maxItems = collectionLimit(node);
      const from = expressionNumber(params.from, values);
      const to = expressionNumber(params.to, values);
      const step = params.step === undefined ? (to >= from ? 1 : -1) : expressionNumber(params.step, values);
      if (step === 0 || Math.sign(to - from || step) !== Math.sign(step)) {
        throw new MathEngineError("INVALID_SEQUENCE_RANGE", "Sequence step must be non-zero and move from start toward end.", { actual: { from, to, step } });
      }
      const items: RuntimeValue[] = [];
      const epsilon = Math.abs(step) * 1e-10;
      for (let index = from; step > 0 ? index <= to + epsilon : index >= to - epsilon; index += step) {
        if (items.length >= maxItems) throw new MathEngineError("COLLECTION_LIMIT_EXCEEDED", `Sequence exceeds maxItems=${maxItems}.`, { actual: items.length + 1, expected: maxItems });
        items.push(evaluateCollectionTemplate(node, node.inputs ?? [], values, overrides, variable, index, itemType));
      }
      return [{ kind: "collection", itemType, items }];
    }
    case "collection.map": {
      const source = requireCollectionValue(inputs[0]!, "collection.map input 1");
      const itemType = collectionItemType(node);
      const variable = collectionVariable(node);
      const maxItems = collectionLimit(node);
      if (source.items.length > maxItems) throw new MathEngineError("COLLECTION_LIMIT_EXCEEDED", `Map source exceeds maxItems=${maxItems}.`, { actual: source.items.length, expected: maxItems });
      return [{
        kind: "collection",
        itemType,
        items: source.items.map(item => evaluateCollectionTemplate(node, node.inputs ?? [], values, overrides, variable, item, itemType))
      }];
    }
    case "boolean.expression":
      return [expressionBoolean(params.expression, values)];
    case "interval.from_bounds": {
      const lower = params.lower === undefined ? undefined : expressionNumber(params.lower, values);
      const upper = params.upper === undefined ? undefined : expressionNumber(params.upper, values);
      const y = params.y === undefined ? undefined : expressionNumber(params.y, values);
      return [intervalFromBounds({
        lower,
        upper,
        lowerClosed: params.lowerClosed === true,
        upperClosed: params.upperClosed === true,
        y
      })];
    }
    case "point.free": {
      const coords = firstOutput ? overrides.points?.[firstOutput] : undefined;
      const [x, y] = coords ?? pairParam(node, "coords");
      return [point(x, y)];
    }
    case "point3.free": {
      const [x, y, z] = tripleParam(node, "coords");
      return [point3(x, y, z)];
    }
    case "point3.from_expressions":
      return [point3(
        expressionNumber(params.x, values),
        expressionNumber(params.y, values),
        expressionNumber(params.z, values)
      )];
    case "vector3.between_points":
      return [subtractPoints3(
        requirePoint3Value(inputs[1]!, "vector3.between_points input 2"),
        requirePoint3Value(inputs[0]!, "vector3.between_points input 1")
      )];
    case "line3.through_points":
      return [line3FromPoints(
        requirePoint3Value(inputs[0]!, "line3.through_points input 1"),
        requirePoint3Value(inputs[1]!, "line3.through_points input 2")
      )];
    case "segment3.through_points":
      return [segment3(
        requirePoint3Value(inputs[0]!, "segment3.through_points input 1"),
        requirePoint3Value(inputs[1]!, "segment3.through_points input 2")
      )];
    case "plane3.through_points":
      return [plane3ThroughPoints(
        requirePoint3Value(inputs[0]!, "plane3.through_points input 1"),
        requirePoint3Value(inputs[1]!, "plane3.through_points input 2"),
        requirePoint3Value(inputs[2]!, "plane3.through_points input 3")
      )];
    case "polygon3.vertices":
      return [{ kind: "polygon3", vertices: inputs.map((input, index) => requirePoint3Value(input, `polygon3.vertices input ${index + 1}`)) }];
    case "sphere3.center_radius": {
      const center = requirePoint3Value(inputs[0]!, "sphere3.center_radius input 1");
      const radius = inputs.length > 1
        ? requireScalarValue(inputs[1]!, "sphere3.center_radius input 2")
        : expressionNumber(params.radius, values);
      return [sphere3(center, radius)];
    }
    case "curve3.parametric":
      return [{
        kind: "curve3",
        xExpression: stringParam(node, "xExpression"),
        yExpression: stringParam(node, "yExpression"),
        zExpression: stringParam(node, "zExpression"),
        parameter: typeof params.parameter === "string" ? params.parameter : "t",
        domain: domainParam(node)
      }];
    case "surface3.parametric": {
      const parameters = Array.isArray(params.parameters)
        && params.parameters.length === 2
        && params.parameters.every(item => typeof item === "string" && item.length > 0)
        ? params.parameters as [string, string]
        : ["u", "v"] as [string, string];
      if (parameters[0] === parameters[1]) throw new MathEngineError("INVALID_PARAMETER", "surface3.parametric parameters must be distinct.");
      return [{
        kind: "surface3",
        xExpression: stringParam(node, "xExpression"),
        yExpression: stringParam(node, "yExpression"),
        zExpression: stringParam(node, "zExpression"),
        parameters,
        uDomain: namedDomainParam(node, "uDomain"),
        vDomain: namedDomainParam(node, "vDomain")
      }];
    }
    case "point.from_expressions":
      return [point(expressionNumber(params.x, values), expressionNumber(params.y, values))];
    case "point.on_path": {
      const path = requirePathValue(inputs[0]!, "point.on_path");
      const coords = firstOutput ? overrides.points?.[firstOutput] : undefined;
      const [x, y] = coords ?? pairParam(node, "initial");
      return [projectPointToPath(point(x, y), path)];
    }
    case "point.midpoint":
      return [midpoint(requirePointValue(inputs[0]!, "point.midpoint input 1"), requirePointValue(inputs[1]!, "point.midpoint input 2"))];
    case "point.circle_center": {
      const source = requireCircleValue(inputs[0]!, "point.circle_center input");
      return [point(source.center.x, source.center.y)];
    }
    case "point.projection": {
      const source = requirePointValue(inputs[0]!, "point.projection input 1");
      const path = requirePathValue(inputs[1]!, "point.projection input 2");
      return [projectPointToPath(source, path)];
    }
    case "point.invert_in_circle":
      return [invertPointInCircle(
        requirePointValue(inputs[0]!, "point.invert_in_circle input 1"),
        requireCircleValue(inputs[1]!, "point.invert_in_circle input 2")
      )];
    case "point.intersection_line_line": {
      const left = lineLikeToLine(requireLineLikeValue(inputs[0]!, "intersection input 1"));
      const right = lineLikeToLine(requireLineLikeValue(inputs[1]!, "intersection input 2"));
      return [intersectLines(left, right)];
    }
    case "point.intersection_line_circle": {
      const line = lineLikeToLine(requireLineLikeValue(inputs[0]!, "intersection input 1"));
      const circleValue = requireCircleValue(inputs[1]!, "intersection input 2");
      return intersectLineCircle(line, circleValue);
    }
    case "point.intersection_circle_circle": {
      const left = requireCircleValue(inputs[0]!, "intersection input 1");
      const right = requireCircleValue(inputs[1]!, "intersection input 2");
      return intersectCircles(left, right);
    }
    case "point.intersection_line_conic": {
      const line = lineLikeToLine(requireLineLikeValue(inputs[0]!, "intersection input 1"));
      const conic = requireConicValue(inputs[1]!, "intersection input 2");
      return intersectLineConic(line, conic);
    }
    case "segment.through_points":
      return [segment(requirePointValue(inputs[0]!, "segment input 1"), requirePointValue(inputs[1]!, "segment input 2"))];
    case "line.through_points":
      return [lineFromPoints(requirePointValue(inputs[0]!, "line input 1"), requirePointValue(inputs[1]!, "line input 2"))];
    case "ray.from_points":
      return [ray(requirePointValue(inputs[0]!, "ray input 1"), requirePointValue(inputs[1]!, "ray input 2"))];
    case "ray.angle_bisector": {
      const branch = params.branch;
      if (branch !== "internal" && branch !== "external") {
        throw new MathEngineError("INVALID_PARAMETER", "ray.angle_bisector params.branch must be 'internal' or 'external'.", { actual: branch });
      }
      return [angleBisectorRay(
        requirePointValue(inputs[0]!, "angle-bisector left arm"),
        requirePointValue(inputs[1]!, "angle-bisector vertex"),
        requirePointValue(inputs[2]!, "angle-bisector right arm"),
        branch
      )];
    }
    case "line.parallel_through": {
      const through = requirePointValue(inputs[0]!, "parallel input 1");
      const target = lineLikeToLine(requireLineLikeValue(inputs[1]!, "parallel input 2"));
      return [lineFromPointDirection(through, target.direction)];
    }
    case "line.perpendicular_through": {
      const through = requirePointValue(inputs[0]!, "perpendicular input 1");
      const target = lineLikeToLine(requireLineLikeValue(inputs[1]!, "perpendicular input 2"));
      return [lineFromPointDirection(through, vector(-target.direction.y, target.direction.x))];
    }
    case "line.common_tangent":
      return [commonTangentLine(
        requireCircleValue(inputs[0]!, "line.common_tangent input 1"),
        requireCircleValue(inputs[1]!, "line.common_tangent input 2"),
        numberParam(node, "side1"),
        numberParam(node, "side2")
      )];
    case "vector.between_points": {
      const from = requirePointValue(inputs[0]!, "vector input 1");
      const to = requirePointValue(inputs[1]!, "vector input 2");
      return [subtractPoints(to, from)];
    }
    case "vector.components": {
      const [x, y] = pairParam(node, "components");
      return [vector(x, y)];
    }
    case "vector.polar": {
      const magnitude = expressionNumber(params.magnitude, values);
      const angle = expressionNumber(params.angle, values);
      return [vector(magnitude * Math.cos(angle), magnitude * Math.sin(angle))];
    }
    case "vector.scale":
      return [scaleVector(
        requireVectorValue(inputs[0]!, "vector.scale input"),
        expressionNumber(params.factor, values)
      )];
    case "circle.center_radius": {
      const center = requirePointValue(inputs[0]!, "circle center");
      const radius = inputs.length > 1
        ? requireScalarValue(inputs[1]!, "circle radius")
        : expressionNumber(params.radius, values);
      return [circle(center, radius)];
    }
    case "circle.through_points": {
      const center = requirePointValue(inputs[0]!, "circle center");
      const onCircle = requirePointValue(inputs[1]!, "circle point");
      return [circle(center, distance(center, onCircle))];
    }
    case "circle.through_three_points":
      return [circumcircle(
        requirePointValue(inputs[0]!, "circumcircle input 1"),
        requirePointValue(inputs[1]!, "circumcircle input 2"),
        requirePointValue(inputs[2]!, "circumcircle input 3")
      )];
    case "circle.invert_in_circle":
      return [invertCircleInCircle(
        requireCircleValue(inputs[0]!, "circle.invert_in_circle input 1"),
        requireCircleValue(inputs[1]!, "circle.invert_in_circle input 2")
      )];
    case "arc.center_points":
      return [arcFromCenterPoints(
        requirePointValue(inputs[0]!, "arc center"),
        requirePointValue(inputs[1]!, "arc start"),
        requirePointValue(inputs[2]!, "arc end")
      )];
    case "arc.three_points":
      return [arcFromThreePoints(
        requirePointValue(inputs[0]!, "arc input 1"),
        requirePointValue(inputs[1]!, "arc input 2"),
        requirePointValue(inputs[2]!, "arc input 3")
      )];
    case "sector.from_arc":
      return [sectorFromArc(requireArcValue(inputs[0]!, "sector arc"))];
    case "polygon.vertices": {
      const vertices = inputs.map((input, index) => requirePointValue(input, `polygon input ${index + 1}`));
      return [{ kind: "polygon2", vertices }];
    }
    case "polygon.regular": {
      const maxVertices = numberParam(node, "maxVertices");
      const vertexCount = requireScalarValue(inputs[2]!, "polygon.regular vertexCount");
      if (!Number.isInteger(maxVertices) || maxVertices < 3 || maxVertices > 64) {
        throw new MathEngineError("INVALID_REGULAR_POLYGON_BOUND", "params.maxVertices must be an integer from 3 to 64.", { actual: maxVertices, expected: "3..64" });
      }
      if (vertexCount > maxVertices) {
        throw new MathEngineError("REGULAR_POLYGON_BOUND_EXCEEDED", "vertexCount exceeds params.maxVertices.", { actual: vertexCount, expected: maxVertices });
      }
      return [regularPolygon(
        requirePointValue(inputs[0]!, "polygon.regular center"),
        requireScalarValue(inputs[1]!, "polygon.regular radius"),
        vertexCount,
        params.rotation === undefined ? Math.PI / 2 : expressionNumber(params.rotation, values)
      )];
    }
    case "polygon.diagonals": {
      const maxItems = numberParam(node, "maxItems");
      if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 256) {
        throw new MathEngineError("INVALID_COLLECTION_LIMIT", "params.maxItems must be an integer from 1 to 256.", { actual: maxItems, expected: "1..256" });
      }
      const fromVertex = params.fromVertex === undefined ? undefined : numberParam(node, "fromVertex");
      const items = polygonDiagonals(requirePolygonValue(inputs[0]!, "polygon.diagonals input"), fromVertex);
      if (items.length > maxItems) {
        throw new MathEngineError("COLLECTION_LIMIT_EXCEEDED", `Polygon diagonals exceed maxItems=${maxItems}.`, { actual: items.length, expected: maxItems });
      }
      return [{ kind: "collection", itemType: "segment2", items }];
    }
    case "angle.three_points":
      return [angleValue(
        requirePointValue(inputs[0]!, "angle input 1"),
        requirePointValue(inputs[1]!, "angle input 2"),
        requirePointValue(inputs[2]!, "angle input 3")
      )];
    case "marker.right_angle":
      return [rightAngleMarkerPolygon(
        requireAngleValue(inputs[0]!, "right-angle marker input"),
        numberParam(node, "size")
      )];
    case "marker.segment_tick":
      return [segmentTickMarker(
        requireSegmentValue(inputs[0]!, "segment tick marker input"),
        params.position === undefined ? 0.5 : numberParam(node, "position"),
        numberParam(node, "size")
      )];
    case "marker.parallel_chevron":
      return parallelChevronMarker(
        requirePointValue(inputs[0]!, "parallel chevron anchor"),
        requireLineLikeValue(inputs[1]!, "parallel chevron line"),
        numberParam(node, "size")
      );
    case "conic.ellipse_foci":
      return [ellipseFromFoci(
        requirePointValue(inputs[0]!, "ellipse focus 1"),
        requirePointValue(inputs[1]!, "ellipse focus 2"),
        expressionNumber(params.majorAxis, values)
      )];
    case "conic.parabola_focus_directrix":
      return [parabolaFromFocusDirectrix(
        requirePointValue(inputs[0]!, "parabola focus"),
        lineLikeToLine(requireLineLikeValue(inputs[1]!, "parabola directrix"))
      )];
    case "conic.hyperbola_foci":
      return [hyperbolaFromFoci(
        requirePointValue(inputs[0]!, "hyperbola focus 1"),
        requirePointValue(inputs[1]!, "hyperbola focus 2"),
        expressionNumber(params.difference, values)
      )];
    case "transform.translate_point":
      return [addPointVector(
        requirePointValue(inputs[0]!, "translation point"),
        requireVectorValue(inputs[1]!, "translation vector")
      )];
    case "transform.rotate_point":
      return [rotatePoint(
        requirePointValue(inputs[0]!, "rotation point"),
        requirePointValue(inputs[1]!, "rotation center"),
        expressionNumber(params.angle, values)
      )];
    case "transform.reflect_point_line":
      return [reflectPointAcrossLine(
        requirePointValue(inputs[0]!, "reflection point"),
        lineLikeToLine(requireLineLikeValue(inputs[1]!, "reflection line"))
      )];
    case "transform.dilate_point":
      return [dilatePoint(
        requirePointValue(inputs[0]!, "dilation point"),
        requirePointValue(inputs[1]!, "dilation center"),
        expressionNumber(params.factor, values)
      )];
    case "transform.translate":
      return [translateTransform(requireVectorValue(inputs[0]!, "translation vector"))];
    case "transform.rotate":
      return [rotateTransform(
        requirePointValue(inputs[0]!, "rotation center"),
        expressionNumber(params.angle, values)
      )];
    case "transform.reflect":
      return [reflectTransform(lineLikeToLine(requireLineLikeValue(inputs[0]!, "reflection line")))];
    case "transform.dilate":
      return [dilateTransform(
        requirePointValue(inputs[0]!, "dilation center"),
        expressionNumber(params.factor, values)
      )];
    case "transform.apply": {
      const source = inputs[0];
      if (
        source === undefined ||
        source === null ||
        typeof source === "string" ||
        typeof source === "boolean" ||
        Array.isArray(source)
      ) {
        throw new MathEngineError("TYPE_MISMATCH", "transform.apply requires a geometry value.");
      }
      const transform = requireTransformValue(inputs[1]!, "transform.apply transform");
      return [applyTransform(source as RuntimeValue, transform)];
    }
    case "function.explicit":
      return [{
        kind: "function1",
        expression: stringParam(node, "expression"),
        domain: domainParam(node)
      }];
    case "function.piecewise": {
      const value = piecewiseFunction(paramsObject(node).branches);
      for (const branch of value.branches ?? []) {
        const sample = (branch.domain[0] + branch.domain[1]) / 2;
        functionValueAt(value, sample, name => values.get(name));
      }
      return [value];
    }
    case "function.value_at":
      return [functionValueAt(
        requireFunctionValue(inputs[0]!, "function.value_at input 1"),
        requireScalarValue(inputs[1]!, "function.value_at input 2"),
        name => values.get(name)
      )];
    case "point.function_root": {
      const bracket = pairParam(node, "bracket");
      return [functionRootInInterval(
        requireFunctionValue(inputs[0]!, "point.function_root input 1"),
        bracket,
        name => values.get(name),
        paramsObject(node).tolerance === undefined ? 1e-9 : numberParam(node, "tolerance"),
        Math.round(paramsObject(node).maxIterations === undefined ? 80 : numberParam(node, "maxIterations"))
      )];
    }
    case "region.function_inequality": {
      const relation = stringParam(node, "relation");
      if (relation !== "above" && relation !== "below") {
        throw new MathEngineError("FUNCTION_REGION_INVALID_RELATION", "region.function_inequality relation must be 'above' or 'below'.", { actual: relation });
      }
      const included = paramsObject(node).boundaryIncluded;
      if (included !== undefined && typeof included !== "boolean") {
        throw new MathEngineError("FUNCTION_REGION_INVALID_BOUNDARY", "region.function_inequality boundaryIncluded must be boolean.", { actual: included });
      }
      return [functionInequalityRegion(
        requireFunctionValue(inputs[0]!, "region.function_inequality input 1"),
        relation,
        pairParam(node, "domain"),
        included === undefined ? true : included
      )];
    }
    case "curve.parametric":
      return [{
        kind: "curve2",
        xExpression: stringParam(node, "xExpression"),
        yExpression: stringParam(node, "yExpression"),
        parameter: typeof params.parameter === "string" ? params.parameter : "t",
        domain: domainParam(node)
      }];
    case "text.at": {
      const text = stringParam(node, "text");
      const at = inputs.length > 0
        ? requirePointValue(inputs[0]!, "text anchor")
        : point(...pairParam(node, "at"));
      return [{ kind: "text", text, at }];
    }
    case "text.conditional": {
      const condition = requireBooleanValue(inputs[0]!, "text.conditional input 1");
      const text = stringParam(node, condition ? "trueText" : "falseText");
      const at = inputs.length > 1
        ? requirePointValue(inputs[1]!, "text.conditional input 2")
        : point(...pairParam(node, "at"));
      return [{ kind: "text", text, at }];
    }
    case "measurement.distance":
      return [distance(requirePointValue(inputs[0]!, "distance input 1"), requirePointValue(inputs[1]!, "distance input 2"))];
    case "measurement.segment_length": {
      const value = inputs[0];
      if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean" || Array.isArray(value)) {
        throw new MathEngineError("TYPE_MISMATCH", "measurement.segment_length requires a segment or vector.");
      }
      return [valueLength(value as RuntimeValue)];
    }
    case "measurement.circle_radius":
      return [requireCircleValue(inputs[0]!, "measurement.circle_radius input").radius];
    case "measurement.angle":
      return [angleValue(
        requirePointValue(inputs[0]!, "angle measure input 1"),
        requirePointValue(inputs[1]!, "angle measure input 2"),
        requirePointValue(inputs[2]!, "angle measure input 3")
      ).radians];
    case "measurement.slope":
      return [slope(requireLineLikeValue(inputs[0]!, "slope input"))];
    case "measurement.area": {
      const value = inputs[0];
      if (isPolygon(value)) return [polygonArea(value)];
      if (isCircle(value)) return [circleArea(value)];
      if (isSector(value)) return [sectorArea(value)];
      throw new MathEngineError("TYPE_MISMATCH", "measurement.area requires polygon2, circle2, or sector2.");
    }
    case "measurement.perimeter": {
      const value = inputs[0];
      if (isPolygon(value)) return [polygonPerimeter(value)];
      if (isCircle(value)) return [circlePerimeter(value)];
      if (isArc(value)) return [arcLength(value)];
      if (isSegment(value)) return [valueLength(value)];
      throw new MathEngineError("TYPE_MISMATCH", "measurement.perimeter requires polygon2, circle2, arc2, or segment2.");
    }
    default:
      throw new MathEngineError("UNKNOWN_COMMAND", `Unsupported construction command '${node.command}'.`, {
        actual: node.command
      });
  }
}

export function evaluateMathDocument(document: MathDocument, overrides: EvaluationOverrides = {}): EvaluationResult {
  const graph = buildConstructionGraph(document);
  const entityById = new Map(document.entities.map(entity => [entity.id, entity]));
  const values = new Map<string, RuntimeValue>();
  const runtimeEntities = new Map<string, RuntimeEntity>();
  const issues: ValidationIssue[] = [];

  for (const nodeId of graph.order) {
    const node = graph.nodeById.get(nodeId)!;
    const undefinedDependency = (graph.entityDependenciesByNode.get(nodeId) ?? []).find(dependency => !values.has(dependency));
    if (undefinedDependency) {
      const issue: ValidationIssue = {
        code: "UNDEFINED_DEPENDENCY",
        severity: "error",
        path: `$.construction.${node.id}`,
        message: `Construction '${node.id}' cannot run because '${undefinedDependency}' is undefined.`,
        actual: undefinedDependency,
        retryable: true
      };
      issues.push(issue);
      for (const outputId of node.outputs) {
        const entity = entityById.get(outputId);
        if (!entity) continue;
        runtimeEntities.set(outputId, {
          id: outputId,
          entity,
          nodeId: node.id,
          command: node.command,
          dependencies: graph.entityDependenciesByNode.get(nodeId) ?? [],
          defined: false,
          issue
        });
      }
      continue;
    }

    try {
      const outputs = executeNode(node, values, overrides);
      if (outputs.length !== node.outputs.length) {
        throw new MathEngineError("OUTPUT_COUNT_MISMATCH", `Command '${node.command}' returned ${outputs.length} outputs; ${node.outputs.length} expected.`, {
          path: `$.construction.${node.id}.outputs`,
          expected: node.outputs.length,
          actual: outputs.length
        });
      }
      outputs.forEach((value, index) => {
        const outputId = node.outputs[index]!;
        const entity = entityById.get(outputId);
        if (!entity) {
          throw new MathEngineError("MISSING_ENTITY", `Construction output '${outputId}' has no entity declaration.`, {
            path: `$.construction.${node.id}.outputs[${index}]`,
            actual: outputId
          });
        }
        if (!runtimeTypeMatches(entity.type, value)) {
          throw new MathEngineError("RUNTIME_TYPE_MISMATCH", `Command '${node.command}' produced a value incompatible with entity '${outputId}' type '${entity.type}'.`, {
            path: `$.entities.${outputId}.type`,
            expected: entity.type,
            actual: typeof value === "object" ? value.kind : typeof value
          });
        }
        values.set(outputId, value);
        runtimeEntities.set(outputId, {
          id: outputId,
          entity,
          nodeId: node.id,
          command: node.command,
          dependencies: graph.entityDependenciesByNode.get(nodeId) ?? [],
          defined: true,
          value
        });
      });
    } catch (error) {
      const normalized = asMathEngineError(error, "CONSTRUCTION_EVALUATION_ERROR");
      const issue = normalized.toIssue("error");
      issue.path = normalized.path === "$" ? `$.construction.${node.id}` : normalized.path;
      issues.push(issue);
      for (const outputId of node.outputs) {
        const entity = entityById.get(outputId);
        if (!entity) continue;
        runtimeEntities.set(outputId, {
          id: outputId,
          entity,
          nodeId: node.id,
          command: node.command,
          dependencies: graph.entityDependenciesByNode.get(nodeId) ?? [],
          defined: false,
          issue
        });
      }
    }
  }

  for (const entity of document.entities) {
    if (!runtimeEntities.has(entity.id)) {
      const issue: ValidationIssue = {
        code: "UNPRODUCED_ENTITY",
        severity: "error",
        path: `$.entities.${entity.id}`,
        message: `Entity '${entity.id}' is not produced by any construction node.`,
        actual: entity.id,
        retryable: true
      };
      issues.push(issue);
      runtimeEntities.set(entity.id, {
        id: entity.id,
        entity,
        nodeId: "",
        command: "",
        dependencies: [],
        defined: false,
        issue
      });
    }
  }

  return {
    documentId: document.documentId,
    revision: document.revision,
    order: graph.order,
    entities: runtimeEntities,
    issues
  };
}

export function runtimeValueMap(evaluation: EvaluationResult): Map<string, RuntimeValue> {
  const values = new Map<string, RuntimeValue>();
  for (const [id, runtime] of evaluation.entities) {
    if (runtime.defined && runtime.value !== undefined) values.set(id, runtime.value);
  }
  return values;
}
