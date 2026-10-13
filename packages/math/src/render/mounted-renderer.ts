import type {
  ChangeSet,
  Diagnostic,
  DocumentRef,
  InteractionResult,
  MountedRenderer,
  MountedRendererState,
  RenderRequest,
  RenderResult,
  RenderUpdateResult,
  ReplaceDocumentOptions,
  RuntimeEvent,
  Unsubscribe
} from "@famtutor/core";
import { MathDomainRuntime } from "../domain-runtime.js";
import { MathEngineError } from "../errors.js";
import { buildConstructionGraph } from "../kernel/dag.js";
import {
  MATH_DOCUMENT_SCHEMA,
  MATH_DOMAIN,
  type MathOperation,
  type MathSetParamsOperation
} from "../operations.js";
import { advanceClock, initialClockState, resetClockState, type LogicalClockState } from "../kernel/clock.js";
import { evaluateMathDocument } from "../kernel/evaluate.js";
import type { MathControlAction, MathDocument } from "../types.js";
import { canonicalizeJson, deepClone, finiteNumber, nowIso, sha256Utf8, toJsonValue } from "../util.js";
import { mountJsxGraph, type JsxGraphRuntimeHandle, type JsxGraphRuntimeOptions } from "./jsxgraph.js";

const IDEMPOTENCY_LIMIT = 128;
const MAX_OPERATIONS = 128;

/** Canonical InteractionAction wire shape (core envelope). */
export type MathInteractionAction =
  | { type: "point.set"; target: string; payload: { coords: [number, number] } }
  | { type: "scalar.set"; target: string; payload: { value: number } }
  | { type: "boolean.set"; target: string; payload: { value: boolean } }
  | { type: "boolean.toggle"; target: string; payload: Record<string, never> }
  | { type: "control.invoke"; target: string; payload: Record<string, never> }
  | { type: "clock.play"; target: string; payload: Record<string, never> }
  | { type: "clock.pause"; target: string; payload: Record<string, never> }
  | { type: "clock.reset"; target: string; payload: Record<string, never> }
  | { type: "clock.step"; target: string; payload: Record<string, never> }
  | { type: "stage.set"; payload: { stageId?: string } }
  | { type: "selection.set"; payload: { entityId?: string } };

/** @deprecated Prefer canonical `{ type, target?, payload }` envelope. */
export type LegacyMathInteractionAction =
  | { type: "point.set"; target: string; coords: [number, number] }
  | { type: "scalar.set"; target: string; value: number }
  | { type: "boolean.set"; target: string; value: boolean }
  | { type: "stage.set"; stageId?: string }
  | { type: "selection.set"; entityId?: string };

export type MathInteractionActionInput = MathInteractionAction | LegacyMathInteractionAction;

export interface MathMountedRendererOptions extends JsxGraphRuntimeOptions {
  domainRuntime?: MathDomainRuntime;
}

export interface MathMountedRenderer extends MountedRenderer<MathDocument, MathOperation, MathInteractionActionInput> {
  readonly host: HTMLElement;
}

interface IdempotencyEntry {
  changeSetId: string;
  requestFingerprint: string;
  documentRef: DocumentRef;
  result: RenderUpdateResult<MathDocument, MathOperation>;
}

function documentRef(document: MathDocument): DocumentRef {
  return {
    domain: MATH_DOMAIN,
    schema: MATH_DOCUMENT_SCHEMA,
    documentId: document.documentId,
    revision: document.revision
  };
}

function changeSetFingerprint(changeSet: ChangeSet<MathOperation>): string {
  return canonicalizeJson({
    schema: changeSet.schema,
    base: changeSet.base,
    operations: changeSet.operations,
    metadata: changeSet.metadata ?? null
  });
}

function producerNodeId(document: MathDocument, entityId: string): string | undefined {
  return buildConstructionGraph(document).producerByEntity.get(entityId);
}

function stageExists(document: MathDocument, stageId: string): boolean {
  return Boolean(document.activities?.flatMap(activity => activity.stages ?? []).some(stage => stage.id === stageId));
}

function interactionAllows(document: MathDocument, target: string, permission: "drag" | "set_value" | "select"): boolean {
  const policy = document.interactions?.find(candidate => candidate.target === target);
  if (policy) return policy.permissions.includes(permission);
  const entity = document.entities.find(candidate => candidate.id === target);
  if (!entity) return false;
  if (permission === "select") return true;
  if (permission === "drag") return entity.role === "free" && entity.type === "point2";
  return (entity.type === "scalar" || entity.type === "boolean") && entity.role === "free";
}

export function normalizeMathInteractionAction(action: MathInteractionActionInput): MathInteractionAction {
  if ("payload" in action && action.payload !== undefined) {
    return action as MathInteractionAction;
  }
  const legacy = action as LegacyMathInteractionAction;
  if (legacy.type === "point.set") {
    return { type: "point.set", target: legacy.target, payload: { coords: legacy.coords } };
  }
  if (legacy.type === "scalar.set") {
    return { type: "scalar.set", target: legacy.target, payload: { value: legacy.value } };
  }
  if (legacy.type === "boolean.set") {
    return { type: "boolean.set", target: legacy.target, payload: { value: legacy.value } };
  }
  if (legacy.type === "stage.set") {
    return { type: "stage.set", payload: { stageId: legacy.stageId } };
  }
  return { type: "selection.set", payload: { entityId: legacy.entityId } };
}

function destroyedFailure(document: MathDocument): RenderUpdateResult<MathDocument, MathOperation> {
  return {
    ok: false,
    strategy: "rebuild",
    state: {
      schema: "famtutor.engine.mounted-renderer-state.v1",
      document: documentRef(document),
      destroyed: true
    },
    diagnostics: [{
      code: "RENDERER_DESTROYED",
      severity: "error",
      message: "MountedRenderer has been destroyed.",
      retryable: false
    }]
  };
}

function cloneUpdateResult(
  result: RenderUpdateResult<MathDocument, MathOperation>
): RenderUpdateResult<MathDocument, MathOperation> {
  return deepClone(result);
}

class MathMountedRendererImpl implements MathMountedRenderer {
  readonly host: HTMLElement;
  private readonly domainRuntime: MathDomainRuntime;
  private readonly mountOptions: JsxGraphRuntimeOptions;
  private document: MathDocument;
  private active: JsxGraphRuntimeHandle | undefined;
  private activeContainer: HTMLElement | undefined;
  private stageId?: string;
  private selectedEntityId?: string;
  private viewId?: string;
  private destroyed = false;
  private destroyRequested = false;
  private sequence = 0;
  private eventCounter = 0;
  private readonly listeners = new Set<(event: RuntimeEvent) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly idempotencyOrder: string[] = [];
  private readonly clockStates = new Map<string, LogicalClockState>();
  private readonly clockTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private clockMutation = false;

  constructor(host: HTMLElement, document: MathDocument, options: MathMountedRendererOptions = {}) {
    this.host = host;
    this.document = deepClone(document);
    this.domainRuntime = options.domainRuntime ?? new MathDomainRuntime();
    this.viewId = options.viewId;
    this.stageId = options.stageId;
    const { domainRuntime: _ignored, ...rest } = options;
    this.mountOptions = rest;
    this.synchronizeClocks();
  }

  async initialize(): Promise<void> {
    const style = this.host.ownerDocument!.defaultView?.getComputedStyle(this.host);
    if (!style || style.position === "static") {
      this.host.style.position = "relative";
    }
    const container = this.createContainer("active");
    try {
      this.host.replaceChildren(container);
      this.activeContainer = container;
      this.active = mountJsxGraph(container, this.document, this.bindMountOptions());
      await this.active.ready;
      for (const state of this.clockStates.values()) if (state.status === "running") this.scheduleClock(state.clockId);
    } catch (error) {
      try { this.active?.destroy(); } catch { /* ignore */ }
      this.active = undefined;
      this.activeContainer = undefined;
      this.host.replaceChildren();
      throw error;
    }
  }

  getDocument(): MathDocument {
    return deepClone(this.document);
  }

  getState(): MountedRendererState {
    return deepClone(this.captureState());
  }

  applyChangeSet(changeSet: ChangeSet<MathOperation>): Promise<RenderUpdateResult<MathDocument, MathOperation>> {
    return this.enqueue(async () => this.applyChangeSetLocked(changeSet));
  }

  replaceDocument(
    document: MathDocument,
    options: ReplaceDocumentOptions = {}
  ): Promise<RenderUpdateResult<MathDocument, MathOperation>> {
    return this.enqueue(async () => {
      if (this.destroyed || this.destroyRequested) return destroyedFailure(this.document);
      if (!options.allowDocumentSwitch && document.documentId !== this.document.documentId) {
        return this.failUpdate([{
          code: "DOCUMENT_SWITCH_DENIED",
          severity: "error",
          message: "replaceDocument requires allowDocumentSwitch for a different documentId.",
          retryable: false
        }]);
      }
      if (!options.allowRevisionRollback && document.revision < this.document.revision) {
        return this.failUpdate([{
          code: "REVISION_ROLLBACK_DENIED",
          severity: "error",
          message: "replaceDocument refuses lower revisions without allowRevisionRollback.",
          expected: this.document.revision,
          actual: document.revision,
          retryable: false
        }]);
      }
      const result = await this.rebuildWithDocument(deepClone(document), undefined);
      if (result.ok) this.clearIdempotency();
      return result;
    });
  }

  dispatch(action: MathInteractionActionInput): Promise<InteractionResult<MathDocument, MathOperation>> {
    return this.enqueue(async () => this.dispatchLocked(normalizeMathInteractionAction(action)));
  }

  async snapshot(request: RenderRequest = {}): Promise<RenderResult> {
    if (this.destroyed || this.destroyRequested) {
      return {
        ok: false,
        diagnostics: [{
          code: "RENDERER_DESTROYED",
          severity: "error",
          message: "MountedRenderer has been destroyed.",
          retryable: false
        }]
      };
    }
    const renderer = request.renderer ?? "jsxgraph-svg";
    if (renderer === "direct-svg") {
      return this.domainRuntime.render(this.document, { ...request, renderer: "direct-svg" });
    }
    if (renderer === "jsxgraph-canvas") {
      return {
        ok: false,
        diagnostics: [{
          code: "UNSUPPORTED_SNAPSHOT",
          severity: "error",
          message: "jsxgraph-canvas snapshot export is not available in this release.",
          path: "renderer",
          actual: renderer,
          retryable: false
        }]
      };
    }
    if (renderer !== "jsxgraph-svg") {
      return {
        ok: false,
        diagnostics: [{
          code: "UNSUPPORTED_SNAPSHOT",
          severity: "error",
          message: `Unsupported snapshot renderer '${renderer}'.`,
          path: "renderer",
          actual: renderer,
          retryable: false
        }]
      };
    }
    if (!this.active) {
      return {
        ok: false,
        diagnostics: [{
          code: "BOARD_UNAVAILABLE",
          severity: "error",
          message: "No active JSXGraph board is mounted.",
          retryable: false
        }]
      };
    }
    const report = this.active.report();
    const content = this.active.exportSvg();
    const diagnostics: Diagnostic[] = [
      ...report.warnings.map(issue => ({
        code: issue.code,
        severity: (issue.severity === "warning" || issue.severity === "info" ? issue.severity : "error") as Diagnostic["severity"],
        message: issue.message,
        path: issue.path,
        expected: issue.expected,
        actual: issue.actual,
        retryable: issue.retryable
      })),
      ...report.skippedEntities.map(skipped => ({
        code: "ENTITY_SKIPPED",
        severity: "warning" as const,
        message: `Entity '${skipped.id}' was skipped: ${skipped.reason}`,
        path: skipped.id,
        actual: skipped.reason,
        retryable: true
      }))
    ];
    const digestValue = await sha256Utf8(content);
    return {
      ok: true,
      artifact: {
        schema: "famtutor.engine.render-artifact.v1",
        document: documentRef(this.document),
        renderer: "jsxgraph-svg",
        mediaType: "image/svg+xml",
        encoding: "utf8",
        content,
        digest: { algorithm: "sha256", value: digestValue },
        diagnostics,
        metadata: {
          report: toJsonValue(report),
          width: this.host.clientWidth || null,
          height: this.host.clientHeight || null,
          skippedCount: report.skippedEntities.length
        }
      }
    };
  }

  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async destroy(): Promise<void> {
    this.destroyRequested = true;
    await this.enqueue(async () => {
      if (this.destroyed) return;
      this.destroyed = true;
      try { this.active?.destroy(); } catch { /* ignore teardown errors */ }
      this.active = undefined;
      this.activeContainer = undefined;
      this.host.replaceChildren();
      this.listeners.clear();
      this.clearAllClockTimers();
      this.clearIdempotency();
    });
  }

  private clearIdempotency(): void {
    this.idempotency.clear();
    this.idempotencyOrder.length = 0;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private safeHostCallback(fn: (() => void) | undefined): void {
    if (!fn) return;
    try {
      fn();
    } catch {
      // Host callbacks must not break internal commit paths.
    }
  }

  private bindMountOptions(): JsxGraphRuntimeOptions {
    return {
      ...this.mountOptions,
      viewId: this.viewId,
      stageId: this.stageId,
      onSelect: entityId => {
        this.selectedEntityId = entityId;
        this.safeHostCallback(() => this.mountOptions.onSelect?.(entityId));
        this.emit({
          type: "selection.changed",
          target: entityId,
          payload: { entityId }
        });
      },
      onEvent: event => {
        this.safeHostCallback(() => this.mountOptions.onEvent?.(event));
        const position = event.position ?? (Array.isArray(event.value) ? event.value : undefined);
        if (event.type === "object.dragEnd" && event.target && position?.length === 2 && position.every(finiteNumber)) {
          const coords = position as [number, number];
          void this.dispatch({ type: "point.set", target: event.target, payload: { coords } })
            .catch(error => {
              this.emit({
                type: "interaction.failed",
                target: event.target,
                payload: {
                  reason: "dispatch_rejected",
                  message: error instanceof Error ? error.message : String(error)
                }
              });
            });
        } else if (event.type === "value.changed" && event.target && typeof event.value === "number") {
          void this.dispatch({ type: "scalar.set", target: event.target, payload: { value: event.value } })
            .catch(error => {
              this.emit({
                type: "interaction.failed",
                target: event.target,
                payload: {
                  reason: "dispatch_rejected",
                  message: error instanceof Error ? error.message : String(error)
                }
              });
            });
        }
      }
    };
  }

  private createContainer(kind: "active" | "staging"): HTMLElement {
    const el = this.host.ownerDocument!.createElement("div");
    el.className = `famtutor-math-mounted famtutor-math-${kind}`;
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.minHeight = "320px";
    el.dataset.role = kind;
    return el;
  }

  private captureState(): MountedRendererState {
    const camera = this.active?.board.getBoundingBox?.();
    return {
      schema: "famtutor.engine.mounted-renderer-state.v1",
      document: documentRef(this.document),
      viewId: this.viewId,
      stageId: this.stageId,
      selectedEntityId: this.selectedEntityId,
      rendererMode: "jsxgraph-svg",
      camera: camera ? { boundingBox: camera } : undefined,
      metadata: {
        clocks: [...this.clockStates.values()].map(state => ({ ...state }))
      },
      destroyed: this.destroyed
    };
  }

  private emit(
    partial: Omit<RuntimeEvent, "schema" | "eventId" | "sequence" | "document" | "timestamp"> & {
      timestamp?: string;
      document?: DocumentRef;
    }
  ): void {
    this.sequence += 1;
    this.eventCounter += 1;
    const event: RuntimeEvent = {
      schema: "famtutor.engine.runtime-event.v1",
      eventId: `evt-${this.eventCounter}`,
      sequence: this.sequence,
      type: partial.type,
      document: partial.document ?? documentRef(this.document),
      timestamp: partial.timestamp ?? nowIso(),
      target: partial.target,
      payload: partial.payload
    };
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the renderer or other listeners.
      }
    }
  }

  private rememberSuccessful(
    changeSetId: string,
    requestFingerprint: string,
    ref: DocumentRef,
    result: RenderUpdateResult<MathDocument, MathOperation>
  ): void {
    if (this.idempotency.has(changeSetId)) return;
    this.idempotency.set(changeSetId, {
      changeSetId,
      requestFingerprint,
      documentRef: deepClone(ref),
      result: deepClone(result)
    });
    this.idempotencyOrder.push(changeSetId);
    while (this.idempotencyOrder.length > IDEMPOTENCY_LIMIT) {
      const oldest = this.idempotencyOrder.shift();
      if (oldest) this.idempotency.delete(oldest);
    }
  }

  private failUpdate(diagnostics: Diagnostic<MathOperation>[]): RenderUpdateResult<MathDocument, MathOperation> {
    return {
      ok: false,
      strategy: "rebuild",
      state: this.captureState(),
      diagnostics
    };
  }

  private async applyChangeSetLocked(
    changeSet: ChangeSet<MathOperation>
  ): Promise<RenderUpdateResult<MathDocument, MathOperation>> {
    if (this.destroyed || this.destroyRequested) return destroyedFailure(this.document);

    const fingerprint = changeSetFingerprint(changeSet);
    const cached = this.idempotency.get(changeSet.changeSetId);
    if (cached) {
      if (cached.requestFingerprint !== fingerprint) {
        return this.failUpdate([{
          code: "IDEMPOTENCY_KEY_REUSED",
          severity: "error",
          message: `changeSetId '${changeSet.changeSetId}' was reused with a different payload.`,
          path: "changeSetId",
          actual: changeSet.changeSetId,
          retryable: false
        }]);
      }
      return cloneUpdateResult(cached.result);
    }

    const applied = await this.domainRuntime.apply(this.document, changeSet);
    if (this.destroyed || this.destroyRequested) return destroyedFailure(this.document);

    if (!applied.ok) {
      const result = this.failUpdate(applied.diagnostics);
      result.apply = deepClone(applied);
      // Domain apply failures are deterministic for the same request — cache them.
      this.rememberSuccessful(changeSet.changeSetId, fingerprint, documentRef(this.document), result);
      return cloneUpdateResult(result);
    }

    // Isolate internal document from apply result identity.
    const nextDocument = deepClone(applied.document);
    const isolatedApply = deepClone(applied);
    const result = await this.rebuildWithDocument(nextDocument, isolatedApply);
    if (result.ok) {
      this.rememberSuccessful(changeSet.changeSetId, fingerprint, documentRef(this.document), result);
    }
    // REBUILD_FAILED / RENDER_INCOMPLETE are not cached as success — same ID may retry.
    return cloneUpdateResult(result);
  }

  private async rebuildWithDocument(
    nextDocument: MathDocument,
    apply?: RenderUpdateResult<MathDocument, MathOperation>["apply"]
  ): Promise<RenderUpdateResult<MathDocument, MathOperation>> {
    if (this.destroyed || this.destroyRequested) return destroyedFailure(this.document);

    const previousActive = this.active;
    const previousContainer = this.activeContainer;
    const previousDocument = this.document;
    const previousStageId = this.stageId;
    const previousSelectedEntityId = this.selectedEntityId;
    const previousCamera = this.active?.board.getBoundingBox?.();

    const staging = this.createContainer("staging");
    staging.style.position = "absolute";
    staging.style.left = "-10000px";
    staging.style.top = "0";
    this.host.appendChild(staging);

    let stagingHandle: JsxGraphRuntimeHandle | undefined;
    try {
      const nextStageId = previousStageId && stageExists(nextDocument, previousStageId)
        ? previousStageId
        : undefined;
      const nextSelectedEntityId = previousSelectedEntityId
        && nextDocument.entities.some(entity => entity.id === previousSelectedEntityId)
        ? previousSelectedEntityId
        : undefined;

      stagingHandle = mountJsxGraph(staging, nextDocument, {
        ...this.bindMountOptions(),
        stageId: nextStageId,
        viewId: this.viewId
      });
      await stagingHandle.ready;

      if (this.destroyed || this.destroyRequested) {
        stagingHandle.destroy();
        staging.remove();
        return destroyedFailure(previousDocument);
      }

      if (previousCamera && Array.isArray(previousCamera) && previousCamera.length === 4) {
        stagingHandle.board.setBoundingBox?.(previousCamera as [number, number, number, number], true);
      }
      if (nextStageId) stagingHandle.setStage(nextStageId);

      const report = stagingHandle.report();
      const errorDiagnostics = report.warnings.filter(issue => issue.severity === "error");
      if (report.skippedEntities.length > 0 || errorDiagnostics.length > 0) {
        stagingHandle.destroy();
        staging.remove();
        return this.failUpdate([{
          code: "RENDER_INCOMPLETE",
          severity: "error",
          message: "Staging board reported skipped entities or error diagnostics; refusing to swap.",
          retryable: true,
          actual: toJsonValue({
            skippedEntities: report.skippedEntities,
            errors: errorDiagnostics
          })
        }]);
      }

      const warningDiagnostics: Diagnostic<MathOperation>[] = report.warnings
        .filter(issue => issue.severity === "warning" || issue.severity === "info")
        .map(issue => ({
          code: issue.code,
          severity: issue.severity === "info" ? "info" : "warning",
          message: issue.message,
          path: issue.path,
          expected: issue.expected,
          actual: issue.actual,
          retryable: issue.retryable
        }));

      // Commit only after staging is healthy.
      this.document = nextDocument;
      this.synchronizeClocks();
      this.stageId = nextStageId;
      this.selectedEntityId = nextSelectedEntityId;
      this.active = stagingHandle;
      staging.style.position = "";
      staging.style.left = "";
      staging.dataset.role = "active";
      this.activeContainer = staging;

      const cleanupWarnings: Diagnostic<MathOperation>[] = [];
      try {
        previousActive?.destroy();
      } catch (error) {
        cleanupWarnings.push({
          code: "BOARD_CLEANUP_WARNING",
          severity: "warning",
          message: `Previous board cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false
        });
      }
      try {
        previousContainer?.remove();
      } catch (error) {
        cleanupWarnings.push({
          code: "BOARD_CLEANUP_WARNING",
          severity: "warning",
          message: `Previous container cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false
        });
      }
      Array.from(this.host.children).forEach(child => {
        if (child !== staging) {
          try { child.remove(); } catch { /* ignore */ }
        }
      });

      const newRef = documentRef(this.document);
      const pendingEvents: Array<Parameters<MathMountedRendererImpl["emit"]>[0]> = [];
      if (previousStageId && !nextStageId) {
        pendingEvents.push({
          type: "stage.cleared",
          document: newRef,
          payload: { reason: "stage_missing_after_rebuild", previousStageId }
        });
      }
      if (previousSelectedEntityId && !nextSelectedEntityId) {
        pendingEvents.push({
          type: "selection.changed",
          document: newRef,
          payload: { entityId: null, reason: "entity_removed", previousEntityId: previousSelectedEntityId }
        });
      }
      pendingEvents.push({
        type: "document.updated",
        document: newRef,
        payload: {
          strategy: "rebuild",
          revision: nextDocument.revision,
          changeSetId: apply && "changeSetId" in apply ? apply.changeSetId : null
        }
      });
      for (const event of pendingEvents) this.emit(event);

      return {
        ok: true,
        strategy: "rebuild",
        apply,
        state: this.captureState(),
        diagnostics: [...warningDiagnostics, ...cleanupWarnings],
        effects: {
          report: toJsonValue(report),
          skippedCount: report.skippedEntities.length
        }
      };
    } catch (error) {
      try { stagingHandle?.destroy(); } catch { /* ignore */ }
      try { staging.remove(); } catch { /* ignore */ }
      this.active = previousActive;
      this.activeContainer = previousContainer;
      this.document = previousDocument;
      this.stageId = previousStageId;
      this.selectedEntityId = previousSelectedEntityId;
      const message = error instanceof Error ? error.message : String(error);
      return this.failUpdate([{
        code: "REBUILD_FAILED",
        severity: "error",
        message: `Staging remount failed: ${message}`,
        retryable: true
      }]);
    }
  }

  private interactionDenied(
    message: string,
    actual?: unknown
  ): InteractionResult<MathDocument, MathOperation> {
    return {
      ok: false,
      revisionChanged: false,
      document: deepClone(this.document),
      state: this.captureState(),
      diagnostics: [{
        code: "INTERACTION_NOT_ALLOWED",
        severity: "error",
        message,
        actual: actual === undefined ? undefined : String(actual),
        retryable: false
      }]
    };
  }

  private scalarNodeValue(target: string): number | undefined {
    const nodeId = producerNodeId(this.document, target);
    const node = this.document.construction.find(candidate => candidate.id === nodeId);
    const value = node?.params?.value;
    return finiteNumber(value) ? value : undefined;
  }

  private synchronizeClocks(): void {
    const declared = new Set((this.document.clocks ?? []).map(clock => clock.id));
    for (const [clockId] of this.clockStates) {
      if (!declared.has(clockId)) {
        this.clearClockTimer(clockId);
        this.clockStates.delete(clockId);
      }
    }
    for (const clock of this.document.clocks ?? []) {
      const previous = this.clockStates.get(clock.id);
      if (previous) {
        this.clockStates.set(clock.id, {
          ...previous,
          value: this.scalarNodeValue(clock.target) ?? previous.value
        });
      } else {
        this.clockStates.set(clock.id, initialClockState(clock, this.scalarNodeValue(clock.target)));
      }
    }
  }

  private clearClockTimer(clockId: string): void {
    const timer = this.clockTimers.get(clockId);
    if (timer !== undefined) clearTimeout(timer);
    this.clockTimers.delete(clockId);
  }

  private clearAllClockTimers(): void {
    for (const clockId of [...this.clockTimers.keys()]) this.clearClockTimer(clockId);
  }

  private pauseClocksForTarget(target: string): void {
    for (const clock of this.document.clocks ?? []) {
      if (clock.target !== target) continue;
      const state = this.clockStates.get(clock.id);
      if (!state) continue;
      this.clearClockTimer(clock.id);
      this.clockStates.set(clock.id, { ...state, value: this.scalarNodeValue(target) ?? state.value, status: "paused" });
      this.emit({ type: "clock.paused", target: clock.id, payload: { value: state.value, reason: "manual_input" } });
    }
  }

  private scheduleClock(clockId: string): void {
    this.clearClockTimer(clockId);
    const clock = this.document.clocks?.find(candidate => candidate.id === clockId);
    const state = this.clockStates.get(clockId);
    if (!clock || !state || state.status !== "running" || this.destroyed || this.destroyRequested) return;
    const timer = setTimeout(() => {
      this.clockTimers.delete(clockId);
      void this.enqueue(async () => {
        if (this.destroyed || this.destroyRequested || this.clockStates.get(clockId)?.status !== "running") return;
        const result = await this.stepClockLocked(clockId, true);
        if (result.ok && this.clockStates.get(clockId)?.status === "running") this.scheduleClock(clockId);
      });
    }, clock.intervalMs);
    this.clockTimers.set(clockId, timer);
  }

  private stateOnlyResult(ok = true): InteractionResult<MathDocument, MathOperation> {
    return {
      ok,
      revisionChanged: false,
      document: deepClone(this.document),
      state: this.captureState(),
      diagnostics: []
    };
  }

  private controlAction(action: MathControlAction): MathInteractionAction {
    if (action.type === "scalar.set") return { type: "scalar.set", target: action.target, payload: { value: action.value } };
    if (action.type === "boolean.set") return { type: "boolean.set", target: action.target, payload: { value: action.value } };
    if (action.type === "boolean.toggle") return { type: "boolean.toggle", target: action.target, payload: {} };
    if (action.type === "stage.set") return { type: "stage.set", payload: { stageId: action.stageId } };
    return { type: action.type, target: action.target, payload: {} };
  }

  private async stepClockLocked(
    clockId: string,
    scheduled: boolean
  ): Promise<InteractionResult<MathDocument, MathOperation>> {
    const clock = this.document.clocks?.find(candidate => candidate.id === clockId);
    const current = this.clockStates.get(clockId);
    if (!clock || !current) return this.interactionDenied(`Clock '${clockId}' does not exist.`, clockId);
    const base = scheduled ? current : { ...current, status: "paused" as const };
    const advanced = advanceClock(clock, base);
    this.clockStates.set(clockId, advanced.state);
    this.clockMutation = true;
    let result: InteractionResult<MathDocument, MathOperation>;
    try {
      result = await this.dispatchLocked({ type: "scalar.set", target: clock.target, payload: { value: advanced.state.value } });
    } finally {
      this.clockMutation = false;
    }
    if (!result.ok) {
      this.clockStates.set(clockId, { ...current, status: "paused" });
      return result;
    }
    this.emit({
      type: "clock.tick",
      target: clockId,
      payload: {
        value: advanced.state.value,
        tick: advanced.state.tick,
        direction: advanced.state.direction,
        completed: advanced.state.status === "completed"
      }
    });
    return { ...result, state: this.captureState() };
  }

  private async dispatchClockLocked(action: Extract<MathInteractionAction, { type: `clock.${string}` }>): Promise<InteractionResult<MathDocument, MathOperation>> {
    const clock = this.document.clocks?.find(candidate => candidate.id === action.target);
    const state = this.clockStates.get(action.target);
    if (!clock || !state) return this.interactionDenied(`Clock '${action.target}' does not exist.`, action.target);

    if (action.type === "clock.pause") {
      this.clearClockTimer(clock.id);
      this.clockStates.set(clock.id, { ...state, status: "paused" });
      this.emit({ type: "clock.paused", target: clock.id, payload: { value: state.value, reason: "control" } });
      return this.stateOnlyResult();
    }
    if (action.type === "clock.step") {
      this.clearClockTimer(clock.id);
      return this.stepClockLocked(clock.id, false);
    }
    if (action.type === "clock.reset") {
      this.clearClockTimer(clock.id);
      const reset = resetClockState(clock);
      this.clockStates.set(clock.id, reset);
      this.clockMutation = true;
      let result: InteractionResult<MathDocument, MathOperation>;
      try {
        result = await this.dispatchLocked({ type: "scalar.set", target: clock.target, payload: { value: reset.value } });
      } finally {
        this.clockMutation = false;
      }
      if (!result.ok) this.clockStates.set(clock.id, { ...state, status: "paused" });
      if (result.ok) this.emit({ type: "clock.reset", target: clock.id, payload: { value: reset.value } });
      return { ...result, state: this.captureState() };
    }

    let playState = state;
    let resetResult: InteractionResult<MathDocument, MathOperation> | undefined;
    if (state.status === "completed") {
      playState = resetClockState(clock);
      this.clockStates.set(clock.id, playState);
      this.clockMutation = true;
      try {
        resetResult = await this.dispatchLocked({ type: "scalar.set", target: clock.target, payload: { value: playState.value } });
      } finally {
        this.clockMutation = false;
      }
      if (!resetResult.ok) {
        this.clockStates.set(clock.id, { ...state, status: "paused" });
        return resetResult;
      }
    }
    this.clockStates.set(clock.id, { ...playState, status: "running" });
    this.scheduleClock(clock.id);
    this.emit({ type: "clock.playing", target: clock.id, payload: { value: playState.value } });
    return resetResult ? { ...resetResult, state: this.captureState() } : this.stateOnlyResult();
  }

  private async dispatchLocked(
    action: MathInteractionAction
  ): Promise<InteractionResult<MathDocument, MathOperation>> {
    if (this.destroyed || this.destroyRequested) {
      return {
        ok: false,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: [{
          code: "RENDERER_DESTROYED",
          severity: "error",
          message: "MountedRenderer has been destroyed.",
          retryable: false
        }]
      };
    }

    if (action.type === "selection.set") {
      const entityId = action.payload.entityId;
      if (entityId !== undefined) {
        if (!this.document.entities.some(entity => entity.id === entityId)) {
          return this.interactionDenied(`Selection target '${entityId}' does not exist.`, entityId);
        }
        if (!interactionAllows(this.document, entityId, "select")) {
          return this.interactionDenied(`Entity '${entityId}' does not allow select.`, entityId);
        }
      }
      this.selectedEntityId = entityId;
      this.emit({ type: "selection.changed", target: entityId, payload: { entityId: entityId ?? null } });
      return {
        ok: true,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: []
      };
    }

    if (action.type === "control.invoke") {
      const control = this.document.controls?.find(candidate => candidate.id === action.target);
      if (!control) return this.interactionDenied(`Control '${action.target}' does not exist.`, action.target);
      const result = await this.dispatchLocked(this.controlAction(control.action));
      if (result.ok) this.emit({ type: "control.invoked", target: control.id, payload: { actionType: control.action.type } });
      return { ...result, state: this.captureState() };
    }

    if (action.type === "clock.play" || action.type === "clock.pause" || action.type === "clock.reset" || action.type === "clock.step") {
      return this.dispatchClockLocked(action);
    }

    if (action.type === "stage.set") {
      const stageId = action.payload.stageId;
      if (stageId !== undefined && !stageExists(this.document, stageId)) {
        return this.interactionDenied(`Stage '${stageId}' does not exist.`, stageId);
      }
      this.stageId = stageId;
      this.active?.setStage(stageId);
      this.emit({ type: "stage.changed", payload: { stageId: stageId ?? null } });
      return {
        ok: true,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: []
      };
    }

    if (action.type === "boolean.toggle") {
      const runtime = evaluateMathDocument(this.document).entities.get(action.target);
      if (!runtime?.defined || typeof runtime.value !== "boolean") {
        return this.interactionDenied(`boolean.toggle target '${action.target}' must evaluate to a boolean.`, action.target);
      }
      return this.dispatchLocked({ type: "boolean.set", target: action.target, payload: { value: !runtime.value } });
    }

    const target = action.target;
    const nodeId = producerNodeId(this.document, target);
    if (!nodeId) {
      return {
        ok: false,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: [{
          code: "INTERACTION_TARGET_MISSING",
          severity: "error",
          message: `No producer construction node for '${target}'.`,
          path: "target",
          actual: target,
          retryable: false
        }]
      };
    }

    const node = this.document.construction.find(candidate => candidate.id === nodeId);
    const entity = this.document.entities.find(candidate => candidate.id === target);
    let patch: Record<string, unknown>;

    if (action.type === "point.set") {
      const coords = action.payload.coords;
      if (!Array.isArray(coords) || coords.length !== 2 || !finiteNumber(coords[0]) || !finiteNumber(coords[1])) {
        return this.interactionDenied("point.set requires finite coords [x, y].", coords);
      }
      if (!entity || entity.type !== "point2") {
        return this.interactionDenied(`point.set target '${target}' must be a point2.`, target);
      }
      if (node?.command !== "point.free" && node?.command !== "point.on_path") {
        return this.interactionDenied(`point.set only allows point.free or point.on_path (got '${node?.command}').`, node?.command);
      }
      if (!interactionAllows(this.document, target, "drag")) {
        return this.interactionDenied(`Entity '${target}' does not allow drag.`, target);
      }
      patch = node.command === "point.on_path"
        ? { initial: coords }
        : { coords };
    } else if (action.type === "scalar.set") {
      const value = action.payload.value;
      if (!finiteNumber(value)) {
        return this.interactionDenied("scalar.set requires a finite numeric value.", value);
      }
      if (!entity || entity.type !== "scalar") {
        return this.interactionDenied(`scalar.set target '${target}' must be a scalar.`, target);
      }
      if (node?.command !== "scalar.slider" && node?.command !== "scalar.constant") {
        return this.interactionDenied(`scalar.set only allows editable scalar.slider or scalar.constant (got '${node?.command}').`, node?.command);
      }
      if (!interactionAllows(this.document, target, "set_value")) {
        return this.interactionDenied(`Entity '${target}' does not allow set_value.`, target);
      }
      if (!this.clockMutation) this.pauseClocksForTarget(target);
      patch = { value };
    } else {
      const value = action.payload.value;
      if (typeof value !== "boolean") {
        return this.interactionDenied("boolean.set requires a boolean value.", value);
      }
      if (!entity || entity.type !== "boolean") {
        return this.interactionDenied(`boolean.set target '${target}' must be a boolean.`, target);
      }
      if (node?.command !== "boolean.constant") {
        return this.interactionDenied(`boolean.set only allows boolean.constant (got '${node?.command}').`, node?.command);
      }
      if (!interactionAllows(this.document, target, "set_value")) {
        return this.interactionDenied(`Entity '${target}' does not allow set_value.`, target);
      }
      patch = { value };
    }

    const operation: MathSetParamsOperation = {
      op: "set_params",
      nodeId,
      patch: patch as MathSetParamsOperation["patch"]
    };
    const changeSet: ChangeSet<MathOperation> = {
      schema: "famtutor.engine.change-set.v1",
      changeSetId: `interaction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      base: documentRef(this.document),
      operations: [operation],
      metadata: {
        timestamp: nowIso(),
        origin: "mounted-renderer-interaction"
      }
    };

    const update = await this.applyChangeSetLocked(changeSet);
    if (!update.ok) {
      if (!this.destroyed && !this.destroyRequested) {
        await this.rebuildWithDocument(deepClone(this.document), undefined);
      }
      this.emit({
        type: "interaction.failed",
        target,
        payload: { diagnostics: toJsonValue(update.diagnostics) }
      });
      return {
        ok: false,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: update.diagnostics,
        apply: update.apply ? deepClone(update.apply) : undefined
      };
    }

    if (action.type === "scalar.set") {
      for (const clock of this.document.clocks ?? []) {
        if (clock.target !== target) continue;
        const state = this.clockStates.get(clock.id);
        if (state) this.clockStates.set(clock.id, { ...state, value: action.payload.value });
      }
    }

    this.emit({
      type: "interaction.committed",
      target,
      payload: { revision: this.document.revision, actionType: action.type }
    });
    return {
      ok: true,
      revisionChanged: true,
      document: deepClone(this.document),
      state: this.captureState(),
      diagnostics: [],
      apply: update.apply ? deepClone(update.apply) : undefined
    };
  }
}

export async function mountMathRenderer(
  host: HTMLElement,
  document: MathDocument,
  options: MathMountedRendererOptions = {}
): Promise<MathMountedRenderer> {
  if (!host?.ownerDocument?.createElement) {
    throw new MathEngineError("DOM_HOST_REQUIRED", "mountMathRenderer requires a DOM HTMLElement host.");
  }
  const renderer = new MathMountedRendererImpl(host, document, options);
  await renderer.initialize();
  return renderer;
}

export { MAX_OPERATIONS as MOUNTED_MAX_OPERATIONS };
