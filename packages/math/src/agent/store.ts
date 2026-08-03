import { MathEngineError } from "../errors.js";
import type { JsonValue, MathDocument } from "../types.js";
import { deepClone } from "../util.js";

interface StoredRecord {
  document: MathDocument;
  history: MathDocument[];
  idempotency: Map<string, JsonValue>;
}

export interface StoreOptions {
  maxHistory?: number;
  maxDocuments?: number;
}

export class DocumentStore {
  readonly maxHistory: number;
  readonly maxDocuments: number;
  #records = new Map<string, StoredRecord>();

  constructor(options: StoreOptions = {}) {
    this.maxHistory = options.maxHistory ?? 32;
    this.maxDocuments = options.maxDocuments ?? 256;
  }

  has(documentId: string): boolean {
    return this.#records.has(documentId);
  }

  list(): Array<{ documentId: string; revision: number; title: string }> {
    return [...this.#records.values()]
      .map(record => ({
        documentId: record.document.documentId,
        revision: record.document.revision,
        title: record.document.metadata.title
      }))
      .sort((left, right) => left.documentId.localeCompare(right.documentId));
  }

  create(document: MathDocument, replace = false): MathDocument {
    if (this.#records.has(document.documentId) && !replace) {
      throw new MathEngineError("DOCUMENT_ALREADY_EXISTS", `Document '${document.documentId}' already exists.`, {
        actual: document.documentId
      });
    }
    if (!this.#records.has(document.documentId) && this.#records.size >= this.maxDocuments) {
      throw new MathEngineError("DOCUMENT_LIMIT_EXCEEDED", `The in-memory store limit of ${this.maxDocuments} documents has been reached.`, {
        retryable: false
      });
    }
    const clone = deepClone(document);
    this.#records.set(document.documentId, {
      document: clone,
      history: [],
      idempotency: new Map()
    });
    return deepClone(clone);
  }

  get(documentId: string): MathDocument {
    const record = this.#records.get(documentId);
    if (!record) throw new MathEngineError("DOCUMENT_NOT_FOUND", `Document '${documentId}' was not found.`, { actual: documentId });
    return deepClone(record.document);
  }

  getCurrentUnsafe(documentId: string): MathDocument {
    const record = this.#records.get(documentId);
    if (!record) throw new MathEngineError("DOCUMENT_NOT_FOUND", `Document '${documentId}' was not found.`, { actual: documentId });
    return record.document;
  }

  save(document: MathDocument, expectedRevision?: number): MathDocument {
    const record = this.#records.get(document.documentId);
    if (!record) throw new MathEngineError("DOCUMENT_NOT_FOUND", `Document '${document.documentId}' was not found.`);
    if (expectedRevision !== undefined && record.document.revision !== expectedRevision) {
      throw new MathEngineError("REVISION_CONFLICT", `Expected revision ${expectedRevision}, but current revision is ${record.document.revision}.`, {
        expected: expectedRevision,
        actual: record.document.revision,
        retryable: true
      });
    }
    record.history.push(deepClone(record.document));
    if (record.history.length > this.maxHistory) record.history.splice(0, record.history.length - this.maxHistory);
    record.document = deepClone(document);
    return deepClone(record.document);
  }

  delete(documentId: string): boolean {
    return this.#records.delete(documentId);
  }

  undo(documentId: string): MathDocument {
    const record = this.#records.get(documentId);
    if (!record) throw new MathEngineError("DOCUMENT_NOT_FOUND", `Document '${documentId}' was not found.`);
    const previous = record.history.pop();
    if (!previous) throw new MathEngineError("UNDO_EMPTY", `Document '${documentId}' has no stored history.`);
    const restored = deepClone(previous);
    restored.revision = record.document.revision + 1;
    record.document = restored;
    return deepClone(restored);
  }

  getIdempotent(documentId: string, key: string): JsonValue | undefined {
    return this.#records.get(documentId)?.idempotency.get(key);
  }

  setIdempotent(documentId: string, key: string, result: JsonValue): void {
    const record = this.#records.get(documentId);
    if (!record) throw new MathEngineError("DOCUMENT_NOT_FOUND", `Document '${documentId}' was not found.`);
    record.idempotency.set(key, deepClone(result));
    if (record.idempotency.size > 128) {
      const first = record.idempotency.keys().next().value as string | undefined;
      if (first) record.idempotency.delete(first);
    }
  }
}
