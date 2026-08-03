import { MathEngineError } from "../errors.js";
import type { BinaryNode, CallNode, ExpressionNode, UnaryNode } from "./ast.js";
import { tokenizeExpression, type Token } from "./tokenizer.js";

const PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "^": 7
};

const RIGHT_ASSOCIATIVE = new Set(["^"]);

class Parser {
  readonly #source: string;
  readonly #tokens: Token[];
  #index = 0;

  constructor(source: string) {
    this.#source = source;
    this.#tokens = tokenizeExpression(source);
  }

  parse(): ExpressionNode {
    const expression = this.parseBinary(0);
    const token = this.peek();
    if (token.type !== "eof") {
      throw this.error(token, `Unexpected token '${token.value}'.`);
    }
    return expression;
  }

  private peek(offset = 0): Token {
    return this.#tokens[Math.min(this.#tokens.length - 1, this.#index + offset)]!;
  }

  private consume(): Token {
    const token = this.peek();
    this.#index += 1;
    return token;
  }

  private error(token: Token, message: string): MathEngineError {
    return new MathEngineError("EXPRESSION_PARSE_ERROR", message, {
      path: `expression[${token.start}]`,
      actual: this.#source.slice(token.start, Math.min(this.#source.length, token.end + 8))
    });
  }

  private parseBinary(minPrecedence: number): ExpressionNode {
    let left = this.parseUnary();

    while (true) {
      const token = this.peek();
      if (token.type !== "operator") break;
      const precedence = PRECEDENCE[token.value];
      if (precedence === undefined || precedence < minPrecedence) break;
      this.consume();
      const nextMinimum = RIGHT_ASSOCIATIVE.has(token.value) ? precedence : precedence + 1;
      const right = this.parseBinary(nextMinimum);
      left = {
        type: "binary",
        operator: token.value as BinaryNode["operator"],
        left,
        right,
        start: left.start,
        end: right.end
      };
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();
    if (token.type === "operator" && (token.value === "+" || token.value === "-" || token.value === "!")) {
      this.consume();
      const argument = this.parseUnary();
      return {
        type: "unary",
        operator: token.value as UnaryNode["operator"],
        argument,
        start: token.start,
        end: argument.end
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.consume();
    if (token.type === "number") {
      return { type: "number", value: Number(token.value), start: token.start, end: token.end };
    }
    if (token.type === "identifier") {
      const lowered = token.value.toLowerCase();
      if (lowered === "true" || lowered === "false") {
        return { type: "boolean", value: lowered === "true", start: token.start, end: token.end };
      }
      if (this.peek().type === "leftParen") {
        this.consume();
        const args: ExpressionNode[] = [];
        if (this.peek().type !== "rightParen") {
          while (true) {
            args.push(this.parseBinary(0));
            if (this.peek().type === "comma") {
              this.consume();
              continue;
            }
            break;
          }
        }
        const closing = this.consume();
        if (closing.type !== "rightParen") {
          throw this.error(closing, "Expected ')'.");
        }
        const node: CallNode = {
          type: "call",
          callee: token.value,
          arguments: args,
          start: token.start,
          end: closing.end
        };
        return node;
      }
      return { type: "identifier", name: token.value, start: token.start, end: token.end };
    }
    if (token.type === "leftParen") {
      const expression = this.parseBinary(0);
      const closing = this.consume();
      if (closing.type !== "rightParen") throw this.error(closing, "Expected ')'.");
      return { ...expression, start: token.start, end: closing.end };
    }
    throw this.error(token, "Expected a number, identifier, function call, or parenthesized expression.");
  }
}

const parseCache = new Map<string, ExpressionNode>();
const CACHE_LIMIT = 512;

export function parseExpression(source: string): ExpressionNode {
  const normalized = source.trim();
  if (!normalized) {
    throw new MathEngineError("EXPRESSION_EMPTY", "Expression must not be empty.", { path: "expression" });
  }
  const cached = parseCache.get(normalized);
  if (cached) return cached;
  const parsed = new Parser(normalized).parse();
  if (parseCache.size >= CACHE_LIMIT) parseCache.delete(parseCache.keys().next().value as string);
  parseCache.set(normalized, parsed);
  return parsed;
}

export function collectExpressionIdentifiers(node: ExpressionNode): Set<string> {
  const output = new Set<string>();
  const visit = (current: ExpressionNode): void => {
    if (current.type === "identifier") {
      output.add(current.name);
      return;
    }
    if (current.type === "unary") {
      visit(current.argument);
      return;
    }
    if (current.type === "binary") {
      visit(current.left);
      visit(current.right);
      return;
    }
    if (current.type === "call") current.arguments.forEach(visit);
  };
  visit(node);
  return output;
}
