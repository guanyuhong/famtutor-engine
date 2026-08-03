import type { ChangeSet } from "./changeset.js";
import type { DocumentRef } from "./document.js";
import type { Diagnostic, ValidationReport } from "./diagnostics.js";
import type { JsonObject, JsonValue } from "./json.js";
import type { RenderArtifact, RenderRequest, SimulationRequest, SimulationResult } from "./render.js";

export interface RuntimeDescriptor {
  name: string;
  version: string;
  domain: string;
  documentSchemas: string[];
  operationSchemas: string[];
  renderers: Array<{
    id: string;
    mediaTypes: string[];
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

/**
 * Result of DomainRuntime.apply.
 * Expected failures (revision conflict, validation) set ok=false with diagnostics.
 * Unexpected programming errors may still throw.
 */
export interface ApplyResult<TDocument, TOperation = JsonValue> {
  ok: boolean;
  changeSetId: string;
  base: DocumentRef;
  next?: DocumentRef;
  document?: TDocument;
  created?: string[];
  removed?: string[];
  diagnostics: Diagnostic<TOperation>[];
  effects?: JsonObject;
}

/**
 * Stateless domain executor.
 *
 * Implementations MUST NOT:
 * - hold a DocumentStore
 * - persist documents
 * - keep undo history or idempotency caches
 * - implement auth/session/multi-tenant
 * - mutate the input document in apply()
 *
 * Stateful Agent/session layers (preview/commit/undo/idempotency) wrap this interface.
 */
export interface DomainRuntime<TDocument, TOperation> {
  descriptor(): Promise<RuntimeDescriptor>;
  capabilities(query?: CapabilityQuery): Promise<CapabilityResult>;
  validate(document: TDocument): Promise<ValidationReport>;
  apply(document: TDocument, changeSet: ChangeSet<TOperation>): Promise<ApplyResult<TDocument, TOperation>>;
  render(document: TDocument, request: RenderRequest): Promise<RenderArtifact>;
  simulate?(document: TDocument, request: SimulationRequest): Promise<SimulationResult>;
}
