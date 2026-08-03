import type { JsonValue } from "./types.js";

export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/;

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const visit = (current: unknown): unknown => {
    if (current === null || typeof current !== "object") return current;
    if (seen.has(current as object)) throw new TypeError("Cannot stable-stringify cyclic values.");
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

/** Alias matching @famtutor/core canonicalizeJson (browser AMD self-contained). */
export function canonicalizeJson(value: unknown): string {
  return stableStringify(value);
}

/**
 * Non-cryptographic FNV-style hash for renderHash / cache keys only.
 * Do not label as sha256.
 */
export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + index;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}`;
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...view].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Minimal SHA-256 for environments without Web Crypto subtle (e.g. some about:blank smoke hosts). */
function sha256BytesSync(bytes: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  const bitLen = bytes.length * 8;
  const withOne = bytes.length + 1;
  const paddedLen = ((withOne + 8 + 63) & ~63);
  const buffer = new Uint8Array(paddedLen);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000));

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0); outView.setUint32(4, h1); outView.setUint32(8, h2); outView.setUint32(12, h3);
  outView.setUint32(16, h4); outView.setUint32(20, h5); outView.setUint32(24, h6); outView.setUint32(28, h7);
  return bytesToHex(out);
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return bytesToHex(await subtle.digest("SHA-256", copy.buffer));
  }
  return sha256BytesSync(bytes);
}

export async function sha256Utf8(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), toJsonValue(item)]));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return String(value);
}

export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function roundForJson(value: number, digits = 12): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
