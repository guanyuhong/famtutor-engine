import type {
  CommandInput,
  EntityRole,
  EntityType,
  InteractionPolicy,
  JsonValue,
  MathAssertion,
  StyleBinding
} from "./types.js";

/** Domain-level math operations. Session-only `undo` is not included. */
export type MathOperation =
  | MathConstructOperation
  | MathExpandMacroOperation
  | MathSetParamsOperation
  | MathSetEntityOperation
  | MathDeleteOperation
  | MathAddAssertionOperation
  | MathRemoveAssertionOperation
  | MathSetStyleOperation
  | MathSetInteractionOperation
  | MathSetViewOperation;

export interface MathConstructOperation {
  op: "construct";
  command: string;
  outputs: Array<string | {
    id: string;
    type?: EntityType;
    role?: EntityRole;
    label?: string;
    visible?: boolean;
    description?: string;
  }>;
  inputs?: CommandInput[];
  params?: Record<string, JsonValue>;
  nodeId?: string;
  description?: string;
}

export interface MathExpandMacroOperation {
  op: "expand_macro";
  macro: string;
  inputs: Record<string, string>;
  outputs?: Record<string, string>;
  idPrefix?: string;
}

export interface MathSetParamsOperation {
  op: "set_params";
  nodeId: string;
  patch: Record<string, JsonValue>;
  remove?: string[];
}

export interface MathSetEntityOperation {
  op: "set_entity";
  entityId: string;
  patch: {
    label?: string | null;
    role?: EntityRole;
    visible?: boolean;
    description?: string | null;
  };
}

export interface MathDeleteOperation {
  op: "delete";
  targets?: string[];
  target?: string;
  cascade?: boolean;
}

export interface MathAddAssertionOperation {
  op: "add_assertion";
  assertion: MathAssertion;
}

export interface MathRemoveAssertionOperation {
  op: "remove_assertion";
  assertionId: string;
}

export interface MathSetStyleOperation {
  op: "set_style";
  targets: string[];
  style: StyleBinding["style"];
}

export interface MathSetInteractionOperation {
  op: "set_interaction";
  policy: InteractionPolicy;
}

export interface MathSetViewOperation {
  op: "set_view";
  viewId: string;
  patch: Record<string, JsonValue>;
}

export const MATH_DOMAIN = "math";
export const MATH_DOCUMENT_SCHEMA = "famtutor.math.document.v1";
export const MATH_OPERATION_SCHEMA = "famtutor.math.operations.v1";
