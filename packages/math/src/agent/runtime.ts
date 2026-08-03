import { commandCapabilities, getCommandDefinition, typeConstraintMatches, type TypeConstraint } from "../catalog/commands.js";
import { applyMacroExpansion, expandMacro } from "../catalog/macro-expand.js";
import { macroCapabilities } from "../catalog/macros.js";
import { MathEngineError, asMathEngineError } from "../errors.js";
import { evaluateExpression } from "../expression/evaluator.js";
import { collectExpressionIdentifiers, parseExpression } from "../expression/parser.js";
import { evaluateMathDocument } from "../kernel/evaluate.js";
import { buildConstructionGraph, transitiveDependentNodes } from "../kernel/dag.js";
import { applySimulationFinalState, simulateMathDocument, type SimulationAction } from "../kernel/simulate.js";
import { validateMathDocument } from "../protocol/validate.js";
import { renderDirectSvg } from "../render/direct-svg.js";
import type {
  ConstructionNode,
  EntityRole,
  EntityType,
  InteractionPolicy,
  JsonValue,
  MathAssertion,
  MathDocument,
  MathEntity,
  MathView,
  StyleBinding
} from "../types.js";
import { deepClone, finiteNumber, isPlainObject, nowIso, stableHash, toJsonValue } from "../util.js";
import { enrichIssuesWithRepair, repairSuggestionsForError } from "./repair.js";
import { DocumentStore } from "./store.js";
import { agentToolDefinitions } from "./tools.js";

export interface AgentMathRuntimeOptions {
  store?: DocumentStore;
  maxOperations?: number;
}

export interface AgentToolCallResult {
  ok: boolean;
  [key: string]: JsonValue;
}

function objectArg(value: unknown, path = "arguments"): Record<string, unknown> {
  if (!isPlainObject(value)) throw new MathEngineError("INVALID_TOOL_ARGUMENTS", `${path} must be an object.`, { path });
  return value;
}

function stringArg(value: unknown, name: string, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new MathEngineError("INVALID_TOOL_ARGUMENT", `${name} must be a non-empty string.`, { path: name, actual: String(value) });
  return value;
}

function booleanArg(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberArg(value: unknown, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!finiteNumber(value)) throw new MathEngineError("INVALID_TOOL_ARGUMENT", `${name} must be a finite number.`, { path: name, actual: String(value) });
  return value;
}

function roleForCommand(command: string): EntityRole {
  if (command === "point.free" || command === "point.on_path" || command === "scalar.slider") return "free";
  if (command.startsWith("measurement.")) return "measurement";
  if (command === "text.at") return "annotation";
  return "derived";
}

function uniqueNodeId(document: MathDocument, preferred: string): string {
  const existing = new Set(document.construction.map(node => node.id));
  if (!existing.has(preferred)) return preferred;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${preferred}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new MathEngineError("NODE_ID_EXHAUSTED", `Unable to generate a unique node ID for '${preferred}'.`, { retryable: false });
}

function normalizeInputs(raw: unknown): ConstructionNode["inputs"] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new MathEngineError("INVALID_OPERATION_INPUTS", "construct.inputs must be an array.");
  return raw.map((input, index) => {
    if (!isPlainObject(input)) throw new MathEngineError("INVALID_OPERATION_INPUT", `construct.inputs[${index}] must be {ref} or {value}.`);
    if (typeof input.ref === "string" && !Object.hasOwn(input, "value")) return { ref: input.ref };
    if (Object.hasOwn(input, "value") && !Object.hasOwn(input, "ref")) return { value: toJsonValue(input.value) };
    throw new MathEngineError("INVALID_OPERATION_INPUT", `construct.inputs[${index}] needs exactly one of ref or value.`);
  });
}

function normalizeConstructOutputs(
  document: MathDocument,
  raw: unknown,
  expectedTypes: readonly TypeConstraint[],
  command: string
): { ids: string[]; entities: MathEntity[] } {
  if (!Array.isArray(raw) || raw.length !== expectedTypes.length) {
    throw new MathEngineError("OUTPUT_COUNT_MISMATCH", `construct.outputs for '${command}' must contain ${expectedTypes.length} item(s).`, {
      expected: expectedTypes.length,
      actual: Array.isArray(raw) ? raw.length : String(typeof raw)
    });
  }
  const existing = new Set(document.entities.map(entity => entity.id));
  const ids: string[] = [];
  const entities: MathEntity[] = [];
  raw.forEach((item, index) => {
    const expected = expectedTypes[index]!;
    const descriptor = typeof item === "string" ? { id: item } : objectArg(item, `construct.outputs[${index}]`);
    const id = stringArg(descriptor.id, `construct.outputs[${index}].id`)!;
    if (existing.has(id) || ids.includes(id)) throw new MathEngineError("DUPLICATE_ENTITY_ID", `Entity '${id}' already exists.`, { actual: id });
    const declaredType = descriptor.type === undefined ? undefined : String(descriptor.type) as EntityType;
    const expectedIsUnion = Array.isArray(expected);
    let resolvedType: EntityType;
    if (expectedIsUnion) {
      const allowed = expected as readonly EntityType[];
      if (!declaredType) {
        throw new MathEngineError("OUTPUT_TYPE_REQUIRED", `Output '${id}' of '${command}' must declare type when multiple output types are allowed.`, {
          expected: [...allowed]
        });
      }
      if (!typeConstraintMatches(allowed, declaredType)) {
        throw new MathEngineError("OUTPUT_TYPE_MISMATCH", `Output '${id}' of '${command}' has incompatible type '${declaredType}'.`, {
          expected: [...allowed],
          actual: declaredType
        });
      }
      resolvedType = declaredType;
    } else {
      const singleExpected = expected as EntityType;
      resolvedType = declaredType ?? singleExpected;
      if (resolvedType !== singleExpected) {
        throw new MathEngineError("OUTPUT_TYPE_MISMATCH", `Output '${id}' of '${command}' must be '${singleExpected}'.`, {
          expected: singleExpected,
          actual: String(resolvedType)
        });
      }
    }
    const role = descriptor.role === undefined ? roleForCommand(command) : String(descriptor.role) as EntityRole;
    ids.push(id);
    entities.push({
      id,
      type: resolvedType,
      role,
      label: typeof descriptor.label === "string" ? descriptor.label : undefined,
      visible: typeof descriptor.visible === "boolean" ? descriptor.visible : undefined,
      description: typeof descriptor.description === "string" ? descriptor.description : undefined
    });
  });
  return { ids, entities };
}

function operationExpandMacro(document: MathDocument, operation: Record<string, unknown>): Record<string, JsonValue> {
  const macro = stringArg(operation.macro, "expand_macro.macro")!;
  const inputsRaw = objectArg(operation.inputs, "expand_macro.inputs");
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputsRaw)) {
    if (typeof value !== "string" || !value) {
      throw new MathEngineError("MACRO_INPUT_MISSING", `expand_macro.inputs.${key} must be a non-empty entity id.`, {
        path: `inputs.${key}`
      });
    }
    inputs[key] = value;
  }
  const outputsRaw = operation.outputs === undefined ? undefined : objectArg(operation.outputs, "expand_macro.outputs");
  const outputs = outputsRaw
    ? Object.fromEntries(Object.entries(outputsRaw).map(([key, value]) => {
      if (typeof value !== "string" || !value) {
        throw new MathEngineError("INVALID_OPERATION", `expand_macro.outputs.${key} must be a non-empty entity id.`);
      }
      return [key, value];
    }))
    : undefined;
  const expansion = expandMacro(document, {
    macro,
    inputs,
    outputs,
    idPrefix: typeof operation.idPrefix === "string" ? operation.idPrefix : undefined
  });
  applyMacroExpansion(document, expansion);
  return {
    macro: expansion.macro,
    outputs: expansion.outputs,
    auxiliaries: expansion.auxiliaries,
    addedEntities: expansion.entities.map(entity => entity.id),
    addedNodes: expansion.construction.map(node => node.id),
    provenance: expansion.provenance
  };
}

function operationConstruct(document: MathDocument, operation: Record<string, unknown>): void {
  const command = stringArg(operation.command, "construct.command")!;
  const definition = getCommandDefinition(command);
  if (!definition) throw new MathEngineError("UNKNOWN_COMMAND", `Unknown command '${command}'.`, { actual: command });
  const outputs = normalizeConstructOutputs(document, operation.outputs, definition.outputTypes, command);
  const nodeId = typeof operation.nodeId === "string"
    ? operation.nodeId
    : uniqueNodeId(document, `op-${outputs.ids.join("-")}`);
  if (document.construction.some(node => node.id === nodeId)) throw new MathEngineError("DUPLICATE_NODE_ID", `Construction node '${nodeId}' already exists.`);
  const params = operation.params === undefined
    ? undefined
    : Object.fromEntries(Object.entries(objectArg(operation.params, "construct.params")).map(([key, value]) => [key, toJsonValue(value)]));
  document.entities.push(...outputs.entities);
  document.construction.push({
    id: nodeId,
    command,
    inputs: normalizeInputs(operation.inputs),
    params,
    outputs: outputs.ids,
    description: typeof operation.description === "string" ? operation.description : undefined
  });
}

function operationSetParams(document: MathDocument, operation: Record<string, unknown>): void {
  const nodeId = stringArg(operation.nodeId, "set_params.nodeId")!;
  const node = document.construction.find(candidate => candidate.id === nodeId);
  if (!node) throw new MathEngineError("NODE_NOT_FOUND", `Construction node '${nodeId}' was not found.`);
  const patch = objectArg(operation.patch, "set_params.patch");
  node.params = {
    ...(node.params ?? {}),
    ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, toJsonValue(value)]))
  };
  if (Array.isArray(operation.remove)) {
    for (const key of operation.remove) if (typeof key === "string") delete node.params[key];
  }
}

function operationSetEntity(document: MathDocument, operation: Record<string, unknown>): void {
  const entityId = stringArg(operation.entityId, "set_entity.entityId")!;
  const entity = document.entities.find(candidate => candidate.id === entityId);
  if (!entity) throw new MathEngineError("ENTITY_NOT_FOUND", `Entity '${entityId}' was not found.`);
  const patch = objectArg(operation.patch, "set_entity.patch");
  const allowed = new Set(["label", "role", "visible", "description"]);
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw new MathEngineError("ENTITY_FIELD_IMMUTABLE", `Entity field '${key}' cannot be changed by set_entity.`);
  if (patch.label === null) delete entity.label;
  else if (typeof patch.label === "string") entity.label = patch.label;
  if (typeof patch.role === "string") entity.role = patch.role as EntityRole;
  if (typeof patch.visible === "boolean") entity.visible = patch.visible;
  if (patch.description === null) delete entity.description;
  else if (typeof patch.description === "string") entity.description = patch.description;
}

function assertionReferences(assertion: MathAssertion, entityIds: Set<string>): boolean {
  return assertion.arguments.some(argument => {
    if ("ref" in argument) return entityIds.has(argument.ref);
    if ("expr" in argument) {
      try {
        return [...collectExpressionIdentifiers(parseExpression(argument.expr))].some(id => entityIds.has(id));
      } catch {
        return true;
      }
    }
    return false;
  });
}

function operationDelete(document: MathDocument, operation: Record<string, unknown>): void {
  const rawTargets = operation.targets ?? (operation.target ? [operation.target] : undefined);
  if (!Array.isArray(rawTargets) || rawTargets.length === 0 || rawTargets.some(target => typeof target !== "string")) {
    throw new MathEngineError("INVALID_DELETE_TARGETS", "delete.targets must be a non-empty string array.");
  }
  const targets = rawTargets as string[];
  const cascade = booleanArg(operation.cascade, false);
  const graph = buildConstructionGraph(document);
  const producerNodes = targets.flatMap(target => {
    const producer = graph.producerByEntity.get(target);
    if (producer) return [producer];
    if (graph.nodeById.has(target)) return [target];
    throw new MathEngineError("DELETE_TARGET_NOT_FOUND", `Delete target '${target}' is neither an entity nor a construction node.`);
  });
  const dependentNodes = transitiveDependentNodes(graph, producerNodes);
  if (dependentNodes.length > 0 && !cascade) {
    throw new MathEngineError("DELETE_HAS_DEPENDENTS", "Delete would invalidate dependent construction nodes; retry with cascade=true.", {
      actual: toJsonValue([...dependentNodes]),
      suggestedFixes: [
        { description: "Retry delete with cascade=true.", operation: { op: "delete", targets, cascade: true } },
        { description: "Hide the entity instead of deleting.", operation: { op: "set_entity", entityId: targets[0]!, patch: { visible: false } } }
      ]
    });
  }
  const deleteNodes = new Set([...producerNodes, ...(cascade ? dependentNodes : [])]);
  const deleteEntities = new Set([...deleteNodes].flatMap(nodeId => graph.outputsByNode.get(nodeId) ?? []));
  document.construction = document.construction.filter(node => !deleteNodes.has(node.id));
  document.entities = document.entities.filter(entity => !deleteEntities.has(entity.id));
  document.styles = document.styles
    ?.map(binding => ({ ...binding, targets: binding.targets.filter(target => !deleteEntities.has(target)) }))
    .filter(binding => binding.targets.length > 0);
  document.interactions = document.interactions?.filter(policy => !deleteEntities.has(policy.target) && !deleteEntities.has(policy.dragTarget ?? ""));
  document.assertions = document.assertions?.filter(assertion => !assertionReferences(assertion, deleteEntities));
  document.views = document.views.map(view => view.kind === "graphics2d" && view.entityIds
    ? { ...view, entityIds: view.entityIds.filter(id => !deleteEntities.has(id)) }
    : view);
  document.activities = document.activities?.map(activity => ({
    ...activity,
    stages: activity.stages?.map(stage => ({
      ...stage,
      reveal: stage.reveal?.filter(id => !deleteEntities.has(id)),
      hide: stage.hide?.filter(id => !deleteEntities.has(id)),
      focus: stage.focus?.filter(id => !deleteEntities.has(id))
    }))
  }));
}

function operationAddAssertion(document: MathDocument, operation: Record<string, unknown>): void {
  const assertion = deepClone(objectArg(operation.assertion, "add_assertion.assertion")) as unknown as MathAssertion;
  if (!assertion.id || typeof assertion.id !== "string") throw new MathEngineError("INVALID_ASSERTION", "add_assertion.assertion.id is required.");
  if (document.assertions?.some(candidate => candidate.id === assertion.id)) throw new MathEngineError("DUPLICATE_ASSERTION_ID", `Assertion '${assertion.id}' already exists.`);
  document.assertions = [...(document.assertions ?? []), assertion];
}

function operationRemoveAssertion(document: MathDocument, operation: Record<string, unknown>): void {
  const assertionId = stringArg(operation.assertionId, "remove_assertion.assertionId")!;
  const before = document.assertions?.length ?? 0;
  document.assertions = document.assertions?.filter(assertion => assertion.id !== assertionId);
  if ((document.assertions?.length ?? 0) === before) throw new MathEngineError("ASSERTION_NOT_FOUND", `Assertion '${assertionId}' was not found.`);
}

function operationSetStyle(document: MathDocument, operation: Record<string, unknown>): void {
  const targets = operation.targets;
  if (!Array.isArray(targets) || targets.length === 0 || targets.some(target => typeof target !== "string")) throw new MathEngineError("INVALID_STYLE_TARGETS", "set_style.targets must be a non-empty string array.");
  const style = deepClone(objectArg(operation.style, "set_style.style")) as unknown as StyleBinding["style"];
  document.styles = [...(document.styles ?? []), { targets: targets as string[], style }];
}

function operationSetInteraction(document: MathDocument, operation: Record<string, unknown>): void {
  const policy = deepClone(objectArg(operation.policy, "set_interaction.policy")) as unknown as InteractionPolicy;
  if (typeof policy.target !== "string") throw new MathEngineError("INVALID_INTERACTION", "set_interaction.policy.target is required.");
  document.interactions = [...(document.interactions ?? []).filter(candidate => candidate.target !== policy.target), policy];
}

function operationSetView(document: MathDocument, operation: Record<string, unknown>): void {
  const viewId = stringArg(operation.viewId, "set_view.viewId")!;
  const index = document.views.findIndex(view => view.id === viewId);
  if (index < 0) throw new MathEngineError("VIEW_NOT_FOUND", `View '${viewId}' was not found.`);
  const patch = objectArg(operation.patch, "set_view.patch");
  const immutable = new Set(["id", "kind"]);
  for (const key of Object.keys(patch)) if (immutable.has(key)) throw new MathEngineError("VIEW_FIELD_IMMUTABLE", `View field '${key}' cannot be changed.`);
  document.views[index] = { ...document.views[index], ...deepClone(patch) } as MathView;
}

function createSkeleton(args: Record<string, unknown>): MathDocument {
  const documentId = stringArg(args.documentId, "documentId")!;
  const title = stringArg(args.title, "title", false) ?? documentId;
  const locale = stringArg(args.locale, "locale", false) ?? "zh-CN";
  const purpose = (stringArg(args.purpose, "purpose", false) ?? "authoring") as MathDocument["metadata"]["purpose"];
  const box = args.boundingBox;
  const boundingBox: [number, number, number, number] = Array.isArray(box) && box.length === 4 && box.every(finiteNumber)
    ? [box[0] as number, box[1] as number, box[2] as number, box[3] as number]
    : [-6, 6, 6, -6];
  return {
    schema: "famtutor.math.document.v1",
    documentId,
    revision: 1,
    seed: 0,
    metadata: { title, locale, purpose },
    entities: [],
    construction: [],
    views: [{
      id: "main",
      kind: "graphics2d",
      visible: true,
      renderer: "jsxgraph-svg",
      boundingBox,
      axes: true,
      grid: false,
      keepAspectRatio: true,
      cameraPolicy: "document"
    }],
    provenance: { generator: "agent", createdAt: nowIso(), updatedAt: nowIso() }
  };
}

function summarizeDocument(document: MathDocument): Record<string, JsonValue> {
  const categories: Record<string, number> = {};
  for (const entity of document.entities) categories[entity.type] = (categories[entity.type] ?? 0) + 1;
  return {
    documentId: document.documentId,
    revision: document.revision,
    title: document.metadata.title,
    entities: document.entities.length,
    constructionNodes: document.construction.length,
    assertions: document.assertions?.length ?? 0,
    views: document.views.length,
    entityTypes: categories
  };
}

export class AgentMathRuntime {
  readonly store: DocumentStore;
  readonly maxOperations: number;

  constructor(options: AgentMathRuntimeOptions = {}) {
    this.store = options.store ?? new DocumentStore();
    this.maxOperations = options.maxOperations ?? 128;
  }

  listTools() {
    return agentToolDefinitions();
  }

  async callTool(name: string, rawArguments: unknown = {}): Promise<AgentToolCallResult> {
    try {
      const args = objectArg(rawArguments);
      switch (name) {
        case "math_capabilities": return this.capabilities(args);
        case "math_create": return this.create(args);
        case "math_apply": return this.apply(args);
        case "math_inspect": return this.inspect(args);
        case "math_validate": return this.validate(args);
        case "math_render": return this.render(args);
        case "math_simulate": return this.simulate(args);
        case "math_export": return this.export(args);
        case "math_evaluate": return this.evaluate(args);
        default: throw new MathEngineError("UNKNOWN_TOOL", `Unknown Agent Math tool '${name}'.`, { actual: name });
      }
    } catch (error) {
      const normalized = asMathEngineError(error);
      const suggestedFixes = repairSuggestionsForError(normalized);
      return {
        ok: false,
        error: {
          code: normalized.code,
          message: normalized.message,
          path: normalized.path,
          expected: normalized.expected ?? null,
          actual: normalized.actual ?? null,
          retryable: normalized.retryable,
          details: normalized.details ?? null,
          suggestedFixes: suggestedFixes.length > 0 ? toJsonValue(suggestedFixes) : null
        }
      };
    }
  }

  private capabilities(args: Record<string, unknown>): AgentToolCallResult {
    const category = typeof args.category === "string" ? args.category : undefined;
    const prefix = typeof args.commandPrefix === "string" ? args.commandPrefix : undefined;
    const commands = commandCapabilities().filter(command =>
      (!category || command.category === category) && (!prefix || String(command.name).startsWith(prefix))
    );
    return {
      ok: true,
      runtime: { name: "@famtutor/math-runtime", version: "0.1.1" },
      protocol: "famtutor.math.document.v1",
      renderers: ["direct-svg", "jsxgraph-svg", "jsxgraph-canvas"],
      commands: toJsonValue(commands),
      macros: toJsonValue(macroCapabilities()) as JsonValue,
      tools: toJsonValue(this.listTools().map(tool => tool.name)),
      limits: toJsonValue({ maxOperations: this.maxOperations, maxSimulationSamples: 256, maxRenderDimension: 4096 }),
      workflow: toJsonValue(["math_capabilities", "math_create", "math_apply(expand_macro|construct)", "math_validate", "math_render", "math_simulate", "math_inspect"])
    };
  }

  private create(args: Record<string, unknown>): AgentToolCallResult {
    const document = args.document === undefined ? createSkeleton(args) : deepClone(args.document) as MathDocument;
    const report = validateMathDocument(document);
    if (report.status === "invalid") {
      throw new MathEngineError("INVALID_MATH_DOCUMENT", `Document creation failed with ${report.issues.length} validation issue(s).`, {
        actual: toJsonValue(report.issues.slice(0, 12)),
        details: { report: toJsonValue(report) }
      });
    }
    const stored = this.store.create(document, booleanArg(args.replace, false));
    return { ok: true, document: toJsonValue(stored), summary: summarizeDocument(stored), validation: toJsonValue(report) };
  }

  private apply(args: Record<string, unknown>): AgentToolCallResult {
    const documentId = stringArg(args.documentId, "documentId")!;
    const operations = args.operations;
    if (!Array.isArray(operations) || operations.length === 0) throw new MathEngineError("INVALID_OPERATIONS", "operations must be a non-empty array.");
    if (operations.length > this.maxOperations) throw new MathEngineError("OPERATION_LIMIT", `At most ${this.maxOperations} operations are allowed per transaction.`);
    const expectedRevision = args.expectedRevision === undefined ? undefined : numberArg(args.expectedRevision, "expectedRevision");
    const current = this.store.get(documentId);
    const idempotencyKey = typeof args.idempotencyKey === "string" ? args.idempotencyKey : undefined;
    // Idempotent replays must return the original committed result even when the
    // caller still carries the pre-commit revision. This also prevents duplicate
    // Agent retries from being misclassified as optimistic-lock conflicts.
    if (idempotencyKey) {
      const cached = this.store.getIdempotent(documentId, idempotencyKey);
      if (cached && isPlainObject(cached)) return cached as AgentToolCallResult;
    }
    if (expectedRevision !== undefined && current.revision !== expectedRevision) {
      throw new MathEngineError("REVISION_CONFLICT", `Expected revision ${expectedRevision}, but current revision is ${current.revision}.`, {
        expected: expectedRevision,
        actual: current.revision
      });
    }
    if (operations.some(operation => isPlainObject(operation) && operation.op === "undo")) {
      if (operations.length !== 1 || !isPlainObject(operations[0]) || operations[0].op !== "undo") {
        throw new MathEngineError("UNDO_TRANSACTION_SHAPE", "undo must be the only operation in a transaction.");
      }
      const restored = booleanArg(args.dryRun, false) ? current : this.store.undo(documentId);
      const result: AgentToolCallResult = { ok: true, dryRun: booleanArg(args.dryRun, false), document: toJsonValue(restored), summary: summarizeDocument(restored) };
      return result;
    }

    const draft = deepClone(current);
    const macroExpansions: Array<Record<string, JsonValue>> = [];
    operations.forEach((raw, index) => {
      const operation = objectArg(raw, `operations[${index}]`);
      const op = stringArg(operation.op, `operations[${index}].op`)!;
      switch (op) {
        case "construct": operationConstruct(draft, operation); break;
        case "expand_macro": macroExpansions.push(operationExpandMacro(draft, operation)); break;
        case "set_params": operationSetParams(draft, operation); break;
        case "set_entity": operationSetEntity(draft, operation); break;
        case "delete": operationDelete(draft, operation); break;
        case "add_assertion": operationAddAssertion(draft, operation); break;
        case "remove_assertion": operationRemoveAssertion(draft, operation); break;
        case "set_style": operationSetStyle(draft, operation); break;
        case "set_interaction": operationSetInteraction(draft, operation); break;
        case "set_view": operationSetView(draft, operation); break;
        default: throw new MathEngineError("UNKNOWN_OPERATION", `Unsupported math_apply operation '${op}'.`, {
          path: `operations[${index}].op`,
          actual: op,
          suggestedFixes: [{ description: "Use construct, expand_macro, set_params, delete, or undo." }]
        });
      }
    });
    draft.revision = current.revision + 1;
    draft.provenance = { ...(draft.provenance ?? {}), updatedAt: nowIso() };
    const report = validateMathDocument(draft);
    if (report.status === "invalid") {
      const enriched = enrichIssuesWithRepair(report.issues);
      throw new MathEngineError("TRANSACTION_VALIDATION_FAILED", `The transaction was rejected with ${enriched.length} validation issue(s).`, {
        actual: toJsonValue(enriched.slice(0, 16)),
        details: { report: toJsonValue({ ...report, issues: enriched }) },
        suggestedFixes: enriched.flatMap(issue => issue.suggestedFixes ?? []).slice(0, 8)
      });
    }
    const dryRun = booleanArg(args.dryRun, false);
    const saved = dryRun ? draft : this.store.save(draft, current.revision);
    const result: AgentToolCallResult = {
      ok: true,
      dryRun,
      documentId,
      revision: saved.revision,
      summary: summarizeDocument(saved),
      validation: toJsonValue(report),
      document: toJsonValue(saved),
      macroExpansions: macroExpansions.length > 0 ? toJsonValue(macroExpansions) : null,
      created: toJsonValue(saved.entities.filter(entity => !current.entities.some(existing => existing.id === entity.id)).map(entity => entity.id)),
      removed: toJsonValue(current.entities.filter(entity => !saved.entities.some(existing => existing.id === entity.id)).map(entity => entity.id)),
      documentHash: stableHash(saved)
    };
    if (idempotencyKey && !dryRun) this.store.setIdempotent(documentId, idempotencyKey, toJsonValue(result));
    return result;
  }

  private inspect(args: Record<string, unknown>): AgentToolCallResult {
    const documentId = stringArg(args.documentId, "documentId")!;
    const document = this.store.get(documentId);
    const graph = buildConstructionGraph(document);
    const evaluation = evaluateMathDocument(document);
    const selected = Array.isArray(args.entityIds)
      ? args.entityIds.filter((id): id is string => typeof id === "string")
      : document.entities.map(entity => entity.id);
    const entities = selected.map(id => {
      const entity = document.entities.find(candidate => candidate.id === id);
      if (!entity) return { id, missing: true };
      const runtime = evaluation.entities.get(id);
      const producer = graph.producerByEntity.get(id);
      return {
        ...entity,
        producer,
        dependencies: producer ? graph.entityDependenciesByNode.get(producer) ?? [] : [],
        dependentNodes: producer ? graph.dependentsByNode.get(producer) ?? [] : [],
        defined: runtime?.defined ?? false,
        value: booleanArg(args.includeValues, true) ? toJsonValue(runtime?.value) : undefined,
        issue: runtime?.issue ? toJsonValue(runtime.issue) : undefined
      };
    });
    return {
      ok: true,
      summary: summarizeDocument(document),
      entities: toJsonValue(entities),
      graph: booleanArg(args.includeGraph, true) ? toJsonValue({ order: graph.order, edges: graph.edges }) : null,
      document: booleanArg(args.includeDocument, false) ? toJsonValue(document) : null
    };
  }

  private validate(args: Record<string, unknown>): AgentToolCallResult {
    const document = args.document !== undefined
      ? deepClone(args.document)
      : this.store.get(stringArg(args.documentId, "documentId")!);
    const report = validateMathDocument(document);
    const enriched = { ...report, issues: enrichIssuesWithRepair(report.issues) };
    return { ok: enriched.status !== "invalid", validation: toJsonValue(enriched), documentHash: stableHash(document) };
  }

  private render(args: Record<string, unknown>): AgentToolCallResult {
    const documentId = stringArg(args.documentId, "documentId")!;
    const document = this.store.get(documentId);
    const width = Math.trunc(numberArg(args.width, "width", 960));
    const height = Math.trunc(numberArg(args.height, "height", 640));
    const result = renderDirectSvg(document, {
      viewId: typeof args.viewId === "string" ? args.viewId : undefined,
      width,
      height,
      stageId: typeof args.stageId === "string" ? args.stageId : undefined
    });
    return {
      ok: true,
      svg: booleanArg(args.includeSvg, true) ? result.svg : null,
      report: toJsonValue(result.report),
      contentType: "image/svg+xml"
    };
  }

  private simulate(args: Record<string, unknown>): AgentToolCallResult {
    const documentId = stringArg(args.documentId, "documentId")!;
    const current = this.store.get(documentId);
    if (args.expectedRevision !== undefined) {
      const expected = numberArg(args.expectedRevision, "expectedRevision");
      if (expected !== current.revision) throw new MathEngineError("REVISION_CONFLICT", `Expected revision ${expected}, current revision ${current.revision}.`, { expected, actual: current.revision });
    }
    const actionObject = objectArg(args.action, "action");
    let action: SimulationAction;
    if (actionObject.type === "drag") {
      action = {
        type: "drag",
        target: stringArg(actionObject.target, "action.target")!,
        path: deepClone(actionObject.path) as Array<[number, number]>,
        samples: actionObject.samples === undefined ? undefined : Math.trunc(numberArg(actionObject.samples, "action.samples")),
        commit: booleanArg(actionObject.commit, false)
      };
    } else if (actionObject.type === "set_value") {
      action = {
        type: "set_value",
        target: stringArg(actionObject.target, "action.target")!,
        value: numberArg(actionObject.value, "action.value"),
        samples: actionObject.samples === undefined ? undefined : Math.trunc(numberArg(actionObject.samples, "action.samples")),
        commit: booleanArg(actionObject.commit, false)
      };
    } else {
      throw new MathEngineError("INVALID_SIMULATION_ACTION", "action.type must be 'drag' or 'set_value'.");
    }
    const result = simulateMathDocument(current, action, {
      observe: Array.isArray(args.observe) ? args.observe.filter((item): item is string => typeof item === "string") : undefined
    });
    if (action.commit) {
      const next = applySimulationFinalState(current, action);
      const report = validateMathDocument(next);
      if (report.status === "invalid") throw new MathEngineError("SIMULATION_COMMIT_INVALID", "The simulated final state is not a valid document.", { actual: toJsonValue(report.issues) });
      this.store.save(next, current.revision);
      result.committedRevision = next.revision;
    }
    return { ok: true, simulation: toJsonValue(result) };
  }

  private export(args: Record<string, unknown>): AgentToolCallResult {
    const documentId = stringArg(args.documentId, "documentId")!;
    const document = this.store.get(documentId);
    const format = stringArg(args.format, "format")!;
    if (format === "math-document") {
      return {
        ok: true,
        format,
        contentType: "application/json",
        content: toJsonValue(document),
        hash: stableHash(document)
      };
    }
    if (format === "svg") {
      const rendered = renderDirectSvg(document, {
        viewId: typeof args.viewId === "string" ? args.viewId : undefined,
        width: Math.trunc(numberArg(args.width, "width", 960)),
        height: Math.trunc(numberArg(args.height, "height", 640))
      });
      return {
        ok: true,
        format,
        contentType: "image/svg+xml",
        content: rendered.svg,
        hash: rendered.report.renderHash,
        report: toJsonValue(rendered.report)
      };
    }
    throw new MathEngineError("UNSUPPORTED_EXPORT_FORMAT", `Unsupported export format '${format}'.`);
  }

  private evaluate(args: Record<string, unknown>): AgentToolCallResult {
    const expression = stringArg(args.expression, "expression")!;
    const variables = isPlainObject(args.variables) ? args.variables : {};
    let evaluation: ReturnType<typeof evaluateMathDocument> | undefined;
    if (typeof args.documentId === "string") evaluation = evaluateMathDocument(this.store.get(args.documentId));
    const value = evaluateExpression(expression, identifier => {
      const local = variables[identifier];
      if (finiteNumber(local)) return local;
      return evaluation?.entities.get(identifier)?.value;
    });
    return { ok: true, expression, value: toJsonValue(value) };
  }
}
