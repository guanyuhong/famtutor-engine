import type { DocumentRef } from "./document.js";
import type { JsonObject } from "./json.js";

/**
 * Transactional batch of domain operations.
 *
 * - No dryRun (preview/commit belong to stateful sessions).
 * - No separate expectedRevision (use base.revision).
 * - changeSetId is the stable transaction identity for session-level idempotency caches.
 * - undo is not a domain operation; sessions handle undo via DocumentStore history.
 * - metadata is optional JSON-safe provenance (timestamp/origin/actor); domain apply must not invent clocks.
 */
export interface ChangeSet<TOperation> {
  schema: "famtutor.engine.change-set.v1";
  changeSetId: string;
  base: DocumentRef;
  operations: readonly TOperation[];
  metadata?: JsonObject;
}
