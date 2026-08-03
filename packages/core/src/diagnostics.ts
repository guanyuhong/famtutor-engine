import type { JsonValue } from "./json.js";

/**
 * Suggested remediation for an Agent or host.
 * Operations are opaque JSON from core's perspective (domain-typed at the edges).
 */
export interface SuggestedFix<TOperation = JsonValue> {
  description: string;
  operation?: TOperation;
}

/**
 * Structured diagnostic shared across validate/apply/render.
 * Expected protocol failures use Diagnostics inside results — not thrown Errors.
 */
export interface Diagnostic<TOperation = JsonValue> {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  path?: string;
  expected?: JsonValue;
  actual?: JsonValue;
  retryable?: boolean;
  suggestedFixes?: SuggestedFix<TOperation>[];
}

export interface ValidationReport<TOperation = JsonValue> {
  status: "valid" | "invalid";
  issues: Diagnostic<TOperation>[];
}
