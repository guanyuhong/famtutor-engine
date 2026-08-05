import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMathDocument, validateMathDocument } from "../dist/index.js";

function rootDocument(bracket) {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "function-root-test",
    revision: 1,
    seed: 1501,
    metadata: { title: "Function root", locale: "en", purpose: "authoring" },
    entities: [
      { id: "f", type: "function1", role: "derived" },
      { id: "root", type: "point2", role: "derived", label: "R" }
    ],
    construction: [
      { id: "op-f", command: "function.explicit", params: { expression: "x^2-2", domain: [-3, 3] }, outputs: ["f"] },
      { id: "op-root", command: "point.function_root", inputs: [{ ref: "f" }], params: { bracket }, outputs: ["root"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-3, 4, 3, -2], axes: true }]
  };
}

test("point.function_root deterministically finds a bracketed zero", () => {
  const document = rootDocument([1, 2]);
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  const root = evaluateMathDocument(document).entities.get("root")?.value;
  assert.equal(root.kind, "point2");
  assert.ok(Math.abs(root.x - Math.sqrt(2)) < 1e-8);
  assert.equal(root.y, 0);
});

test("point.function_root fails when the bracket does not isolate a crossing", () => {
  const evaluation = evaluateMathDocument(rootDocument([-2, 2]));
  assert.equal(evaluation.entities.get("root")?.defined, false);
  assert.equal(evaluation.issues.some(issue => issue.code === "FUNCTION_ROOT_NOT_BRACKETED"), true);
});
