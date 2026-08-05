import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMathDocument, validateMathDocument } from "../dist/index.js";

function documentAt(x) {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "function-value-at-test",
    revision: 1,
    seed: 1201,
    metadata: { title: "Function value", locale: "en", purpose: "authoring" },
    entities: [
      { id: "a", type: "scalar", role: "free" },
      { id: "x0", type: "scalar", role: "free" },
      { id: "f", type: "function1", role: "derived" },
      { id: "y0", type: "scalar", role: "derived" }
    ],
    construction: [
      { id: "op-a", command: "scalar.constant", params: { value: 2 }, outputs: ["a"] },
      { id: "op-x0", command: "scalar.constant", params: { value: x }, outputs: ["x0"] },
      { id: "op-f", command: "function.explicit", params: { expression: "a*x^2-1", domain: [-3, 3] }, outputs: ["f"] },
      { id: "op-y0", command: "function.value_at", inputs: [{ ref: "f" }, { ref: "x0" }], outputs: ["y0"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-4, 8, 4, -3], axes: true }]
  };
}

test("function.value_at evaluates the function entity with captured dependencies", () => {
  const document = documentAt(1.5);
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  const evaluation = evaluateMathDocument(document);
  assert.equal(evaluation.entities.get("y0")?.value, 3.5);
});

test("function.value_at reports an input outside the declared domain", () => {
  const evaluation = evaluateMathDocument(documentAt(4));
  assert.equal(evaluation.entities.get("y0")?.defined, false);
  assert.equal(evaluation.issues.some(issue => issue.code === "FUNCTION_INPUT_OUTSIDE_DOMAIN"), true);
});
