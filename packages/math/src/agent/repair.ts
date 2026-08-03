import type { JsonValue, SuggestedFix, ValidationIssue } from "../types.js";
import { MathEngineError } from "../errors.js";

function fix(description: string, operation?: Record<string, JsonValue>): SuggestedFix {
  return operation ? { description, operation } : { description };
}

/**
 * Attach actionable suggestedFixes to validation / runtime issues for Agent repair loops.
 */
export function enrichIssueWithRepair(issue: ValidationIssue): ValidationIssue {
  if (issue.suggestedFixes && issue.suggestedFixes.length > 0) return issue;
  const suggestedFixes = repairSuggestionsForCode(issue.code, issue);
  return suggestedFixes.length > 0 ? { ...issue, suggestedFixes } : issue;
}

export function enrichIssuesWithRepair(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.map(enrichIssueWithRepair);
}

export function repairSuggestionsForError(error: MathEngineError): SuggestedFix[] {
  if (error.suggestedFixes && error.suggestedFixes.length > 0) return error.suggestedFixes;
  return repairSuggestionsForCode(error.code, {
    path: error.path,
    message: error.message,
    expected: error.expected,
    actual: error.actual
  });
}

export function repairSuggestionsForCode(code: string, issue: Pick<ValidationIssue, "path" | "expected" | "actual" | "message">): SuggestedFix[] {
  switch (code) {
    case "REVISION_CONFLICT":
      return [
        fix("Inspect the document to read the latest revision, then retry math_apply with expectedRevision set to that value.", {
          op: "inspect_hint",
          tool: "math_inspect",
          includeDocument: false
        })
      ];
    case "TYPE_MISMATCH":
    case "OUTPUT_TYPE_MISMATCH":
    case "RUNTIME_TYPE_MISMATCH":
      return [
        fix(`Replace the entity at ${issue.path} with one whose type is ${JSON.stringify(issue.expected)}.`, {
          op: "construct",
          note: "Create or reference an entity matching the expected type, then retry."
        })
      ];
    case "DELETE_HAS_DEPENDENTS":
      return [
        fix("Retry delete with cascade=true to remove dependents, or hide the entity instead of deleting.", {
          op: "delete",
          cascade: true,
          targets: Array.isArray(issue.actual) ? issue.actual : []
        }),
        fix("Keep the entity and set visible=false via set_entity.", {
          op: "set_entity",
          patch: { visible: false }
        })
      ];
    case "TRANSACTION_VALIDATION_FAILED":
    case "INVALID_MATH_DOCUMENT":
      return [
        fix("Read details.report.issues, fix only the failing nodes with set_params/delete/construct, then dryRun again.")
      ];
    case "UNKNOWN_COMMAND":
      return [
        fix("Call math_capabilities (or use an L1 expand_macro) and pick a supported command/macro name.")
      ];
    case "UNKNOWN_MACRO":
    case "MACRO_NOT_EXECUTABLE":
      return [
        fix("List macros from math_capabilities.macros and use an executable macro, or expand manually with L0 construct ops.")
      ];
    case "MACRO_INPUT_MISSING":
      return [
        fix("Provide the missing input binding in expand_macro.inputs.")
      ];
    case "MACRO_CENTER_UNRESOLVED":
      return [
        fix("Pass inputs.center explicitly, or build the circle with circle.center_radius / circle.through_points first.")
      ];
    case "DUPLICATE_ENTITY_ID":
    case "DUPLICATE_NODE_ID":
      return [
        fix("Choose a fresh entity/node id, or delete the existing one before reconstructing.")
      ];
    case "NODE_NOT_FOUND":
    case "ENTITY_NOT_FOUND":
      return [
        fix("math_inspect the document and use an existing id, or construct the missing entity first.")
      ];
    case "PARALLEL_LINES":
    case "NO_INTERSECTION":
    case "DEGENERATE_LINE":
    case "DEGENERATE_CIRCUMCIRCLE":
    case "DEGENERATE_ANGLE":
    case "DEGENERATE_CONIC":
    case "DEGENERATE_ARC":
      return [
        fix("Change free-point coordinates or slider values to a non-degenerate configuration; do not loosen tolerances.", {
          op: "set_params",
          note: "Adjust point.free coords / scalar.slider value, then validate."
        })
      ];
    case "EXPRESSION_PARSE_ERROR":
    case "EXPRESSION_UNKNOWN_FUNCTION":
    case "INVALID_EXPRESSION_PARAMETER":
      return [
        fix("Rewrite the expression using the safe whitelist (sin/cos/distance/@entity-id); avoid property access and statements.")
      ];
    default:
      return [];
  }
}
