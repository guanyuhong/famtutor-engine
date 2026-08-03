import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMAND_NAMES,
  evaluateMathDocument,
  renderDirectSvg,
  validateMathDocument
} from "../dist/index.js";

import { coverageDocument } from "./fixtures/coverage-document.mjs";
test("headless kernel covers every command in the v0.1 catalog", () => {
  const document = coverageDocument();
  const used = new Set(document.construction.map(node => node.command));
  assert.deepEqual([...COMMAND_NAMES].filter(name => !used.has(name)), []);
  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const evaluation = evaluateMathDocument(document);
  assert.equal(evaluation.issues.length, 0, JSON.stringify(evaluation.issues));
  assert.equal(evaluation.entities.size, document.entities.length);
  assert.ok([...evaluation.entities.values()].every(entity => entity.defined));
  const svg = renderDirectSvg(document, { width: 1000, height: 700 });
  assert.ok(svg.report.renderedEntities.length >= 20);
  assert.ok(svg.svg.includes("<path"));
  assert.ok(svg.svg.includes("<circle"));
});
