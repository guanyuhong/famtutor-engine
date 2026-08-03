import type { ChangeSet } from "./changeset.js";
import type { Diagnostic } from "./diagnostics.js";
import type { JsonObject } from "./json.js";

export const TEXTBOOK_CASE_SCHEMA = "famtutor.case.v1" as const;

export type TextbookCaseStatus =
  | "accepted"
  | "expected-unsupported"
  | "invalid"
  | "regression";

export type TextbookCaseType =
  | "demonstration"
  | "exploration"
  | "guided-construction"
  | "assessment";

export interface TextbookCaseSource {
  bookId: string;
  pdfName: string;
  pdfSha256: string;
  chapter: string;
  section: string;
  printedPages: number[];
  pdfPages: number[];
  extractionMethod: "visual-review" | "ocr-reviewed" | "structured-source";
  confidence: number;
  reviewStatus: "reviewed" | "needs-review";
}

export interface TextbookCaseGeneration {
  provider: string;
  model: string;
  promptVersion: string;
  seed: number;
  attempts: number;
}

/**
 * Domain-neutral case envelope. Domain-specific initial documents, operations,
 * assertions, and derived artifacts remain JSON so a corpus does not couple
 * @famtutor/core to a particular runtime.
 */
export interface TextbookCase {
  schema: typeof TEXTBOOK_CASE_SCHEMA;
  caseId: string;
  title: string;
  description: string;
  source: TextbookCaseSource;
  knowledgePoints: string[];
  learningObjective: string;
  caseType: TextbookCaseType;
  difficulty: "introductory" | "intermediate" | "advanced";
  requiredCapabilities: string[];
  generation: TextbookCaseGeneration;
  inputs: {
    initialDocument?: JsonObject;
    parameters?: JsonObject;
  };
  trace: {
    changeSets: ChangeSet<JsonObject>[];
  };
  expected: {
    documentFingerprint?: string;
    assertions: JsonObject[];
    interactions: JsonObject[];
    expectedFailure?: {
      stage: string;
      code: string;
      message: string;
    };
  };
  artifacts: JsonObject;
  status: TextbookCaseStatus;
  diagnostics: Diagnostic[];
}
