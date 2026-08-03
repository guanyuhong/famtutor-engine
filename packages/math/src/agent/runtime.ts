import type { ChangeSet } from "@famtutor/core";
import { applyMathChangeSet } from "../apply-changeset.js";
import { commandCapabilities } from "../catalog/commands.js";
import { macroCapabilities } from "../catalog/macros.js";
import { MathDomainRuntime } from "../domain-runtime.js";
import { MathEngineError, asMathEngineError } from "../errors.js";
import { evaluateExpression } from "../expression/evaluator.js";
import { evaluateMathDocument } from "../kernel/evaluate.js";
import { buildConstructionGraph } from "../kernel/dag.js";
import { applySimulationFinalState, simulateMathDocument, type SimulationAction } from "../kernel/simulate.js";
import {
  MATH_DOCUMENT_SCHEMA,
  MATH_DOMAIN,
  type MathOperation
} from "../operations.js";
import { validateMathDocument } from "../protocol/validate.js";
import { renderDirectSvg } from "../render/direct-svg.js";
import type { JsonValue, MathDocument, SuggestedFix } from "../types.js";
import { deepClone, finiteNumber, isPlainObject, nowIso, stableHash, toJsonValue } from "../util.js";
import { MATH_RUNTIME_VERSION } from "../version.js";
import { enrichIssuesWithRepair, repairSuggestionsForError } from "./repair.js";
import { DocumentStore } from "./store.js";
import { agentToolDefinitions } from "./tools.js";

let changeSetCounter = 0;
function nextChangeSetId(): string {
  changeSetCounter += 1;
  return `cs-${Date.now().toString(36)}-${changeSetCounter.toString(36)}`;
}

export interface AgentMathRuntimeOptions {
  store?: DocumentStore;
  maxOperations?: number;
  domainRuntime?: MathDomainRuntime;
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
    schema: MATH_DOCUMENT_SCHEMA,
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

function diagnosticToError(diagnostic: {
  code: string;
  message: string;
  path?: string;
  expected?: JsonValue;
  actual?: JsonValue;
  retryable?: boolean;
  suggestedFixes?: ReadonlyArray<{ description: string; operation?: unknown }>;
}): MathEngineError {
  return new MathEngineError(diagnostic.code, diagnostic.message, {
    path: diagnostic.path,
    expected: diagnostic.expected,
    actual: diagnostic.actual,
    retryable: diagnostic.retryable,
    suggestedFixes: diagnostic.suggestedFixes?.map(fix => ({
      description: fix.description,
      operation: fix.operation === undefined ? undefined : toJsonValue(fix.operation) as Record<string, JsonValue>
    }))
  });
}

/**
 * Stateful Agent/session adapter over MathDomainRuntime + DocumentStore.
 * Owns dry-run, commit, undo, and idempotency. Domain mutations go through applyMathChangeSet.
 */
export class AgentMathRuntime {
  readonly store: DocumentStore;
  readonly maxOperations: number;
  readonly domainRuntime: MathDomainRuntime;

  constructor(options: AgentMathRuntimeOptions = {}) {
    this.store = options.store ?? new DocumentStore();
    this.maxOperations = options.maxOperations ?? 128;
    this.domainRuntime = options.domainRuntime ?? new MathDomainRuntime();
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
        case "math_apply": return await this.apply(args);
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
      runtime: { name: "@famtutor/math-runtime", version: MATH_RUNTIME_VERSION },
      protocol: MATH_DOCUMENT_SCHEMA,
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

  private async apply(args: Record<string, unknown>): Promise<AgentToolCallResult> {
    const documentId = stringArg(args.documentId, "documentId")!;
    const operations = args.operations;
    if (!Array.isArray(operations) || operations.length === 0) throw new MathEngineError("INVALID_OPERATIONS", "operations must be a non-empty array.");
    if (operations.length > this.maxOperations) throw new MathEngineError("OPERATION_LIMIT", `At most ${this.maxOperations} operations are allowed per transaction.`);
    const expectedRevision = args.expectedRevision === undefined ? undefined : numberArg(args.expectedRevision, "expectedRevision");
    const current = this.store.get(documentId);
    const idempotencyKey = typeof args.idempotencyKey === "string" ? args.idempotencyKey : undefined;
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
      return { ok: true, dryRun: booleanArg(args.dryRun, false), document: toJsonValue(restored), summary: summarizeDocument(restored) };
    }

    const changeSet: ChangeSet<MathOperation> = {
      schema: "famtutor.engine.change-set.v1",
      changeSetId: idempotencyKey ?? nextChangeSetId(),
      base: {
        domain: MATH_DOMAIN,
        schema: MATH_DOCUMENT_SCHEMA,
        documentId: current.documentId,
        revision: current.revision
      },
      operations: operations as MathOperation[]
    };

    const applied = applyMathChangeSet(current, changeSet);
    if (!applied.ok || !applied.document) {
      const primary = applied.diagnostics[0];
      if (!primary) throw new MathEngineError("TRANSACTION_FAILED", "ChangeSet apply failed without diagnostics.");
      if (primary.code === "TRANSACTION_VALIDATION_FAILED" || applied.effects?.validation) {
        const validation = applied.effects?.validation;
        throw new MathEngineError("TRANSACTION_VALIDATION_FAILED", primary.message || `The transaction was rejected with ${applied.diagnostics.length} validation issue(s).`, {
          actual: toJsonValue(applied.diagnostics.slice(0, 16)),
          details: validation ? { report: validation } : { diagnostics: toJsonValue(applied.diagnostics) },
          suggestedFixes: applied.diagnostics.flatMap(issue => (issue.suggestedFixes ?? []) as SuggestedFix[]).slice(0, 8)
        });
      }
      throw diagnosticToError(primary);
    }

    const dryRun = booleanArg(args.dryRun, false);
    const saved = dryRun ? applied.document : this.store.save(applied.document, current.revision);
    const result: AgentToolCallResult = {
      ok: true,
      dryRun,
      documentId,
      revision: saved.revision,
      summary: summarizeDocument(saved),
      validation: applied.effects?.validation ?? null,
      document: toJsonValue(saved),
      macroExpansions: applied.effects?.macroExpansions ?? null,
      created: toJsonValue(applied.created ?? []),
      removed: toJsonValue(applied.removed ?? []),
      documentHash: stableHash(saved),
      changeSetId: applied.changeSetId
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
