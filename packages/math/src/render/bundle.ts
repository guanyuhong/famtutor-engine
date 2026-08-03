import {
  DEFAULT_BUNDLE_LIMITS,
  RENDER_BUNDLE_MIME,
  RENDER_BUNDLE_SCHEMA,
  checkRenderBundleCompatibility,
  createRenderBundle,
  serializeRenderBundle,
  validateRenderBundle,
  verifyRenderBundleIntegrity,
  type BundleLimits,
  type CreateBundleResult,
  type RenderBundle,
  type ValidateBundleResult
} from "@famtutor/core";
import { MathDomainRuntime } from "../domain-runtime.js";
import { MathEngineError } from "../errors.js";
import {
  MATH_DOCUMENT_SCHEMA,
  MATH_DOMAIN
} from "../operations.js";
import { validateMathDocument } from "../protocol/validate.js";
import type { MathDocument } from "../types.js";
import { deepClone, toJsonValue } from "../util.js";
import { MATH_RUNTIME_VERSION } from "../version.js";
import { mountMathRenderer, type MathMountedRenderer, type MathMountedRendererOptions } from "./mounted-renderer.js";

export const MATH_BUNDLE_LIMITS: BundleLimits = { ...DEFAULT_BUNDLE_LIMITS };

export interface CreateMathRenderBundleOptions {
  viewId?: string;
  stageId?: string;
  width?: number;
  height?: number;
  versionRange?: string;
  limits?: Partial<BundleLimits>;
  metadata?: Record<string, unknown>;
}

export interface MountMathRenderBundleOptions extends MathMountedRendererOptions {
  domainRuntime?: MathDomainRuntime;
  /** When compatibility fails, return fallback artifact instead of throwing / mounting. */
  allowFallbackOnly?: boolean;
}

export type MountMathRenderBundleResult =
  | { ok: true; renderer: MathMountedRenderer; bundle: RenderBundle }
  | {
    ok: false;
    diagnostics: Array<{ code: string; severity: string; message: string; path?: string; actual?: unknown; expected?: unknown }>;
    fallback?: RenderBundle["fallback"];
    bundle?: RenderBundle;
  };

export async function createMathRenderBundle(
  document: MathDocument,
  options: CreateMathRenderBundleOptions = {}
): Promise<CreateBundleResult> {
  const validation = validateMathDocument(document);
  if (validation.status === "invalid") {
    return {
      ok: false,
      diagnostics: validation.issues.map(issue => ({
        code: issue.code,
        severity: (issue.severity === "warning" || issue.severity === "info" ? issue.severity : "error") as "error" | "warning" | "info",
        message: issue.message,
        path: issue.path,
        expected: issue.expected,
        actual: issue.actual,
        retryable: issue.retryable
      }))
    };
  }

  const runtime = new MathDomainRuntime();
  const width = options.width ?? 960;
  const height = options.height ?? 640;
  const rendered = await runtime.render(document, {
    renderer: "direct-svg",
    width,
    height,
    viewId: options.viewId,
    stageId: options.stageId,
    mediaType: "image/svg+xml"
  });
  if (!rendered.ok) {
    return { ok: false, diagnostics: rendered.diagnostics };
  }

  const viewId = options.viewId ?? document.views.find(view => view.kind === "graphics2d")?.id;
  return createRenderBundle({
    documentRef: {
      domain: MATH_DOMAIN,
      schema: MATH_DOCUMENT_SCHEMA,
      documentId: document.documentId,
      revision: document.revision
    },
    document: toJsonValue(deepClone(document)),
    assets: [],
    entrypoint: {
      renderer: "jsxgraph-svg",
      mode: "mounted",
      mediaType: "image/svg+xml",
      viewId,
      stageId: options.stageId
    },
    requirements: {
      domain: MATH_DOMAIN,
      documentSchema: MATH_DOCUMENT_SCHEMA,
      runtime: {
        name: "@famtutor/math-runtime",
        versionRange: options.versionRange ?? `^${MATH_RUNTIME_VERSION}`
      },
      renderer: {
        id: "jsxgraph-svg",
        mode: "mounted",
        mediaTypes: ["image/svg+xml"]
      }
    },
    fallback: {
      mediaType: "image/svg+xml",
      encoding: "utf8",
      content: rendered.artifact.content
    },
    limits: options.limits
  });
}

export async function validateMathRenderBundle(value: unknown): Promise<ValidateBundleResult> {
  const structural = validateRenderBundle(value);
  if (!structural.ok) return structural;
  const integrity = await verifyRenderBundleIntegrity(structural.bundle);
  if (!integrity.ok) return { ok: false, diagnostics: integrity.diagnostics };

  const content = structural.bundle.document.content;
  const mathReport = validateMathDocument(content as unknown as MathDocument);
  if (mathReport.status === "invalid") {
    return {
      ok: false,
      diagnostics: mathReport.issues.map(issue => ({
        code: issue.code,
        severity: (issue.severity === "warning" || issue.severity === "info" ? issue.severity : "error") as "error" | "warning" | "info",
        message: issue.message,
        path: issue.path,
        expected: issue.expected,
        actual: issue.actual,
        retryable: issue.retryable
      }))
    };
  }
  if (structural.bundle.requirements.domain !== MATH_DOMAIN) {
    return {
      ok: false,
      diagnostics: [{
        code: "SCHEMA_INCOMPATIBLE",
        severity: "error",
        message: `Math bundle domain must be '${MATH_DOMAIN}'.`,
        path: "requirements.domain",
        actual: structural.bundle.requirements.domain,
        expected: MATH_DOMAIN
      }]
    };
  }
  if (structural.bundle.requirements.documentSchema !== MATH_DOCUMENT_SCHEMA) {
    return {
      ok: false,
      diagnostics: [{
        code: "SCHEMA_INCOMPATIBLE",
        severity: "error",
        message: `Math bundle documentSchema must be '${MATH_DOCUMENT_SCHEMA}'.`,
        path: "requirements.documentSchema",
        actual: structural.bundle.requirements.documentSchema,
        expected: MATH_DOCUMENT_SCHEMA
      }]
    };
  }
  return { ok: true, bundle: structural.bundle };
}

export async function mountMathRenderBundle(
  host: HTMLElement,
  bundle: RenderBundle | unknown,
  options: MountMathRenderBundleOptions = {}
): Promise<MountMathRenderBundleResult> {
  const validated = await validateMathRenderBundle(bundle);
  if (!validated.ok) {
    return { ok: false, diagnostics: validated.diagnostics };
  }

  const domainRuntime = options.domainRuntime ?? new MathDomainRuntime();
  const descriptor = await domainRuntime.descriptor();
  const compatibility = checkRenderBundleCompatibility(validated.bundle, descriptor);
  if (!compatibility.ok) {
    return {
      ok: false,
      diagnostics: compatibility.diagnostics,
      fallback: validated.bundle.fallback,
      bundle: validated.bundle
    };
  }

  // Never dynamic-import from bundle.runtime.name — host must provide registered runtime.
  const document = deepClone(validated.bundle.document.content) as unknown as MathDocument;
  const renderer = await mountMathRenderer(host, document, {
    ...options,
    domainRuntime,
    viewId: validated.bundle.entrypoint.viewId ?? options.viewId,
    stageId: validated.bundle.entrypoint.stageId ?? options.stageId
  });
  return { ok: true, renderer, bundle: validated.bundle };
}

export function mathRenderBundleCapabilities() {
  return {
    renderBundleSchema: RENDER_BUNDLE_SCHEMA,
    contentType: RENDER_BUNDLE_MIME,
    limits: MATH_BUNDLE_LIMITS,
    serialize: "canonicalizeJson",
    integrity: "sha256-exclude-integrity-field"
  };
}

export { serializeRenderBundle, RENDER_BUNDLE_MIME, RENDER_BUNDLE_SCHEMA };

export function assertMathBundleMountable(result: MountMathRenderBundleResult): asserts result is Extract<MountMathRenderBundleResult, { ok: true }> {
  if (!result.ok) {
    throw new MathEngineError("BUNDLE_MOUNT_FAILED", result.diagnostics[0]?.message ?? "Bundle mount failed.", {
      actual: toJsonValue(result.diagnostics.slice(0, 8))
    });
  }
}
