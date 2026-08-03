import type { DocumentRef } from "./document.js";
import type { Diagnostic } from "./diagnostics.js";
import type { JsonObject, JsonValue } from "./json.js";

/** Request a single render pass from a DomainRuntime or MountedRenderer.snapshot. */
export interface RenderRequest {
  schema?: "famtutor.engine.render-request.v1";
  renderer?: string;
  mediaType?: string;
  viewId?: string;
  width?: number;
  height?: number;
  stageId?: string;
  options?: JsonObject;
}

/**
 * One-shot render result (SVG/PNG/JSON bytes).
 * Not a host delivery container — that is famtutor.render.bundle.v1 (PR4).
 */
export interface RenderArtifact {
  schema: "famtutor.engine.render-artifact.v1";
  document: DocumentRef;
  renderer: string;
  mediaType: string;
  encoding: "utf8" | "base64";
  content: string;
  digest: {
    algorithm: string;
    value: string;
  };
  diagnostics: Diagnostic[];
  metadata?: JsonObject;
}

export type RenderResult =
  | { ok: true; artifact: RenderArtifact }
  | { ok: false; diagnostics: Diagnostic[] };

export interface SimulationRequest {
  schema?: "famtutor.engine.simulation-request.v1";
  action: JsonObject;
  observe?: string[];
  options?: JsonObject;
}

export interface SimulationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  frames?: JsonValue;
  committedRevision?: number;
  metadata?: JsonObject;
}
