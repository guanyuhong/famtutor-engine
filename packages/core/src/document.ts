/**
 * Stable identity of a domain document revision.
 * Used as ChangeSet.base — expectedRevision is base.revision, not a separate field.
 */
export interface DocumentRef {
  /** Domain id, e.g. "math". */
  domain: string;
  /** Domain document schema id, e.g. "famtutor.math.document.v1". */
  schema: string;
  documentId: string;
  revision: number;
}
