import type { ChangeSet } from "./changeset.js";
import type { DocumentRef } from "./document.js";
import type { Diagnostic, ValidationReport } from "./diagnostics.js";
import type { JsonObject, JsonValue } from "./json.js";
import type { RenderRequest, RenderResult, SimulationRequest, SimulationResult } from "./render.js";

export type RendererMode = "artifact" | "mounted" | "snapshot";

export interface RuntimeDescriptor {
  name: string;
  version: string;
  domain: string;
  documentSchemas: string[];
  operationSchemas: string[];
  renderers: Array<{
    id: string;
    mediaTypes: string[];
    modes: RendererMode[];
  }>;
  limits?: JsonObject;
  capabilities?: JsonObject;
}

export interface CapabilityQuery {
  category?: string;
  prefix?: string;
  kind?: string;
}

export interface CapabilityResult {
  descriptor: RuntimeDescriptor;
  items: JsonValue[];
  metadata?: JsonObject;
}

export interface ApplySuccess<TDocument, TOperation = JsonValue> {
  ok: true;
  changeSetId: string;
  base: DocumentRef;
  next: DocumentRef;
  document: TDocument;
  created?: string[];
  removed?: string[];
  diagnostics: Diagnostic<TOperation>[];
  effects?: JsonObject;
}

export interface ApplyFailure<TDocument, TOperation = JsonValue> {
  ok: false;
  changeSetId: string;
  base: DocumentRef;
  /** Current document (pre-apply clone); never a half-built draft. */
  document: TDocument;
  diagnostics: Diagnostic<TOperation>[];
  effects?: JsonObject;
}

/**
 * Result of DomainRuntime.apply as a true discriminated union.
 * Expected failures set ok=false; unexpected programming errors may still throw.
 */
export type ApplyResult<TDocument, TOperation = JsonValue> =
  | ApplySuccess<TDocument, TOperation>
  | ApplyFailure<TDocument, TOperation>;

/**
 * Stateless domain executor.
 *
 * Implementations MUST NOT:
 * - hold a DocumentStore
 * - persist documents
 * - keep undo history or idempotency caches
 * - implement auth/session/multi-tenant
 * - mutate the input document in apply()
 * - invent wall-clock timestamps during apply
 *
 * Stateful Agent/session layers (preview/commit/undo/idempotency) wrap this interface.
 */
export interface DomainRuntime<TDocument, TOperation> {
  descriptor(): Promise<RuntimeDescriptor>;
  capabilities(query?: CapabilityQuery): Promise<CapabilityResult>;
  validate(document: TDocument): Promise<ValidationReport>;
  apply(document: TDocument, changeSet: ChangeSet<TOperation>): Promise<ApplyResult<TDocument, TOperation>>;
  render(document: TDocument, request: RenderRequest): Promise<RenderResult>;
  simulate?(document: TDocument, request: SimulationRequest): Promise<SimulationResult>;
}
