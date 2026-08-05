import type { DocumentRef } from "./document.js";
import type { Diagnostic } from "./diagnostics.js";
import {
  canonicalizeJson,
  digestCanonicalJson,
  sha256Content,
  sha256Utf8,
  type Digest
} from "./hash.js";
import type { JsonValue } from "./json.js";
import type { RendererMode, RuntimeDescriptor } from "./runtime.js";

export const RENDER_BUNDLE_SCHEMA = "famtutor.render.bundle.v1" as const;
export const RENDER_BUNDLE_MIME = "application/vnd.famtutor.render-bundle+json";

export interface BundleLimits {
  maxBundleBytes: number;
  maxAssets: number;
  maxAssetBytes: number;
  maxTotalAssetBytes: number;
}

export const DEFAULT_BUNDLE_LIMITS: BundleLimits = {
  maxBundleBytes: 2_000_000,
  maxAssets: 32,
  maxAssetBytes: 500_000,
  maxTotalAssetBytes: 1_000_000
};

export interface RenderBundleDocument {
  ref: DocumentRef;
  content: JsonValue;
  digest: Digest;
}

export interface BundleAsset {
  id: string;
  mediaType: string;
  encoding: "utf8" | "base64";
  content: string;
  digest: Digest;
}

export interface RenderBundleEntrypoint {
  renderer: string;
  mode: RendererMode;
  mediaType: string;
  viewId?: string;
  stageId?: string;
  assetId?: string;
}

export interface RenderBundleRequirements {
  domain: string;
  documentSchema: string;
  runtime: {
    name: string;
    versionRange: string;
  };
  renderer: {
    id: string;
    mode: RendererMode;
    mediaTypes: string[];
  };
}

export interface RenderBundleFallback {
  mediaType: string;
  encoding: "utf8" | "base64";
  content: string;
  digest: Digest;
}

export interface RenderBundle {
  schema: typeof RENDER_BUNDLE_SCHEMA;
  document: RenderBundleDocument;
  assets: BundleAsset[];
  entrypoint: RenderBundleEntrypoint;
  requirements: RenderBundleRequirements;
  fallback: RenderBundleFallback;
  integrity: Digest;
}

export interface CreateRenderBundleAssetInput {
  id: string;
  mediaType: string;
  encoding: "utf8" | "base64";
  content: string;
}

export interface CreateRenderBundleFallbackInput {
  mediaType: string;
  encoding: "utf8" | "base64";
  content: string;
}

export interface CreateRenderBundleInput {
  documentRef: DocumentRef;
  document: JsonValue;
  assets?: CreateRenderBundleAssetInput[];
  entrypoint: RenderBundleEntrypoint;
  requirements: RenderBundleRequirements;
  fallback: CreateRenderBundleFallbackInput;
  limits?: Partial<BundleLimits>;
}

export type ValidateBundleResult =
  | { ok: true; bundle: RenderBundle }
  | { ok: false; diagnostics: Diagnostic[] };

export type CompatibilityResult =
  | { ok: true }
  | { ok: false; diagnostics: Diagnostic[] };

export type CreateBundleResult =
  | { ok: true; bundle: RenderBundle }
  | { ok: false; diagnostics: Diagnostic[] };

const EXECUTABLE_MEDIA_TYPES = new Set([
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "text/javascript",
  "text/html"
]);

const SHA256_HEX = /^[0-9a-f]{64}$/;

function diagnostic(
  code: string,
  message: string,
  path?: string,
  actual?: JsonValue,
  expected?: JsonValue
): Diagnostic {
  return { code, severity: "error", message, path, actual, expected };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDigest(value: unknown): value is Digest {
  return (
    isPlainObject(value) &&
    value.algorithm === "sha256" &&
    typeof value.value === "string" &&
    SHA256_HEX.test(value.value)
  );
}

function isDocumentRef(value: unknown): value is DocumentRef {
  return (
    isPlainObject(value) &&
    typeof value.domain === "string" &&
    value.domain.length > 0 &&
    typeof value.schema === "string" &&
    value.schema.length > 0 &&
    typeof value.documentId === "string" &&
    value.documentId.length > 0 &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 1
  );
}

function isRendererMode(value: unknown): value is RendererMode {
  return value === "artifact" || value === "mounted" || value === "snapshot";
}

function parseSemver(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    const leftPart = left[index]!;
    const rightPart = right[index]!;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}

/** Simple semver matcher: exact, caret (^x.y.z), >=, or *. */
export function semverSatisfies(version: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === "*") return true;
  if (trimmed.startsWith("^")) {
    const required = parseSemver(trimmed.slice(1));
    const actual = parseSemver(version);
    if (!required || !actual) return false;
    if (actual[0] !== required[0]) return false;
    return compareSemver(actual, required) >= 0;
  }
  if (trimmed.startsWith(">=")) {
    const required = parseSemver(trimmed.slice(2));
    const actual = parseSemver(version);
    if (!required || !actual) return false;
    return compareSemver(actual, required) >= 0;
  }
  return version.trim() === trimmed;
}

function isValidEncoding(value: unknown): value is "utf8" | "base64" {
  return value === "utf8" || value === "base64";
}

function isValidBase64(content: string): boolean {
  if (content.length === 0 || content.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return false;
  try {
    atob(content);
    return true;
  } catch {
    return false;
  }
}

function decodeContent(content: string, encoding: "utf8" | "base64"): string {
  if (encoding === "utf8") return content;
  return atob(content);
}

function isUnsafeSvg(content: string, encoding: "utf8" | "base64"): boolean {
  const text = decodeContent(content, encoding);
  if (/<script[\s>]/i.test(text)) return true;
  if (/<foreignObject[\s>]/i.test(text)) return true;
  if (/xlink:href\s*=\s*["']?\s*(?:https?:|javascript:|data:text\/html)/i.test(text)) return true;
  return false;
}

function assetByteLength(content: string, encoding: "utf8" | "base64"): number {
  if (encoding === "utf8") return new TextEncoder().encode(content).byteLength;
  return Math.floor((content.length * 3) / 4);
}

function bundleWithoutIntegrity(bundle: RenderBundle): Omit<RenderBundle, "integrity"> {
  const { integrity: _integrity, ...rest } = bundle;
  return rest;
}

export function serializeRenderBundle(bundle: RenderBundle): string {
  return canonicalizeJson(bundle);
}

export function validateRenderBundle(value: unknown): ValidateBundleResult {
  const diagnostics: Diagnostic[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, diagnostics: [diagnostic("INVALID_BUNDLE", "Render bundle must be an object.")] };
  }
  if (value.schema !== RENDER_BUNDLE_SCHEMA) {
    diagnostics.push(
      diagnostic("INVALID_SCHEMA", "Unexpected bundle schema.", "schema", value.schema as JsonValue, RENDER_BUNDLE_SCHEMA)
    );
  }
  if (!isPlainObject(value.document)) {
    diagnostics.push(diagnostic("INVALID_DOCUMENT", "Bundle document must be an object.", "document"));
  } else {
    if (!isDocumentRef(value.document.ref)) diagnostics.push(diagnostic("INVALID_DOCUMENT_REF", "Invalid document ref.", "document.ref"));
    if (value.document.content === undefined) diagnostics.push(diagnostic("INVALID_DOCUMENT_CONTENT", "Missing document content.", "document.content"));
    if (!isDigest(value.document.digest)) diagnostics.push(diagnostic("INVALID_DOCUMENT_DIGEST", "Invalid document digest.", "document.digest"));
  }
  if (!Array.isArray(value.assets)) {
    diagnostics.push(diagnostic("INVALID_ASSETS", "Assets must be an array.", "assets"));
  } else {
    const seen = new Set<string>();
    value.assets.forEach((asset, index) => {
      const base = `assets[${index}]`;
      if (!isPlainObject(asset)) {
        diagnostics.push(diagnostic("INVALID_ASSET", "Asset must be an object.", base));
        return;
      }
      if (typeof asset.id !== "string" || asset.id.length === 0) {
        diagnostics.push(diagnostic("INVALID_ASSET_ID", "Asset id must be a non-empty string.", `${base}.id`));
      } else if (seen.has(asset.id)) {
        diagnostics.push(diagnostic("DUPLICATE_ASSET_ID", "Duplicate asset id.", `${base}.id`, asset.id));
      } else {
        seen.add(asset.id);
      }
      if (typeof asset.mediaType !== "string" || asset.mediaType.length === 0) {
        diagnostics.push(diagnostic("INVALID_ASSET_MEDIA_TYPE", "Asset mediaType must be a non-empty string.", `${base}.mediaType`));
      }
      if (!isValidEncoding(asset.encoding)) {
        diagnostics.push(diagnostic("INVALID_ASSET_ENCODING", "Asset encoding must be utf8 or base64.", `${base}.encoding`));
      }
      if (typeof asset.content !== "string") {
        diagnostics.push(diagnostic("INVALID_ASSET_CONTENT", "Asset content must be a string.", `${base}.content`));
      }
      if (!isDigest(asset.digest)) {
        diagnostics.push(diagnostic("INVALID_ASSET_DIGEST", "Invalid asset digest.", `${base}.digest`));
      }
    });
  }
  if (!isPlainObject(value.entrypoint)) {
    diagnostics.push(diagnostic("INVALID_ENTRYPOINT", "Entrypoint must be an object.", "entrypoint"));
  } else {
    if (typeof value.entrypoint.renderer !== "string" || value.entrypoint.renderer.length === 0) {
      diagnostics.push(diagnostic("INVALID_ENTRYPOINT_RENDERER", "Entrypoint renderer must be a non-empty string.", "entrypoint.renderer"));
    }
    if (!isRendererMode(value.entrypoint.mode)) {
      diagnostics.push(diagnostic("INVALID_ENTRYPOINT_MODE", "Entrypoint mode is invalid.", "entrypoint.mode"));
    }
    if (typeof value.entrypoint.mediaType !== "string" || value.entrypoint.mediaType.length === 0) {
      diagnostics.push(diagnostic("INVALID_ENTRYPOINT_MEDIA_TYPE", "Entrypoint mediaType must be a non-empty string.", "entrypoint.mediaType"));
    }
    if (value.entrypoint.assetId !== undefined && (typeof value.entrypoint.assetId !== "string" || value.entrypoint.assetId.length === 0)) {
      diagnostics.push(diagnostic("INVALID_ENTRYPOINT_ASSET_ID", "Entrypoint assetId must be a non-empty string.", "entrypoint.assetId"));
    }
  }
  if (!isPlainObject(value.requirements)) {
    diagnostics.push(diagnostic("INVALID_REQUIREMENTS", "Requirements must be an object.", "requirements"));
  } else {
    if (typeof value.requirements.domain !== "string" || value.requirements.domain.length === 0) {
      diagnostics.push(diagnostic("INVALID_REQUIREMENTS_DOMAIN", "Requirements domain must be a non-empty string.", "requirements.domain"));
    }
    if (typeof value.requirements.documentSchema !== "string" || value.requirements.documentSchema.length === 0) {
      diagnostics.push(diagnostic("INVALID_REQUIREMENTS_DOCUMENT_SCHEMA", "Requirements documentSchema must be a non-empty string.", "requirements.documentSchema"));
    }
    if (!isPlainObject(value.requirements.runtime)) {
      diagnostics.push(diagnostic("INVALID_REQUIREMENTS_RUNTIME", "Requirements runtime must be an object.", "requirements.runtime"));
    } else {
      if (typeof value.requirements.runtime.name !== "string" || value.requirements.runtime.name.length === 0) {
        diagnostics.push(diagnostic("INVALID_REQUIREMENTS_RUNTIME_NAME", "Requirements runtime name must be a non-empty string.", "requirements.runtime.name"));
      }
      if (typeof value.requirements.runtime.versionRange !== "string" || value.requirements.runtime.versionRange.length === 0) {
        diagnostics.push(diagnostic("INVALID_REQUIREMENTS_RUNTIME_VERSION", "Requirements runtime versionRange must be a non-empty string.", "requirements.runtime.versionRange"));
      }
    }
    if (!isPlainObject(value.requirements.renderer)) {
      diagnostics.push(diagnostic("INVALID_REQUIREMENTS_RENDERER", "Requirements renderer must be an object.", "requirements.renderer"));
    } else {
      if (typeof value.requirements.renderer.id !== "string" || value.requirements.renderer.id.length === 0) {
        diagnostics.push(diagnostic("INVALID_REQUIREMENTS_RENDERER_ID", "Requirements renderer.id must be a non-empty string.", "requirements.renderer.id"));
      }
      if (!isRendererMode(value.requirements.renderer.mode)) {
        diagnostics.push(diagnostic("INVALID_REQUIREMENTS_RENDERER_MODE", "Requirements renderer.mode is invalid.", "requirements.renderer.mode"));
      }
      if (!Array.isArray(value.requirements.renderer.mediaTypes) || value.requirements.renderer.mediaTypes.some(item => typeof item !== "string" || item.length === 0)) {
        diagnostics.push(diagnostic("INVALID_REQUIREMENTS_RENDERER_MEDIA", "Requirements renderer.mediaTypes must be a non-empty string array.", "requirements.renderer.mediaTypes"));
      }
    }
  }
  if (!isPlainObject(value.fallback)) {
    diagnostics.push(diagnostic("INVALID_FALLBACK", "Fallback must be an object.", "fallback"));
  } else {
    if (typeof value.fallback.mediaType !== "string" || value.fallback.mediaType.length === 0) {
      diagnostics.push(diagnostic("INVALID_FALLBACK_MEDIA_TYPE", "Fallback mediaType must be a non-empty string.", "fallback.mediaType"));
    }
    if (!isValidEncoding(value.fallback.encoding)) {
      diagnostics.push(diagnostic("INVALID_FALLBACK_ENCODING", "Fallback encoding must be utf8 or base64.", "fallback.encoding"));
    }
    if (typeof value.fallback.content !== "string") {
      diagnostics.push(diagnostic("INVALID_FALLBACK_CONTENT", "Fallback content must be a string.", "fallback.content"));
    }
    if (!isDigest(value.fallback.digest)) {
      diagnostics.push(diagnostic("INVALID_FALLBACK_DIGEST", "Invalid fallback digest.", "fallback.digest"));
    }
  }
  if (!isDigest(value.integrity)) {
    diagnostics.push(diagnostic("INVALID_INTEGRITY", "Invalid bundle integrity digest.", "integrity"));
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, bundle: value as unknown as RenderBundle };
}

export async function verifyRenderBundleIntegrity(bundle: RenderBundle): Promise<CompatibilityResult> {
  const diagnostics: Diagnostic[] = [];
  const structural = validateRenderBundle(bundle);
  if (!structural.ok) return structural;

  const withoutIntegrity = bundleWithoutIntegrity(bundle);
  const integrityDigest = await sha256Utf8(canonicalizeJson(withoutIntegrity));
  if (integrityDigest !== bundle.integrity.value) {
    diagnostics.push(
      diagnostic("INTEGRITY_MISMATCH", "Bundle integrity hash does not match payload.", "integrity", bundle.integrity.value, integrityDigest)
    );
  }

  const documentDigest = await digestCanonicalJson(bundle.document.content);
  if (documentDigest.value !== bundle.document.digest.value) {
    diagnostics.push(
      diagnostic("DOCUMENT_DIGEST_MISMATCH", "Document digest does not match canonical content.", "document.digest", bundle.document.digest.value, documentDigest.value)
    );
  }

  for (const asset of bundle.assets) {
    const assetDigest = await sha256Content(asset.content, asset.encoding);
    if (assetDigest !== asset.digest.value) {
      diagnostics.push(
        diagnostic("ASSET_DIGEST_MISMATCH", "Asset digest does not match content.", `assets.${asset.id}.digest`, asset.digest.value, assetDigest)
      );
    }
  }

  const fallbackDigest = await sha256Content(bundle.fallback.content, bundle.fallback.encoding);
  if (fallbackDigest !== bundle.fallback.digest.value) {
    diagnostics.push(
      diagnostic("FALLBACK_DIGEST_MISMATCH", "Fallback digest does not match content.", "fallback.digest", bundle.fallback.digest.value, fallbackDigest)
    );
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true };
}

export function checkRenderBundleCompatibility(
  bundle: RenderBundle,
  runtimeDescriptor: RuntimeDescriptor
): CompatibilityResult {
  const diagnostics: Diagnostic[] = [];
  const { requirements, entrypoint } = bundle;

  if (requirements.domain !== runtimeDescriptor.domain) {
    diagnostics.push(
      diagnostic("RUNTIME_INCOMPATIBLE", "Runtime domain does not match bundle requirements.", "requirements.domain", runtimeDescriptor.domain, requirements.domain)
    );
  }
  if (!runtimeDescriptor.documentSchemas.includes(requirements.documentSchema)) {
    diagnostics.push(
      diagnostic(
        "SCHEMA_INCOMPATIBLE",
        "Runtime does not support the required document schema.",
        "requirements.documentSchema",
        runtimeDescriptor.documentSchemas,
        requirements.documentSchema
      )
    );
  }
  if (runtimeDescriptor.name !== requirements.runtime.name) {
    diagnostics.push(
      diagnostic("RUNTIME_INCOMPATIBLE", "Runtime name does not match bundle requirements.", "requirements.runtime.name", runtimeDescriptor.name, requirements.runtime.name)
    );
  }
  if (!semverSatisfies(runtimeDescriptor.version, requirements.runtime.versionRange)) {
    diagnostics.push(
      diagnostic(
        "RUNTIME_INCOMPATIBLE",
        "Runtime version does not satisfy bundle requirements.",
        "requirements.runtime.versionRange",
        runtimeDescriptor.version,
        requirements.runtime.versionRange
      )
    );
  }

  const requiredRenderer = requirements.renderer ?? {
    id: entrypoint.renderer,
    mode: entrypoint.mode,
    mediaTypes: [entrypoint.mediaType]
  };
  const renderer = runtimeDescriptor.renderers.find(item => item.id === requiredRenderer.id);
  if (!renderer) {
    diagnostics.push(
      diagnostic("RENDERER_UNAVAILABLE", "Required renderer is not provided by the runtime.", "requirements.renderer.id", runtimeDescriptor.renderers.map(item => item.id), requiredRenderer.id)
    );
  } else {
    if (!renderer.modes.includes(requiredRenderer.mode) || !renderer.modes.includes(entrypoint.mode)) {
      diagnostics.push(
        diagnostic("RENDERER_UNAVAILABLE", "Renderer does not support the required mode.", "entrypoint.mode", renderer.modes, entrypoint.mode)
      );
    }
    if (!requiredRenderer.mediaTypes.every(mediaType => renderer.mediaTypes.includes(mediaType))
      || !renderer.mediaTypes.includes(entrypoint.mediaType)) {
      diagnostics.push(
        diagnostic("RENDERER_UNAVAILABLE", "Renderer does not support the required media type.", "entrypoint.mediaType", renderer.mediaTypes, entrypoint.mediaType)
      );
    }
  }

  if (entrypoint.assetId !== undefined) {
    const asset = bundle.assets.find(item => item.id === entrypoint.assetId);
    if (!asset) {
      diagnostics.push(diagnostic("ENTRYPOINT_ASSET_MISSING", "Entrypoint assetId was not found in assets.", "entrypoint.assetId", bundle.assets.map(item => item.id), entrypoint.assetId));
    } else if (asset.mediaType !== entrypoint.mediaType) {
      diagnostics.push(
        diagnostic("ENTRYPOINT_ASSET_MEDIA_TYPE_MISMATCH", "Entrypoint mediaType does not match asset mediaType.", "entrypoint.mediaType", asset.mediaType, entrypoint.mediaType)
      );
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true };
}

function resolveLimits(input?: Partial<BundleLimits>): BundleLimits {
  return { ...DEFAULT_BUNDLE_LIMITS, ...input };
}

function validateAssetInput(asset: CreateRenderBundleAssetInput, path: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (typeof asset.id !== "string" || asset.id.length === 0) {
    diagnostics.push(diagnostic("INVALID_ASSET_ID", "Asset id must be a non-empty string.", `${path}.id`));
  }
  if (typeof asset.mediaType !== "string" || asset.mediaType.length === 0) {
    diagnostics.push(diagnostic("INVALID_ASSET_MEDIA_TYPE", "Asset mediaType must be a non-empty string.", `${path}.mediaType`));
  } else if (EXECUTABLE_MEDIA_TYPES.has(asset.mediaType.toLowerCase())) {
    diagnostics.push(diagnostic("EXECUTABLE_ASSET", "Executable asset media types are not allowed.", `${path}.mediaType`, asset.mediaType));
  }
  if (!isValidEncoding(asset.encoding)) {
    diagnostics.push(diagnostic("INVALID_ASSET_ENCODING", "Asset encoding must be utf8 or base64.", `${path}.encoding`));
  } else if (asset.encoding === "base64" && typeof asset.content === "string" && !isValidBase64(asset.content)) {
    diagnostics.push(diagnostic("INVALID_ASSET_ENCODING", "Asset base64 content is malformed.", `${path}.content`));
  }
  if (typeof asset.content !== "string") {
    diagnostics.push(diagnostic("INVALID_ASSET_CONTENT", "Asset content must be a string.", `${path}.content`));
  } else if (asset.mediaType === "image/svg+xml" && isValidEncoding(asset.encoding) && isUnsafeSvg(asset.content, asset.encoding)) {
    diagnostics.push(diagnostic("UNSAFE_SVG", "SVG asset contains disallowed script, foreignObject, or external href.", `${path}.content`));
  }
  return diagnostics;
}

export async function createRenderBundle(input: CreateRenderBundleInput): Promise<CreateBundleResult> {
  const diagnostics: Diagnostic[] = [];
  const limits = resolveLimits(input.limits);

  if (!isDocumentRef(input.documentRef)) {
    diagnostics.push(diagnostic("INVALID_DOCUMENT_REF", "documentRef is invalid.", "documentRef"));
  }
  if (input.document === undefined) {
    diagnostics.push(diagnostic("INVALID_DOCUMENT_CONTENT", "document content is required.", "document"));
  }
  if (!isPlainObject(input.entrypoint)) {
    diagnostics.push(diagnostic("INVALID_ENTRYPOINT", "entrypoint is required.", "entrypoint"));
  }
  if (!isPlainObject(input.requirements)) {
    diagnostics.push(diagnostic("INVALID_REQUIREMENTS", "requirements are required.", "requirements"));
  }
  if (!isPlainObject(input.fallback)) {
    diagnostics.push(diagnostic("INVALID_FALLBACK", "fallback is required.", "fallback"));
  }

  const assets = [...(input.assets ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  const seenAssetIds = new Set<string>();
  let totalAssetBytes = 0;
  if (assets.length > limits.maxAssets) {
    diagnostics.push(diagnostic("ASSET_LIMIT", "Too many assets.", "assets", assets.length, limits.maxAssets));
  }
  assets.forEach((asset, index) => {
    diagnostics.push(...validateAssetInput(asset, `assets[${index}]`));
    if (seenAssetIds.has(asset.id)) {
      diagnostics.push(diagnostic("DUPLICATE_ASSET_ID", "Duplicate asset id.", `assets[${index}].id`, asset.id));
    } else {
      seenAssetIds.add(asset.id);
    }
    if (typeof asset.content === "string" && isValidEncoding(asset.encoding)) {
      const bytes = assetByteLength(asset.content, asset.encoding);
      totalAssetBytes += bytes;
      if (bytes > limits.maxAssetBytes) {
        diagnostics.push(diagnostic("ASSET_SIZE_LIMIT", "Asset exceeds maxAssetBytes.", `assets[${index}].id`, bytes, limits.maxAssetBytes));
      }
    }
  });
  if (totalAssetBytes > limits.maxTotalAssetBytes) {
    diagnostics.push(diagnostic("TOTAL_ASSET_SIZE_LIMIT", "Total asset bytes exceed limit.", "assets", totalAssetBytes, limits.maxTotalAssetBytes));
  }

  if (input.fallback) {
    if (typeof input.fallback.mediaType !== "string" || input.fallback.mediaType.length === 0) {
      diagnostics.push(diagnostic("INVALID_FALLBACK_MEDIA_TYPE", "Fallback mediaType must be a non-empty string.", "fallback.mediaType"));
    } else if (EXECUTABLE_MEDIA_TYPES.has(input.fallback.mediaType.toLowerCase())) {
      diagnostics.push(diagnostic("EXECUTABLE_FALLBACK", "Executable fallback media types are not allowed.", "fallback.mediaType", input.fallback.mediaType));
    }
    if (!isValidEncoding(input.fallback.encoding)) {
      diagnostics.push(diagnostic("INVALID_FALLBACK_ENCODING", "Fallback encoding must be utf8 or base64.", "fallback.encoding"));
    } else if (input.fallback.encoding === "base64" && typeof input.fallback.content === "string" && !isValidBase64(input.fallback.content)) {
      diagnostics.push(diagnostic("INVALID_FALLBACK_ENCODING", "Fallback base64 content is malformed.", "fallback.content"));
    }
    if (typeof input.fallback.content !== "string") {
      diagnostics.push(diagnostic("INVALID_FALLBACK_CONTENT", "Fallback content must be a string.", "fallback.content"));
    } else if (input.fallback.mediaType === "image/svg+xml" && isValidEncoding(input.fallback.encoding) && isUnsafeSvg(input.fallback.content, input.fallback.encoding)) {
      diagnostics.push(diagnostic("UNSAFE_SVG", "Fallback SVG contains disallowed script, foreignObject, or external href.", "fallback.content"));
    }
  }

  if (input.entrypoint?.assetId !== undefined) {
    if (!seenAssetIds.has(input.entrypoint.assetId)) {
      diagnostics.push(diagnostic("ENTRYPOINT_ASSET_MISSING", "Entrypoint assetId was not found in assets.", "entrypoint.assetId", [...seenAssetIds], input.entrypoint.assetId));
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const requirements = {
    ...input.requirements,
    renderer: input.requirements.renderer ?? {
      id: input.entrypoint.renderer,
      mode: input.entrypoint.mode,
      mediaTypes: [input.entrypoint.mediaType]
    }
  };

  const documentDigest = await digestCanonicalJson(input.document);
  const builtAssets: BundleAsset[] = [];
  for (const asset of assets) {
    builtAssets.push({
      id: asset.id,
      mediaType: asset.mediaType,
      encoding: asset.encoding,
      content: asset.content,
      digest: { algorithm: "sha256", value: await sha256Content(asset.content, asset.encoding) }
    });
  }

  const fallback: RenderBundleFallback = {
    mediaType: input.fallback.mediaType,
    encoding: input.fallback.encoding,
    content: input.fallback.content,
    digest: { algorithm: "sha256", value: await sha256Content(input.fallback.content, input.fallback.encoding) }
  };

  const partial: Omit<RenderBundle, "integrity"> = {
    schema: RENDER_BUNDLE_SCHEMA,
    document: {
      ref: input.documentRef,
      content: input.document,
      digest: documentDigest
    },
    assets: builtAssets,
    entrypoint: input.entrypoint,
    requirements,
    fallback
  };

  const serialized = canonicalizeJson(partial);
  const bundleBytes = new TextEncoder().encode(serialized).byteLength;
  if (bundleBytes > limits.maxBundleBytes) {
    return {
      ok: false,
      diagnostics: [diagnostic("BUNDLE_SIZE_LIMIT", "Bundle exceeds maxBundleBytes.", "integrity", bundleBytes, limits.maxBundleBytes)]
    };
  }

  const bundle: RenderBundle = {
    ...partial,
    integrity: { algorithm: "sha256", value: await sha256Utf8(serialized) }
  };

  const validated = validateRenderBundle(bundle);
  if (!validated.ok) return validated;
  return { ok: true, bundle: validated.bundle };
}
