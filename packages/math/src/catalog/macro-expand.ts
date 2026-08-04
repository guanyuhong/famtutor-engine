import { getCommandDefinition } from "./commands.js";
import { getMacroDefinition, type MacroDefinition } from "./macros.js";
import { MathEngineError } from "../errors.js";
import type {
  ConstructionNode,
  EntityRole,
  EntityType,
  JsonValue,
  MathDocument,
  MathEntity
} from "../types.js";

export interface MacroBindingMap {
  /** Formal input name → existing entity id */
  inputs: Record<string, string>;
  /** Formal output name → desired entity id (optional; generated if omitted) */
  outputs?: Record<string, string>;
}

export interface ExpandedMacroNode {
  entity?: MathEntity;
  node: ConstructionNode;
}

export interface MacroExpansionResult {
  macro: string;
  title: string;
  entities: MathEntity[];
  construction: ConstructionNode[];
  /** Formal output name → entity id */
  outputs: Record<string, string>;
  /** Auxiliary entity ids created for the expansion */
  auxiliaries: string[];
  provenance: {
    macro: string;
    bindings: Record<string, string>;
  };
}

interface PlannedStep {
  command: string;
  inputRefs: string[];
  outputKeys: string[];
  outputTypes: EntityType[];
  params?: Record<string, JsonValue>;
  role?: EntityRole;
  description?: string;
}

function uniqueId(document: MathDocument, preferred: string, reserved: Set<string>): string {
  if (!reserved.has(preferred) && !document.entities.some(entity => entity.id === preferred) &&
      !document.construction.some(node => node.id === preferred)) {
    reserved.add(preferred);
    return preferred;
  }
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${preferred}_${index}`;
    if (!reserved.has(candidate) && !document.entities.some(entity => entity.id === candidate) &&
        !document.construction.some(node => node.id === candidate)) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new MathEngineError("ID_EXHAUSTED", `Unable to allocate unique id for '${preferred}'.`, { retryable: false });
}

function resolveCircleCenter(document: MathDocument, circleId: string): string {
  const producer = document.construction.find(node => node.outputs.includes(circleId));
  if (!producer) {
    throw new MathEngineError("MACRO_CENTER_UNRESOLVED", `Cannot resolve center for circle '${circleId}' (no producer).`, {
      actual: circleId,
      suggestedFixes: [{
        description: "Pass an explicit center entity id, or construct the circle with circle.center_radius / circle.through_points first.",
        operation: { op: "expand_macro", note: "Provide inputs.center for tangent macros." }
      }]
    });
  }
  if (
    producer.command === "circle.center_radius" ||
    producer.command === "circle.through_points"
  ) {
    const center = producer.inputs?.[0];
    if (center && "ref" in center) return center.ref;
  }
  throw new MathEngineError("MACRO_CENTER_UNRESOLVED", `Cannot resolve center for circle '${circleId}' produced by '${producer.command}'.`, {
    actual: circleId,
    expected: ["circle.center_radius", "circle.through_points"],
    suggestedFixes: [{
      description: "Provide inputs.center explicitly when expanding tangent macros over circumcircles.",
      operation: { op: "expand_macro", macro: "macro.line.tangent_at_circle_point", inputs: { center: "<centerId>", P: "<pointId>" } }
    }]
  });
}

function requireInput(bindings: MacroBindingMap, name: string, macro: string): string {
  const value = bindings.inputs[name];
  if (typeof value !== "string" || !value) {
    throw new MathEngineError("MACRO_INPUT_MISSING", `Macro '${macro}' requires input binding '${name}'.`, {
      path: `inputs.${name}`,
      expected: name,
      suggestedFixes: [{
        description: `Bind inputs.${name} to an existing entity id.`,
        operation: { op: "expand_macro", macro, inputs: { [name]: `<${name}>` } }
      }]
    });
  }
  return value;
}

function planSteps(definition: MacroDefinition, document: MathDocument, bindings: MacroBindingMap, prefix: string): {
  steps: PlannedStep[];
  formalToId: Record<string, string>;
  auxiliaries: string[];
} {
  const reserved = new Set<string>([
    ...document.entities.map(entity => entity.id),
    ...document.construction.map(node => node.id),
    ...Object.values(bindings.inputs)
  ]);
  const formalToId: Record<string, string> = { ...bindings.inputs };
  const auxiliaries: string[] = [];

  for (const [formal, id] of Object.entries(bindings.outputs ?? {})) {
    if (document.entities.some(entity => entity.id === id) || document.construction.some(node => node.outputs.includes(id))) {
      throw new MathEngineError("DUPLICATE_ENTITY_ID", `Macro output '${formal}' target id '${id}' already exists.`, {
        actual: id,
        suggestedFixes: [{ description: "Choose a fresh output id or delete the existing entity first." }]
      });
    }
    formalToId[formal] = id;
    reserved.add(id);
  }

  const allocOutput = (formal: string, preferred?: string): string => {
    if (formalToId[formal]) return formalToId[formal]!;
    const requested = preferred ?? `${prefix}_${formal}`;
    const id = uniqueId(document, requested, reserved);
    formalToId[formal] = id;
    if (!definition.outputs.includes(formal)) auxiliaries.push(id);
    return id;
  };

  const allocAux = (hint: string): string => {
    const id = uniqueId(document, `${prefix}_${hint}`, reserved);
    auxiliaries.push(id);
    return id;
  };

  const steps: PlannedStep[] = [];
  const name = definition.name;

  if (name === "macro.line.perpendicular_bisector") {
    const A = requireInput(bindings, "A", name);
    const B = requireInput(bindings, "B", name);
    const M = allocOutput("M");
    const AB = allocOutput("AB");
    const bisector = allocOutput("bisector");
    steps.push(
      { command: "point.midpoint", inputRefs: [A, B], outputKeys: [M], outputTypes: ["point2"], description: "macro midpoint" },
      { command: "segment.through_points", inputRefs: [A, B], outputKeys: [AB], outputTypes: ["segment2"], description: "macro segment AB" },
      { command: "line.perpendicular_through", inputRefs: [M, AB], outputKeys: [bisector], outputTypes: ["line2"], description: "macro perpendicular bisector" }
    );
  } else if (name === "macro.point.triangle_centroid") {
    const A = requireInput(bindings, "A", name);
    const B = requireInput(bindings, "B", name);
    const C = requireInput(bindings, "C", name);
    const Ma = allocAux("Ma");
    const Mb = allocAux("Mb");
    const medianA = allocAux("medianA");
    const medianB = allocAux("medianB");
    const G = allocOutput("G");
    steps.push(
      { command: "point.midpoint", inputRefs: [B, C], outputKeys: [Ma], outputTypes: ["point2"] },
      { command: "point.midpoint", inputRefs: [A, C], outputKeys: [Mb], outputTypes: ["point2"] },
      { command: "line.through_points", inputRefs: [A, Ma], outputKeys: [medianA], outputTypes: ["line2"] },
      { command: "line.through_points", inputRefs: [B, Mb], outputKeys: [medianB], outputTypes: ["line2"] },
      { command: "point.intersection_line_line", inputRefs: [medianA, medianB], outputKeys: [G], outputTypes: ["point2"] }
    );
  } else if (name === "macro.point.triangle_orthocenter") {
    const A = requireInput(bindings, "A", name);
    const B = requireInput(bindings, "B", name);
    const C = requireInput(bindings, "C", name);
    const sideBC = allocAux("sideBC");
    const sideAC = allocAux("sideAC");
    const altA = allocAux("altA");
    const altB = allocAux("altB");
    const H = allocOutput("H");
    steps.push(
      { command: "line.through_points", inputRefs: [B, C], outputKeys: [sideBC], outputTypes: ["line2"] },
      { command: "line.through_points", inputRefs: [A, C], outputKeys: [sideAC], outputTypes: ["line2"] },
      { command: "line.perpendicular_through", inputRefs: [A, sideBC], outputKeys: [altA], outputTypes: ["line2"] },
      { command: "line.perpendicular_through", inputRefs: [B, sideAC], outputKeys: [altB], outputTypes: ["line2"] },
      { command: "point.intersection_line_line", inputRefs: [altA, altB], outputKeys: [H], outputTypes: ["point2"] }
    );
  } else if (name === "macro.point.triangle_circumcenter") {
    const A = requireInput(bindings, "A", name);
    const B = requireInput(bindings, "B", name);
    const C = requireInput(bindings, "C", name);
    const Ma = allocAux("Ma");
    const Mb = allocAux("Mb");
    const sideBC = allocAux("sideBC");
    const sideAC = allocAux("sideAC");
    const pbA = allocAux("pbA");
    const pbB = allocAux("pbB");
    const O = allocOutput("O");
    const circum = allocOutput("circum");
    steps.push(
      { command: "point.midpoint", inputRefs: [B, C], outputKeys: [Ma], outputTypes: ["point2"] },
      { command: "point.midpoint", inputRefs: [A, C], outputKeys: [Mb], outputTypes: ["point2"] },
      { command: "line.through_points", inputRefs: [B, C], outputKeys: [sideBC], outputTypes: ["line2"] },
      { command: "line.through_points", inputRefs: [A, C], outputKeys: [sideAC], outputTypes: ["line2"] },
      { command: "line.perpendicular_through", inputRefs: [Ma, sideBC], outputKeys: [pbA], outputTypes: ["line2"] },
      { command: "line.perpendicular_through", inputRefs: [Mb, sideAC], outputKeys: [pbB], outputTypes: ["line2"] },
      { command: "point.intersection_line_line", inputRefs: [pbA, pbB], outputKeys: [O], outputTypes: ["point2"] },
      { command: "circle.through_points", inputRefs: [O, A], outputKeys: [circum], outputTypes: ["circle2"] }
    );
  } else if (name === "macro.ray.angle_bisector") {
    const A = requireInput(bindings, "A", name);
    const B = requireInput(bindings, "B", name);
    const C = requireInput(bindings, "C", name);
    const cBA = allocAux("cBA");
    const lineBC = allocAux("lineBC");
    const D1 = allocAux("D1");
    const D2 = allocAux("D2");
    const cA = allocAux("cA");
    const cD = allocAux("cD");
    const E1 = allocAux("E1");
    const E2 = allocAux("E2");
    const bisector = allocOutput("bisector");
    // D1 is preferred contact on BC by stable intersection order; E1 preferred bisector point.
    steps.push(
      { command: "circle.through_points", inputRefs: [B, A], outputKeys: [cBA], outputTypes: ["circle2"] },
      { command: "line.through_points", inputRefs: [B, C], outputKeys: [lineBC], outputTypes: ["line2"] },
      { command: "point.intersection_line_circle", inputRefs: [lineBC, cBA], outputKeys: [D1, D2], outputTypes: ["point2", "point2"] },
      { command: "circle.through_points", inputRefs: [A, D1], outputKeys: [cA], outputTypes: ["circle2"] },
      { command: "circle.through_points", inputRefs: [D1, A], outputKeys: [cD], outputTypes: ["circle2"] },
      { command: "point.intersection_circle_circle", inputRefs: [cA, cD], outputKeys: [E1, E2], outputTypes: ["point2", "point2"] },
      { command: "ray.from_points", inputRefs: [B, E1], outputKeys: [bisector], outputTypes: ["ray2"] }
    );
  } else if (name === "macro.point.triangle_incenter") {
    const A = requireInput(bindings, "A", name);
    const B = requireInput(bindings, "B", name);
    const C = requireInput(bindings, "C", name);
    const pushAngleBisector = (left: string, vertex: string, right: string, tag: string): string => {
      const cBA = allocAux(`${tag}_c`);
      const lineBC = allocAux(`${tag}_line`);
      const D1 = allocAux(`${tag}_D1`);
      const D2 = allocAux(`${tag}_D2`);
      const cA = allocAux(`${tag}_cA`);
      const cD = allocAux(`${tag}_cD`);
      const E1 = allocAux(`${tag}_E1`);
      const E2 = allocAux(`${tag}_E2`);
      const rayId = allocAux(`${tag}_ray`);
      steps.push(
        { command: "circle.through_points", inputRefs: [vertex, left], outputKeys: [cBA], outputTypes: ["circle2"] },
        { command: "line.through_points", inputRefs: [vertex, right], outputKeys: [lineBC], outputTypes: ["line2"] },
        { command: "point.intersection_line_circle", inputRefs: [lineBC, cBA], outputKeys: [D1, D2], outputTypes: ["point2", "point2"] },
        { command: "circle.through_points", inputRefs: [left, D1], outputKeys: [cA], outputTypes: ["circle2"] },
        { command: "circle.through_points", inputRefs: [D1, left], outputKeys: [cD], outputTypes: ["circle2"] },
        { command: "point.intersection_circle_circle", inputRefs: [cA, cD], outputKeys: [E1, E2], outputTypes: ["point2", "point2"] },
        { command: "ray.from_points", inputRefs: [vertex, E1], outputKeys: [rayId], outputTypes: ["ray2"] }
      );
      return rayId;
    };
    const bisA = pushAngleBisector(B, A, C, "bisA");
    const bisB = pushAngleBisector(A, B, C, "bisB");
    const I = allocOutput("I");
    steps.push({
      command: "point.intersection_line_line",
      inputRefs: [bisA, bisB],
      outputKeys: [I],
      outputTypes: ["point2"],
      description: "incenter as angle-bisector intersection"
    });
  } else if (name === "macro.line.tangent_at_circle_point") {
    const P = requireInput(bindings, "P", name);
    const center = bindings.inputs.center
      ? requireInput(bindings, "center", name)
      : resolveCircleCenter(document, requireInput(bindings, "circle", name));
    const radiusLine = allocAux("radius");
    const tangent = allocOutput("tangent");
    steps.push(
      { command: "line.through_points", inputRefs: [center, P], outputKeys: [radiusLine], outputTypes: ["line2"] },
      { command: "line.perpendicular_through", inputRefs: [P, radiusLine], outputKeys: [tangent], outputTypes: ["line2"] }
    );
  } else if (name === "macro.line.tangents_from_external_point") {
    const P = requireInput(bindings, "P", name);
    const circle = requireInput(bindings, "circle", name);
    const center = bindings.inputs.center
      ? requireInput(bindings, "center", name)
      : resolveCircleCenter(document, circle);
    const M = allocAux("M");
    const diam = allocAux("diam");
    const T1 = allocOutput("T1");
    const T2 = allocOutput("T2");
    const tangent1 = allocOutput("tangent1");
    const tangent2 = allocOutput("tangent2");
    steps.push(
      { command: "point.midpoint", inputRefs: [center, P], outputKeys: [M], outputTypes: ["point2"] },
      { command: "circle.through_points", inputRefs: [M, center], outputKeys: [diam], outputTypes: ["circle2"] },
      { command: "point.intersection_circle_circle", inputRefs: [circle, diam], outputKeys: [T1, T2], outputTypes: ["point2", "point2"] },
      { command: "line.through_points", inputRefs: [P, T1], outputKeys: [tangent1], outputTypes: ["line2"] },
      { command: "line.through_points", inputRefs: [P, T2], outputKeys: [tangent2], outputTypes: ["line2"] }
    );
  } else if (name === "macro.line.common_tangents") {
    const circle1 = requireInput(bindings, "circle1", name);
    const circle2 = requireInput(bindings, "circle2", name);
    const external1 = allocOutput("external1");
    const external2 = allocOutput("external2");
    const internal1 = allocOutput("internal1");
    const internal2 = allocOutput("internal2");
    steps.push(
      { command: "line.common_tangent", inputRefs: [circle1, circle2], outputKeys: [external1], outputTypes: ["line2"], params: { side1: 1, side2: 1 } },
      { command: "line.common_tangent", inputRefs: [circle1, circle2], outputKeys: [external2], outputTypes: ["line2"], params: { side1: -1, side2: -1 } },
      { command: "line.common_tangent", inputRefs: [circle1, circle2], outputKeys: [internal1], outputTypes: ["line2"], params: { side1: 1, side2: -1 } },
      { command: "line.common_tangent", inputRefs: [circle1, circle2], outputKeys: [internal2], outputTypes: ["line2"], params: { side1: -1, side2: 1 } }
    );
  } else {
    throw new MathEngineError("MACRO_NOT_EXECUTABLE", `Macro '${name}' has no executable expander yet.`, {
      actual: name,
      suggestedFixes: [{ description: "Use L0 commands directly, or pick an executable macro from math_capabilities.macros." }]
    });
  }

  return { steps, formalToId, auxiliaries };
}

/**
 * Expand an L1 macro into L0 entities + construction nodes.
 * Does not mutate the document; caller applies the result.
 */
export function expandMacro(
  document: MathDocument,
  request: {
    macro: string;
    inputs: Record<string, string>;
    outputs?: Record<string, string>;
    idPrefix?: string;
  }
): MacroExpansionResult {
  const definition = getMacroDefinition(request.macro);
  if (!definition) {
    throw new MathEngineError("UNKNOWN_MACRO", `Unknown macro '${request.macro}'.`, {
      actual: request.macro,
      suggestedFixes: [{ description: "Call math_capabilities and use a listed macro name." }]
    });
  }
  for (const inputName of definition.inputs) {
    // circle-only macros may accept center as alternative; validated in planSteps
    if (inputName === "circle" && request.inputs.center && !request.inputs.circle) continue;
    if (inputName === "center") continue;
    if ((nameRequires(definition, inputName)) && !request.inputs[inputName] && !(inputName === "circle" && request.inputs.center)) {
      // handled by requireInput later for required ones
    }
  }

  const prefix = request.idPrefix ?? `m_${definition.name.split(".").pop()}`;
  const { steps, formalToId, auxiliaries } = planSteps(
    definition,
    document,
    { inputs: request.inputs, outputs: request.outputs },
    prefix
  );

  const entities: MathEntity[] = [];
  const construction: ConstructionNode[] = [];
  const existingIds = new Set(document.entities.map(entity => entity.id));
  const formalById = new Map(Object.entries(formalToId).map(([formal, id]) => [id, formal]));
  const usedNodeIds = new Set(document.construction.map(node => node.id));

  for (const step of steps) {
    const definitionCommand = getCommandDefinition(step.command);
    if (!definitionCommand) {
      throw new MathEngineError("UNKNOWN_COMMAND", `Macro expansion referenced unknown command '${step.command}'.`, {
        actual: step.command
      });
    }
    const outputs = step.outputKeys;
    outputs.forEach((outputId, index) => {
      if (existingIds.has(outputId) || entities.some(entity => entity.id === outputId)) return;
      const expected = definitionCommand.outputTypes[index]!;
      const type = (Array.isArray(expected) ? step.outputTypes[index]! : expected) as EntityType;
      const formal = formalById.get(outputId);
      const entity: MathEntity = {
        id: outputId,
        type,
        role: step.role ?? "derived",
        description: `Expanded from ${definition.name}`
      };
      if (formal && definition.outputs.includes(formal)) entity.label = formal;
      entities.push(entity);
    });
    let nodeId = `op-${outputs.join("-")}`;
    if (usedNodeIds.has(nodeId)) nodeId = uniqueId(document, nodeId, usedNodeIds);
    else usedNodeIds.add(nodeId);
    const node: ConstructionNode = {
      id: nodeId,
      command: step.command,
      inputs: step.inputRefs.map(ref => ({ ref })),
      outputs,
      description: step.description ?? `Expanded from ${definition.name}`
    };
    if (step.params !== undefined) node.params = step.params;
    construction.push(node);
  }

  const outputs: Record<string, string> = {};
  for (const formal of definition.outputs) {
    if (formalToId[formal]) outputs[formal] = formalToId[formal]!;
  }

  return {
    macro: definition.name,
    title: definition.title,
    entities,
    construction,
    outputs,
    auxiliaries,
    provenance: {
      macro: definition.name,
      bindings: { ...request.inputs, ...outputs }
    }
  };
}

function nameRequires(definition: MacroDefinition, inputName: string): boolean {
  return definition.inputs.includes(inputName);
}

/** Apply a macro expansion onto a document draft (mutates). */
export function applyMacroExpansion(document: MathDocument, expansion: MacroExpansionResult): void {
  const existing = new Set(document.entities.map(entity => entity.id));
  for (const entity of expansion.entities) {
    if (!existing.has(entity.id)) {
      document.entities.push(entity);
      existing.add(entity.id);
    }
  }
  const existingNodes = new Set(document.construction.map(node => node.id));
  for (const node of expansion.construction) {
    let nodeId = node.id;
    if (existingNodes.has(nodeId)) {
      nodeId = uniqueId(document, `${node.id}_x`, existingNodes);
    }
    existingNodes.add(nodeId);
    document.construction.push({ ...node, id: nodeId });
  }
  if (!document.provenance) {
    document.provenance = {
      createdAt: new Date().toISOString(),
      generator: "agent",
      sourceRefs: [`macro:${expansion.macro}`]
    };
  } else {
    const refs = document.provenance.sourceRefs ?? [];
    refs.push(`macro:${expansion.macro}`);
    document.provenance.sourceRefs = refs;
    document.provenance.updatedAt = new Date().toISOString();
  }
}
