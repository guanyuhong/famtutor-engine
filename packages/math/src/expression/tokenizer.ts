import { MathEngineError } from "../errors.js";

export type TokenType = "number" | "identifier" | "operator" | "leftParen" | "rightParen" | "comma" | "eof";

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

const TWO_CHAR_OPERATORS = new Set(["<=", ">=", "==", "!=", "&&", "||"]);
const ONE_CHAR_OPERATORS = new Set(["+", "-", "*", "/", "^", "<", ">", "!"]);

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

export function tokenizeExpression(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character ?? "")) {
      index += 1;
      continue;
    }

    if (character === "@") {
      const start = index;
      index += 1;
      if (!isIdentifierStart(source[index])) {
        throw new MathEngineError("EXPRESSION_TOKEN_ERROR", "Expected an entity identifier after '@'.", {
          path: `expression[${start}]`,
          actual: source.slice(start, Math.min(source.length, start + 8))
        });
      }
      let value = "";
      while (index < source.length && /[A-Za-z0-9_.:-]/.test(source[index] ?? "")) {
        value += source[index];
        index += 1;
      }
      tokens.push({ type: "identifier", value, start, end: index });
      continue;
    }

    if (isDigit(character) || (character === "." && isDigit(source[index + 1]))) {
      const start = index;
      let value = "";
      let hasDot = false;
      while (index < source.length) {
        const current = source[index];
        if (isDigit(current)) {
          value += current;
          index += 1;
          continue;
        }
        if (current === "." && !hasDot) {
          hasDot = true;
          value += current;
          index += 1;
          continue;
        }
        break;
      }
      if (source[index] === "e" || source[index] === "E") {
        value += source[index];
        index += 1;
        if (source[index] === "+" || source[index] === "-") {
          value += source[index];
          index += 1;
        }
        if (!isDigit(source[index])) {
          throw new MathEngineError("EXPRESSION_NUMBER_ERROR", "Malformed scientific notation.", {
            path: `expression[${start}]`,
            actual: value
          });
        }
        while (isDigit(source[index])) {
          value += source[index];
          index += 1;
        }
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new MathEngineError("EXPRESSION_NUMBER_ERROR", "Numeric literal must be finite.", {
          path: `expression[${start}]`,
          actual: value
        });
      }
      tokens.push({ type: "number", value, start, end: index });
      continue;
    }

    if (isIdentifierStart(character)) {
      const start = index;
      let value = "";
      while (isIdentifierPart(source[index])) {
        value += source[index];
        index += 1;
      }
      tokens.push({ type: "identifier", value, start, end: index });
      continue;
    }

    const twoCharacter = source.slice(index, index + 2);
    if (TWO_CHAR_OPERATORS.has(twoCharacter)) {
      tokens.push({ type: "operator", value: twoCharacter, start: index, end: index + 2 });
      index += 2;
      continue;
    }
    if (character && ONE_CHAR_OPERATORS.has(character)) {
      tokens.push({ type: "operator", value: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (character === "(") {
      tokens.push({ type: "leftParen", value: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ type: "rightParen", value: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (character === ",") {
      tokens.push({ type: "comma", value: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }

    throw new MathEngineError("EXPRESSION_TOKEN_ERROR", `Unsupported character '${character}'.`, {
      path: `expression[${index}]`,
      actual: character ?? ""
    });
  }

  tokens.push({ type: "eof", value: "", start: source.length, end: source.length });
  return tokens;
}
