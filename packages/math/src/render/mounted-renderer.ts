import type {
  ChangeSet,
  Diagnostic,
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
import type { MathDocument } from "../types.js";
import { deepClone, nowIso, stableHash, toJsonValue } from "../util.js";
import { mountJsxGraph, type JsxGraphRuntimeHandle, type JsxGraphRuntimeOptions } from "./jsxgraph.js";

const IDEMPOTENCY_LIMIT = 128;

export type MathInteractionAction =
  | { type: "point.set"; target: string; coords: [number, number] }
  | { type: "scalar.set"; target: string; value: number }
  | { type: "stage.set"; stageId?: string }
  | { type: "selection.set"; entityId?: string };

export interface MathMountedRendererOptions extends JsxGraphRuntimeOptions {
  domainRuntime?: MathDomainRuntime;
}

export interface MathMountedRenderer extends MountedRenderer<MathDocument, MathOperation, MathInteractionAction> {
  readonly host: HTMLElement;
}

function documentRef(document: MathDocument) {
  return {
    domain: MATH_DOMAIN,
    schema: MATH_DOCUMENT_SCHEMA,
    documentId: document.documentId,
    revision: document.revision
  };
}

function producerNodeId(document: MathDocument, entityId: string): string | undefined {
  return buildConstructionGraph(document).producerByEntity.get(entityId);
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
  private sequence = 0;
  private eventCounter = 0;
  private readonly listeners = new Set<(event: RuntimeEvent) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly idempotency = new Map<string, RenderUpdateResult<MathDocument, MathOperation>>();
  private readonly idempotencyOrder: string[] = [];

  constructor(host: HTMLElement, document: MathDocument, options: MathMountedRendererOptions = {}) {
    this.host = host;
    this.document = deepClone(document);
    this.domainRuntime = options.domainRuntime ?? new MathDomainRuntime();
    this.viewId = options.viewId;
    this.stageId = options.stageId;
    const { domainRuntime: _ignored, ...rest } = options;
    this.mountOptions = rest;
  }

  async initialize(): Promise<void> {
    const style = this.host.ownerDocument!.defaultView?.getComputedStyle(this.host);
    if (!style || style.position === "static") {
      this.host.style.position = "relative";
    }
    const container = this.createContainer("active");
    this.host.replaceChildren(container);
    this.activeContainer = container;
    this.active = mountJsxGraph(container, this.document, this.bindMountOptions());
    await this.active.ready;
  }

  getDocument(): MathDocument {
    return deepClone(this.document);
  }

  getState(): MountedRendererState {
    return this.captureState();
  }

  applyChangeSet(changeSet: ChangeSet<MathOperation>): Promise<RenderUpdateResult<MathDocument, MathOperation>> {
    return this.enqueue(async () => this.applyChangeSetLocked(changeSet));
  }

  replaceDocument(
    document: MathDocument,
    options: ReplaceDocumentOptions = {}
  ): Promise<RenderUpdateResult<MathDocument, MathOperation>> {
    return this.enqueue(async () => {
      if (this.destroyed) return destroyedFailure(this.document);
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
      return this.rebuildWithDocument(deepClone(document), undefined);
    });
  }

  dispatch(action: MathInteractionAction): Promise<InteractionResult<MathDocument, MathOperation>> {
    return this.enqueue(async () => this.dispatchLocked(action));
  }

  async snapshot(request: RenderRequest = {}): Promise<RenderResult> {
    if (this.destroyed) {
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
    const content = this.active.exportSvg();
    return {
      ok: true,
      artifact: {
        schema: "famtutor.engine.render-artifact.v1",
        document: documentRef(this.document),
        renderer: "jsxgraph-svg",
        mediaType: "image/svg+xml",
        encoding: "utf8",
        content,
        digest: { algorithm: "sha256-stableHash", value: stableHash(content) },
        diagnostics: []
      }
    };
  }

  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.active?.destroy();
    this.active = undefined;
    this.activeContainer = undefined;
    this.host.replaceChildren();
    this.listeners.clear();
    this.idempotency.clear();
    this.idempotencyOrder.length = 0;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private bindMountOptions(): JsxGraphRuntimeOptions {
    return {
      ...this.mountOptions,
      viewId: this.viewId,
      stageId: this.stageId,
      onSelect: entityId => {
        this.selectedEntityId = entityId;
        this.mountOptions.onSelect?.(entityId);
        this.emit({
          type: "selection.changed",
          target: entityId,
          payload: { entityId }
        });
      },
      onEvent: event => {
        this.mountOptions.onEvent?.(event);
        if (event.type === "object.dragEnd" && event.target && Array.isArray(event.value)) {
          const coords = event.value as [number, number];
          void this.dispatch({ type: "point.set", target: event.target, coords });
        } else if (event.type === "value.changed" && event.target && typeof event.value === "number") {
          void this.dispatch({ type: "scalar.set", target: event.target, value: event.value });
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
      destroyed: this.destroyed
    };
  }

  private emit(partial: Omit<RuntimeEvent, "schema" | "eventId" | "sequence" | "document" | "timestamp"> & { timestamp?: string }): void {
    this.sequence += 1;
    this.eventCounter += 1;
    const event: RuntimeEvent = {
      schema: "famtutor.engine.runtime-event.v1",
      eventId: `evt-${this.eventCounter}`,
      sequence: this.sequence,
      type: partial.type,
      document: documentRef(this.document),
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

  private rememberIdempotent(changeSetId: string, result: RenderUpdateResult<MathDocument, MathOperation>): void {
    if (this.idempotency.has(changeSetId)) return;
    this.idempotency.set(changeSetId, result);
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
    if (this.destroyed) return destroyedFailure(this.document);
    const cached = this.idempotency.get(changeSet.changeSetId);
    if (cached) return cached;

    const applied = await this.domainRuntime.apply(this.document, changeSet);
    if (!applied.ok) {
      const result = this.failUpdate(applied.diagnostics);
      result.apply = applied;
      this.rememberIdempotent(changeSet.changeSetId, result);
      return result;
    }

    const result = await this.rebuildWithDocument(applied.document, applied);
    this.rememberIdempotent(changeSet.changeSetId, result);
    return result;
  }

  private async rebuildWithDocument(
    nextDocument: MathDocument,
    apply?: RenderUpdateResult<MathDocument, MathOperation>["apply"]
  ): Promise<RenderUpdateResult<MathDocument, MathOperation>> {
    const previousState = this.captureState();
    const previousActive = this.active;
    const previousContainer = this.activeContainer;
    const previousDocument = this.document;

    const staging = this.createContainer("staging");
    staging.style.position = "absolute";
    staging.style.left = "-10000px";
    staging.style.top = "0";
    this.host.appendChild(staging);

    let stagingHandle: JsxGraphRuntimeHandle | undefined;
    try {
      stagingHandle = mountJsxGraph(staging, nextDocument, {
        ...this.bindMountOptions(),
        stageId: this.stageId,
        viewId: this.viewId
      });
      await stagingHandle.ready;

      // Restore ephemeral camera/stage/selection against next document.
      if (previousState.camera && Array.isArray((previousState.camera as { boundingBox?: unknown }).boundingBox)) {
        const box = (previousState.camera as { boundingBox: [number, number, number, number] }).boundingBox;
        stagingHandle.board.setBoundingBox?.(box, true);
      }
      const stageStillExists = !this.stageId
        || Boolean(nextDocument.activities?.flatMap(a => a.stages ?? []).some(s => s.id === this.stageId));
      if (this.stageId && !stageStillExists) {
        this.stageId = undefined;
        this.emit({
          type: "stage.cleared",
          payload: { reason: "stage_missing_after_rebuild" }
        });
      } else if (this.stageId) {
        stagingHandle.setStage(this.stageId);
      }
      if (this.selectedEntityId && !nextDocument.entities.some(e => e.id === this.selectedEntityId)) {
        this.selectedEntityId = undefined;
        this.emit({ type: "selection.changed", payload: { entityId: null, reason: "entity_removed" } });
      }

      this.document = nextDocument;
      this.active = stagingHandle;
      staging.style.position = "";
      staging.style.left = "";
      staging.dataset.role = "active";
      this.activeContainer = staging;
      previousActive?.destroy();
      previousContainer?.remove();
      // Ensure only one child remains.
      Array.from(this.host.children).forEach(child => {
        if (child !== staging) child.remove();
      });

      const result: RenderUpdateResult<MathDocument, MathOperation> = {
        ok: true,
        strategy: "rebuild",
        apply,
        state: this.captureState(),
        diagnostics: []
      };
      this.emit({
        type: "document.updated",
        payload: {
          strategy: "rebuild",
          revision: nextDocument.revision,
          changeSetId: apply && "changeSetId" in apply ? apply.changeSetId : null
        }
      });
      return result;
    } catch (error) {
      stagingHandle?.destroy();
      staging.remove();
      this.active = previousActive;
      this.activeContainer = previousContainer;
      this.document = previousDocument;
      const message = error instanceof Error ? error.message : String(error);
      return this.failUpdate([{
        code: "REBUILD_FAILED",
        severity: "error",
        message: `Staging remount failed: ${message}`,
        retryable: true
      }]);
    }
  }

  private async dispatchLocked(
    action: MathInteractionAction
  ): Promise<InteractionResult<MathDocument, MathOperation>> {
    if (this.destroyed) {
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
      this.selectedEntityId = action.entityId;
      this.emit({ type: "selection.changed", target: action.entityId, payload: { entityId: action.entityId ?? null } });
      return {
        ok: true,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: []
      };
    }

    if (action.type === "stage.set") {
      this.stageId = action.stageId;
      this.active?.setStage(action.stageId);
      this.emit({ type: "stage.changed", payload: { stageId: action.stageId ?? null } });
      return {
        ok: true,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: []
      };
    }

    const nodeId = producerNodeId(this.document, action.target);
    if (!nodeId) {
      return {
        ok: false,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: [{
          code: "INTERACTION_TARGET_MISSING",
          severity: "error",
          message: `No producer construction node for '${action.target}'.`,
          path: "target",
          actual: action.target,
          retryable: false
        }]
      };
    }

    const node = this.document.construction.find(candidate => candidate.id === nodeId);
    let patch: Record<string, unknown>;
    if (action.type === "point.set") {
      patch = node?.command === "point.on_path"
        ? { initial: action.coords }
        : { coords: action.coords };
    } else {
      patch = { value: action.value };
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
      // Restore native visuals to last canonical document.
      await this.rebuildWithDocument(deepClone(this.document), undefined);
      this.emit({
        type: "interaction.failed",
        target: action.target,
        payload: { diagnostics: toJsonValue(update.diagnostics) }
      });
      return {
        ok: false,
        revisionChanged: false,
        document: deepClone(this.document),
        state: this.captureState(),
        diagnostics: update.diagnostics,
        apply: update.apply
      };
    }

    this.emit({
      type: "interaction.committed",
      target: action.target,
      payload: { revision: this.document.revision, actionType: action.type }
    });
    return {
      ok: true,
      revisionChanged: true,
      document: deepClone(this.document),
      state: this.captureState(),
      diagnostics: [],
      apply: update.apply
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
