import type { JsonValue } from "./json.js";

/**
 * Deterministic JSON serialization: object keys sorted recursively.
 * Used for digests, integrity hashes, and idempotency fingerprints.
 */
export function canonicalizeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const visit = (current: unknown): unknown => {
    if (current === null || typeof current !== "object") {
      if (typeof current === "number" && !Number.isFinite(current)) {
        throw new TypeError("canonicalizeJson rejects non-finite numbers.");
      }
      return current;
    }
    if (seen.has(current as object)) throw new TypeError("canonicalizeJson rejects cyclic values.");
    seen.add(current as object);
    if (Array.isArray(current)) return current.map(visit);
    const object = current as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      if (object[key] === undefined) continue;
      output[key] = visit(object[key]);
    }
    return output;
  };
  return JSON.stringify(visit(value));
}

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error("Web Crypto subtle digest is required for SHA-256.");
  }
  return cryptoObj.subtle;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of raw bytes → 64-char lowercase hex. */
export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const subtle = getSubtle();
  // Copy into a fresh ArrayBuffer to satisfy BufferSource typing across DOM/Node.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await subtle.digest("SHA-256", copy.buffer);
  return bytesToHex(digest);
}

/** SHA-256 of UTF-8 text → 64-char lowercase hex. */
export async function sha256Utf8(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}

/** Digest of a UTF-8 RenderArtifact content string. */
export async function sha256Content(content: string, encoding: "utf8" | "base64"): Promise<string> {
  if (encoding === "utf8") return sha256Utf8(content);
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return sha256Bytes(bytes);
}

export type Digest = { algorithm: "sha256"; value: string };

export async function digestCanonicalJson(value: unknown): Promise<Digest> {
  return { algorithm: "sha256", value: await sha256Utf8(canonicalizeJson(value)) };
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}
