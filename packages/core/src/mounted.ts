import type { ChangeSet } from "./changeset.js";
import type { DocumentRef } from "./document.js";
import type { Diagnostic } from "./diagnostics.js";
import type { JsonObject, JsonValue } from "./json.js";
import type { ApplyResult } from "./runtime.js";
import type { RenderRequest, RenderResult } from "./render.js";

export type Unsubscribe = () => void;

/**
 * Host/session interaction action. Domain packages refine the payload shape.
 * Core keeps this JSON-safe and opaque beyond `type`.
 */
export interface InteractionAction {
  type: string;
  target?: string;
  payload?: JsonObject;
}

export interface RuntimeEvent {
  schema: "famtutor.engine.runtime-event.v1";
  eventId: string;
  sequence: number;
  type: string;
  document: DocumentRef;
  timestamp: string;
  target?: string;
  payload?: JsonObject;
}

export interface MountedRendererState {
  schema: "famtutor.engine.mounted-renderer-state.v1";
  document: DocumentRef;
  viewId?: string;
  stageId?: string;
  selectedEntityId?: string;
  rendererMode?: string;
  camera?: JsonObject;
  destroyed: boolean;
  metadata?: JsonObject;
}

export interface RenderUpdateResult<TDocument, TOperation = JsonValue> {
  ok: boolean;
  strategy: "rebuild" | "reconcile";
  apply?: ApplyResult<TDocument, TOperation>;
  state: MountedRendererState;
  diagnostics: Diagnostic<TOperation>[];
  effects?: JsonObject;
}

export interface ReplaceDocumentOptions {
  /** Allow switching to a different documentId. */
  allowDocumentSwitch?: boolean;
  /** Allow replacing with a lower revision (explicit rollback). */
  allowRevisionRollback?: boolean;
}

export interface InteractionResult<TDocument, TOperation = JsonValue> {
  ok: boolean;
  revisionChanged: boolean;
  document: TDocument;
  state: MountedRendererState;
  diagnostics: Diagnostic<TOperation>[];
  apply?: ApplyResult<TDocument, TOperation>;
  events?: RuntimeEvent[];
}

/**
 * Stateful mounted renderer.
 * DomainRuntime stays stateless; this layer owns camera/stage/selection, apply serialization,
 * ChangeSet idempotency, and event fan-out.
 */
export interface MountedRenderer<TDocument, TOperation, TAction = InteractionAction> {
  getDocument(): TDocument;
  getState(): MountedRendererState;
  applyChangeSet(changeSet: ChangeSet<TOperation>): Promise<RenderUpdateResult<TDocument, TOperation>>;
  replaceDocument(document: TDocument, options?: ReplaceDocumentOptions): Promise<RenderUpdateResult<TDocument, TOperation>>;
  dispatch(action: TAction): Promise<InteractionResult<TDocument, TOperation>>;
  snapshot(request?: RenderRequest): Promise<RenderResult>;
  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe;
  destroy(): Promise<void>;
}
