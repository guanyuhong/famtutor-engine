export type ExpressionNode =
  | NumberNode
  | BooleanNode
  | IdentifierNode
  | UnaryNode
  | BinaryNode
  | CallNode;

export interface NumberNode {
  type: "number";
  value: number;
  start: number;
  end: number;
}

export interface BooleanNode {
  type: "boolean";
  value: boolean;
  start: number;
  end: number;
}

export interface IdentifierNode {
  type: "identifier";
  name: string;
  start: number;
  end: number;
}

export interface UnaryNode {
  type: "unary";
  operator: "+" | "-" | "!";
  argument: ExpressionNode;
  start: number;
  end: number;
}

export interface BinaryNode {
  type: "binary";
  operator: "+" | "-" | "*" | "/" | "^" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "&&" | "||";
  left: ExpressionNode;
  right: ExpressionNode;
  start: number;
  end: number;
}

export interface CallNode {
  type: "call";
  callee: string;
  arguments: ExpressionNode[];
  start: number;
  end: number;
}
