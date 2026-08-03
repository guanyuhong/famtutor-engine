import type { JsonValue, SuggestedFix, ValidationIssue } from "./types.js";

export class MathEngineError extends Error {
  readonly code: string;
  readonly path: string;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
  readonly retryable: boolean;
  readonly details?: Record<string, JsonValue>;
  readonly suggestedFixes?: SuggestedFix[];

  constructor(
    code: string,
    message: string,
    options: {
      path?: string;
      expected?: JsonValue;
      actual?: JsonValue;
      retryable?: boolean;
      details?: Record<string, JsonValue>;
      suggestedFixes?: SuggestedFix[];
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MathEngineError";
    this.code = code;
    this.path = options.path ?? "$";
    this.expected = options.expected;
    this.actual = options.actual;
    this.retryable = options.retryable ?? true;
    this.details = options.details;
    this.suggestedFixes = options.suggestedFixes;
  }

  toIssue(severity: "error" | "warning" = "error"): ValidationIssue {
    return {
      code: this.code,
      severity,
      path: this.path,
      message: this.message,
      expected: this.expected,
      actual: this.actual,
      retryable: this.retryable,
      suggestedFixes: this.suggestedFixes
    };
  }

  toErrorObject(): Record<string, JsonValue | boolean | null> {
    return {
      code: this.code,
      message: this.message,
      path: this.path,
      expected: this.expected ?? null,
      actual: this.actual ?? null,
      retryable: this.retryable,
      details: this.details ?? null,
      suggestedFixes: this.suggestedFixes ? (this.suggestedFixes as unknown as JsonValue) : null
    };
  }
}

export function asMathEngineError(error: unknown, fallbackCode = "INTERNAL_ERROR"): MathEngineError {
  if (error instanceof MathEngineError) return error;
  if (error instanceof Error) {
    return new MathEngineError(fallbackCode, error.message, { cause: error, retryable: false });
  }
  return new MathEngineError(fallbackCode, String(error), { retryable: false });
}
