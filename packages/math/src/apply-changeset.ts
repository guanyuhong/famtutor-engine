import type {
  ApplyResult,
  ChangeSet,
  Diagnostic,
  DocumentRef
} from "@famtutor/core";
import { commandCapabilities, getCommandDefinition, typeConstraintMatches, type TypeConstraint } from "./catalog/commands.js";
import { applyMacroExpansion, expandMacro } from "./catalog/macro-expand.js";
import { MathEngineError } from "./errors.js";
import { collectExpressionIdentifiers, parseExpression } from "./expression/parser.js";
import { buildConstructionGraph, transitiveDependentNodes } from "./kernel/dag.js";
import { validateMathDocument } from "./protocol/validate.js";
import { enrichIssuesWithRepair } from "./agent/repair.js";
import {
  MATH_DOCUMENT_SCHEMA,
  MATH_DOMAIN,
  type MathOperation
} from "./operations.js";
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
} from "./types.js";
import { deepClone, isPlainObject, toJsonValue } from "./util.js";

function documentRef(document: MathDocument): DocumentRef {
  return {
    domain: MATH_DOMAIN,
    schema: MATH_DOCUMENT_SCHEMA,
    documentId: document.documentId,
    revision: document.revision
  };
}

function fail(
  changeSet: ChangeSet<MathOperation>,
  document: MathDocument,
  diagnostic: Diagnostic<MathOperation>
): ApplyResult<MathDocument, MathOperation> {
  return {
    ok: false,
    changeSetId: changeSet.changeSetId,
    base: changeSet.base,
    document: deepClone(document),
    diagnostics: [diagnostic]
  };
}

function fromEngineError(
  changeSet: ChangeSet<MathOperation>,
  document: MathDocument,
  error: MathEngineError
): ApplyResult<MathDocument, MathOperation> {
  return fail(changeSet, document, {
    code: error.code,
    severity: "error",
    message: error.message,
    path: error.path,
    expected: error.expected,
    actual: error.actual,
    retryable: error.retryable,
    suggestedFixes: error.suggestedFixes as Diagnostic<MathOperation>["suggestedFixes"]
  });
}

function stringArg(value: unknown, name: string, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new MathEngineError("INVALID_TOOL_ARGUMENT", `${name} must be a non-empty string.`, { path: name, actual: String(value) });
  }
  return value;
}

function booleanArg(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function objectArg(value: unknown, path = "arguments"): Record<string, unknown> {
  if (!isPlainObject(value)) throw new MathEngineError("INVALID_TOOL_ARGUMENTS", `${path} must be an object.`, { path });
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

function applyOne(document: MathDocument, operation: MathOperation | Record<string, unknown>, index: number): Record<string, JsonValue> | undefined {
  const raw = objectArg(operation, `operations[${index}]`);
  const op = stringArg(raw.op, `operations[${index}].op`)!;
  switch (op) {
    case "construct":
      operationConstruct(document, raw);
      return undefined;
    case "expand_macro":
      return operationExpandMacro(document, raw);
    case "set_params":
      operationSetParams(document, raw);
      return undefined;
    case "set_entity":
      operationSetEntity(document, raw);
      return undefined;
    case "delete":
      operationDelete(document, raw);
      return undefined;
    case "add_assertion":
      operationAddAssertion(document, raw);
      return undefined;
    case "remove_assertion":
      operationRemoveAssertion(document, raw);
      return undefined;
    case "set_style":
      operationSetStyle(document, raw);
      return undefined;
    case "set_interaction":
      operationSetInteraction(document, raw);
      return undefined;
    case "set_view":
      operationSetView(document, raw);
      return undefined;
    case "undo":
      throw new MathEngineError("UNDO_NOT_DOMAIN_OPERATION", "undo is a session operation and cannot appear in a domain ChangeSet.", {
        path: `operations[${index}].op`,
        actual: op,
        retryable: false
      });
    default:
      throw new MathEngineError("UNKNOWN_OPERATION", `Unsupported math operation '${op}'.`, {
        path: `operations[${index}].op`,
        actual: op,
        suggestedFixes: [{ description: "Use construct, expand_macro, set_params, delete, or other domain ops." }]
      });
  }
}

/**
 * Stateless transactional apply for MathDocument.
 * Does not mutate the input document; does not touch DocumentStore/undo/idempotency.
 */
export function applyMathChangeSet(
  document: MathDocument,
  changeSet: ChangeSet<MathOperation>
): ApplyResult<MathDocument, MathOperation> {
  if (changeSet.schema !== "famtutor.engine.change-set.v1") {
    return fail(changeSet, document, {
      code: "INVALID_CHANGE_SET_SCHEMA",
      severity: "error",
      message: `ChangeSet.schema must be famtutor.engine.change-set.v1.`,
      path: "schema",
      actual: changeSet.schema,
      retryable: false
    });
  }
  if (!Array.isArray(changeSet.operations) || changeSet.operations.length === 0) {
    return fail(changeSet, document, {
      code: "INVALID_OPERATIONS",
      severity: "error",
      message: "operations must be a non-empty array.",
      path: "operations",
      retryable: false
    });
  }

  const base = changeSet.base;
  if (base.domain !== MATH_DOMAIN) {
    return fail(changeSet, document, {
      code: "DOMAIN_MISMATCH",
      severity: "error",
      message: `Expected domain '${MATH_DOMAIN}', got '${base.domain}'.`,
      path: "base.domain",
      expected: MATH_DOMAIN,
      actual: base.domain,
      retryable: false
    });
  }
  if (base.schema !== MATH_DOCUMENT_SCHEMA || document.schema !== MATH_DOCUMENT_SCHEMA) {
    return fail(changeSet, document, {
      code: "SCHEMA_MISMATCH",
      severity: "error",
      message: `Expected schema '${MATH_DOCUMENT_SCHEMA}'.`,
      path: "base.schema",
      expected: MATH_DOCUMENT_SCHEMA,
      actual: base.schema,
      retryable: false
    });
  }
  if (base.documentId !== document.documentId) {
    return fail(changeSet, document, {
      code: "DOCUMENT_ID_MISMATCH",
      severity: "error",
      message: `ChangeSet base documentId '${base.documentId}' does not match document '${document.documentId}'.`,
      path: "base.documentId",
      expected: document.documentId,
      actual: base.documentId,
      retryable: false
    });
  }
  if (base.revision !== document.revision) {
    return fail(changeSet, document, {
      code: "REVISION_CONFLICT",
      severity: "error",
      message: `Expected revision ${base.revision}, but current revision is ${document.revision}.`,
      path: "base.revision",
      expected: base.revision,
      actual: document.revision,
      retryable: true,
      suggestedFixes: [{ description: "Reload the document and retry with the current revision." }]
    });
  }

  const draft = deepClone(document);
  const macroExpansions: Array<Record<string, JsonValue>> = [];
  try {
    changeSet.operations.forEach((operation, index) => {
      const expansion = applyOne(draft, operation, index);
      if (expansion) macroExpansions.push(expansion);
    });
  } catch (error) {
    if (error instanceof MathEngineError) return fromEngineError(changeSet, document, error);
    throw error;
  }

  draft.revision = document.revision + 1;
  const timestamp = changeSet.metadata && typeof changeSet.metadata.timestamp === "string"
    ? changeSet.metadata.timestamp
    : undefined;
  if (timestamp) {
    draft.provenance = { ...(draft.provenance ?? {}), updatedAt: timestamp };
  }
  const report = validateMathDocument(draft);
  if (report.status === "invalid") {
    const enriched = enrichIssuesWithRepair(report.issues);
    return {
      ok: false,
      changeSetId: changeSet.changeSetId,
      base: changeSet.base,
      document: deepClone(document),
      diagnostics: enriched.map(issue => ({
        code: issue.code,
        severity: (issue.severity === "warning" || issue.severity === "info" ? issue.severity : "error") as Diagnostic<MathOperation>["severity"],
        message: issue.message,
        path: issue.path,
        expected: issue.expected,
        actual: issue.actual,
        retryable: issue.retryable,
        suggestedFixes: issue.suggestedFixes as Diagnostic<MathOperation>["suggestedFixes"]
      })),
      effects: {
        validation: toJsonValue({ ...report, issues: enriched })
      }
    };
  }

  const created = draft.entities.filter(entity => !document.entities.some(existing => existing.id === entity.id)).map(entity => entity.id);
  const removed = document.entities.filter(entity => !draft.entities.some(existing => existing.id === entity.id)).map(entity => entity.id);
  return {
    ok: true,
    changeSetId: changeSet.changeSetId,
    base: changeSet.base,
    next: documentRef(draft),
    document: draft,
    created,
    removed,
    diagnostics: [],
    effects: {
      validation: toJsonValue(report),
      macroExpansions: macroExpansions.length > 0 ? toJsonValue(macroExpansions) : null,
      summary: {
        documentId: draft.documentId,
        revision: draft.revision,
        title: draft.metadata.title,
        entities: draft.entities.length,
        constructionNodes: draft.construction.length,
        assertions: draft.assertions?.length ?? 0,
        views: draft.views.length
      },
      commandCount: commandCapabilities().length
    }
  };
}
