import type {
  CapabilityQuery,
  CapabilityResult,
  ChangeSet,
  Diagnostic,
  DomainRuntime,
  RenderArtifact,
  RenderRequest,
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
import { toJsonValue } from "./util.js";
import { MATH_RUNTIME_VERSION } from "./version.js";

function toCoreValidation(report: ReturnType<typeof validateMathDocument>): ValidationReport {
  return {
    status: report.status === "valid" ? "valid" : "invalid",
    issues: report.issues.map(issue => ({
      code: issue.code,
      severity: issue.severity === "warning" ? "warning" : "error",
      message: issue.message,
      path: issue.path,
      expected: issue.expected,
      actual: issue.actual,
      retryable: issue.retryable,
      suggestedFixes: issue.suggestedFixes
    }))
  };
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
        { id: "direct-svg", mediaTypes: ["image/svg+xml"] },
        { id: "jsxgraph-svg", mediaTypes: ["image/svg+xml"] },
        { id: "jsxgraph-canvas", mediaTypes: ["application/vnd.jsxgraph.canvas"] }
      ],
      limits: {
        maxOperations: 128,
        maxSimulationSamples: 256,
        maxRenderDimension: 4096
      },
      capabilities: {
        commands: commandCapabilities().length,
        macros: macroCapabilities().length,
        agentTools: 9
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
        macros: toJsonValue(macroCapabilities())
      }
    };
  }

  async validate(document: MathDocument): Promise<ValidationReport> {
    return toCoreValidation(validateMathDocument(document));
  }

  async apply(document: MathDocument, changeSet: ChangeSet<MathOperation>) {
    return applyMathChangeSet(document, changeSet);
  }

  async render(document: MathDocument, request: RenderRequest): Promise<RenderArtifact> {
    const width = request.width ?? 960;
    const height = request.height ?? 640;
    const result = renderDirectSvg(document, {
      viewId: request.viewId,
      width,
      height,
      stageId: request.stageId
    });
    const diagnostics: Diagnostic[] = result.report.warnings.map(issue => ({
      code: issue.code,
      severity: issue.severity === "warning" ? "warning" as const : "error" as const,
      message: issue.message,
      path: issue.path,
      expected: issue.expected,
      actual: issue.actual,
      retryable: issue.retryable,
      suggestedFixes: issue.suggestedFixes
    }));
    return {
      schema: "famtutor.engine.render-artifact.v1",
      document: {
        domain: MATH_DOMAIN,
        schema: MATH_DOCUMENT_SCHEMA,
        documentId: document.documentId,
        revision: document.revision
      },
      renderer: request.renderer ?? "direct-svg",
      mediaType: request.mediaType ?? "image/svg+xml",
      encoding: "utf8",
      content: result.svg,
      digest: {
        algorithm: "famtutor-render-hash",
        value: result.report.renderHash
      },
      diagnostics,
      metadata: {
        width,
        height,
        report: toJsonValue(result.report)
      }
    };
  }
}
