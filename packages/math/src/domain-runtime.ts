import type {
  CapabilityQuery,
  CapabilityResult,
  ChangeSet,
  Diagnostic,
  DomainRuntime,
  RenderRequest,
  RenderResult,
  RuntimeDescriptor,
  ValidationReport
} from "@famtutor/core";
import { applyMathChangeSet } from "./apply-changeset.js";
import { commandCapabilities } from "./catalog/commands.js";
import { macroCapabilities } from "./catalog/macros.js";
import {
  MATH_DOCUMENT_SCHEMA,
  MATH_DOMAIN,
  MATH_OPERATION_SCHEMA,
  type MathOperation
} from "./operations.js";
import { validateMathDocument } from "./protocol/validate.js";
import { renderDirectSvg } from "./render/direct-svg.js";
import type { MathDocument } from "./types.js";
import { sha256Utf8, toJsonValue } from "./util.js";
import { MATH_RUNTIME_VERSION } from "./version.js";

const MIN_DIMENSION = 64;
const MAX_DIMENSION = 4096;

function mapSeverity(severity: string | undefined): Diagnostic["severity"] {
  if (severity === "warning" || severity === "info") return severity;
  return "error";
}

function toCoreValidation(report: ReturnType<typeof validateMathDocument>): ValidationReport {
  return {
    status: report.status,
    issues: report.issues.map(issue => ({
      code: issue.code,
      severity: mapSeverity(issue.severity),
      message: issue.message,
      path: issue.path,
      expected: issue.expected,
      actual: issue.actual,
      retryable: issue.retryable,
      suggestedFixes: issue.suggestedFixes
    }))
  };
}

function dimensionOk(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_DIMENSION && value <= MAX_DIMENSION;
}

/**
 * Stateless math DomainRuntime. No DocumentStore, undo, or idempotency.
 */
export class MathDomainRuntime implements DomainRuntime<MathDocument, MathOperation> {
  async descriptor(): Promise<RuntimeDescriptor> {
    return {
      name: "@famtutor/math-runtime",
      version: MATH_RUNTIME_VERSION,
      domain: MATH_DOMAIN,
      documentSchemas: [MATH_DOCUMENT_SCHEMA],
      operationSchemas: [MATH_OPERATION_SCHEMA],
      renderers: [
        { id: "direct-svg", mediaTypes: ["image/svg+xml"], modes: ["artifact", "snapshot"] },
        { id: "jsxgraph-svg", mediaTypes: ["image/svg+xml"], modes: ["mounted", "snapshot"] },
        { id: "jsxgraph-canvas", mediaTypes: ["application/vnd.jsxgraph.canvas"], modes: ["mounted"] }
      ],
      limits: {
        maxOperations: 128,
        maxSimulationSamples: 256,
        maxRenderDimension: MAX_DIMENSION
      },
      capabilities: {
        commands: commandCapabilities().length,
        macros: macroCapabilities().length,
        agentTools: 9,
        controlActions: 8,
        deterministicClock: true
      }
    };
  }

  async capabilities(query: CapabilityQuery = {}): Promise<CapabilityResult> {
    const descriptor = await this.descriptor();
    const commands = commandCapabilities().filter(command =>
      (!query.category || command.category === query.category)
      && (!query.prefix || String(command.name).startsWith(query.prefix))
    );
    return {
      descriptor,
      items: toJsonValue(commands) as CapabilityResult["items"],
      metadata: {
        macros: toJsonValue(macroCapabilities()),
        interactionProtocols: toJsonValue({
          controls: ["scalar.set", "boolean.set", "boolean.toggle", "stage.set", "clock.play", "clock.pause", "clock.reset", "clock.step"],
          clocks: { operations: ["set_clock"], mountedActions: ["clock.play", "clock.pause", "clock.reset", "clock.step"] }
        })
      }
    };
  }

  async validate(document: MathDocument): Promise<ValidationReport> {
    return toCoreValidation(validateMathDocument(document));
  }

  async apply(document: MathDocument, changeSet: ChangeSet<MathOperation>) {
    return applyMathChangeSet(document, changeSet);
  }

  async render(document: MathDocument, request: RenderRequest = {}): Promise<RenderResult> {
    const renderer = request.renderer ?? "direct-svg";
    if (renderer !== "direct-svg") {
      return {
        ok: false,
        diagnostics: [{
          code: "UNSUPPORTED_RENDER_MODE",
          severity: "error",
          message: `DomainRuntime.render only supports direct-svg artifacts; '${renderer}' requires a MountedRenderer.`,
          path: "renderer",
          actual: renderer,
          retryable: false,
          suggestedFixes: [{ description: "Omit renderer or set renderer to 'direct-svg'." }]
        }]
      };
    }
    if (request.mediaType !== undefined && request.mediaType !== "image/svg+xml") {
      return {
        ok: false,
        diagnostics: [{
          code: "UNSUPPORTED_MEDIA_TYPE",
          severity: "error",
          message: "direct-svg only supports mediaType image/svg+xml.",
          path: "mediaType",
          expected: "image/svg+xml",
          actual: request.mediaType,
          retryable: false
        }]
      };
    }
    const width = request.width ?? 960;
    const height = request.height ?? 640;
    if (!dimensionOk(width) || !dimensionOk(height)) {
      return {
        ok: false,
        diagnostics: [{
          code: "INVALID_RENDER_DIMENSION",
          severity: "error",
          message: `width/height must be integers in [${MIN_DIMENSION}, ${MAX_DIMENSION}].`,
          path: "width",
          expected: `${MIN_DIMENSION}..${MAX_DIMENSION}`,
          actual: `${width}x${height}`,
          retryable: false
        }]
      };
    }
    if (request.viewId && !document.views.some(view => view.id === request.viewId)) {
      return {
        ok: false,
        diagnostics: [{
          code: "VIEW_NOT_FOUND",
          severity: "error",
          message: `View '${request.viewId}' was not found.`,
          path: "viewId",
          actual: request.viewId,
          retryable: false
        }]
      };
    }
    if (request.stageId) {
      const stages = document.activities?.flatMap(activity => activity.stages ?? []) ?? [];
      if (!stages.some(stage => stage.id === request.stageId)) {
        return {
          ok: false,
          diagnostics: [{
            code: "STAGE_NOT_FOUND",
            severity: "error",
            message: `Stage '${request.stageId}' was not found.`,
            path: "stageId",
            actual: request.stageId,
            retryable: false
          }]
        };
      }
    }
    const result = renderDirectSvg(document, {
      viewId: request.viewId,
      width,
      height,
      stageId: request.stageId
    });
    const diagnostics: Diagnostic[] = result.report.warnings.map(issue => ({
      code: issue.code,
      severity: mapSeverity(issue.severity),
      message: issue.message,
      path: issue.path,
      expected: issue.expected,
      actual: issue.actual,
      retryable: issue.retryable,
      suggestedFixes: issue.suggestedFixes
    }));
    const content = result.svg;
    return {
      ok: true,
      artifact: {
        schema: "famtutor.engine.render-artifact.v1",
        document: {
          domain: MATH_DOMAIN,
          schema: MATH_DOCUMENT_SCHEMA,
          documentId: document.documentId,
          revision: document.revision
        },
        renderer: "direct-svg",
        mediaType: "image/svg+xml",
        encoding: "utf8",
        content,
        digest: {
          algorithm: "sha256",
          value: await sha256Utf8(content)
        },
        diagnostics,
        metadata: {
          width,
          height,
          report: toJsonValue(result.report)
        }
      }
    };
  }
}
