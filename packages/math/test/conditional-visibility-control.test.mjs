import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyMathChangeSet } from "../dist/apply-changeset.js";
import { evaluateAssertions } from "../dist/kernel/assertions.js";
import { evaluateMathDocument } from "../dist/kernel/evaluate.js";
import { validateMathDocument } from "../dist/protocol/validate.js";
import { renderDirectSvg } from "../dist/render/direct-svg.js";
import { normalizeMathInteractionAction } from "../dist/render/mounted-renderer.js";

function documentWithConditionalVisibility() {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "conditional-visibility",
    revision: 1,
    seed: 7,
    metadata: { title: "Conditional visibility", locale: "en", purpose: "exploration" },
    entities: [
      { id: "showDetails", type: "boolean", role: "free" },
      { id: "A", type: "point2", role: "free", label: "A" },
      { id: "B", type: "point2", role: "free", label: "B" },
      { id: "AB", type: "segment2", role: "derived", visibleWhen: "showDetails" }
    ],
    construction: [
      { id: "makeShowDetails", command: "boolean.constant", params: { value: false }, outputs: ["showDetails"] },
      { id: "makeA", command: "point.free", params: { coords: [-2, 0] }, outputs: ["A"] },
      { id: "makeB", command: "point.free", params: { coords: [2, 0] }, outputs: ["B"] },
      { id: "makeAB", command: "segment.through_points", inputs: [{ ref: "A" }, { ref: "B" }], outputs: ["AB"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-4, 3, 4, -3] }],
    interactions: [{ target: "showDetails", permissions: ["set_value"] }],
    controls: [
      { id: "toggleDetails", kind: "checkbox", label: "Show details", action: { type: "boolean.toggle", target: "showDetails" } },
      { id: "hideDetails", kind: "button", label: "Hide", action: { type: "boolean.set", target: "showDetails", value: false } }
    ]
  };
}

test("boolean.constant drives renderer-neutral entity visibility", () => {
  const document = documentWithConditionalVisibility();
  assert.equal(validateMathDocument(document).status, "valid");
  assert.equal(evaluateMathDocument(document).entities.get("showDetails").value, false);
  assert.equal(renderDirectSvg(document, { width: 500, height: 320 }).svg.includes('data-entity-id="AB"'), false);

  const applied = applyMathChangeSet(document, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "show-details",
    base: { domain: "math", schema: document.schema, documentId: document.documentId, revision: 1 },
    operations: [{ op: "set_params", nodeId: "makeShowDetails", patch: { value: true } }]
  });
  assert.equal(applied.ok, true, JSON.stringify(applied.diagnostics));
  assert.equal(evaluateMathDocument(applied.document).entities.get("showDetails").value, true);
  assert.equal(renderDirectSvg(applied.document, { width: 500, height: 320 }).svg.includes('data-entity-id="AB"'), true);
});

test("boolean actions use the canonical mounted interaction envelope", () => {
  assert.deepEqual(normalizeMathInteractionAction({ type: "boolean.set", target: "showDetails", value: true }), {
    type: "boolean.set",
    target: "showDetails",
    payload: { value: true }
  });
});

test("visibleWhen and checkbox actions fail closed on invalid targets", () => {
  const document = documentWithConditionalVisibility();
  document.entities.find(entity => entity.id === "AB").visibleWhen = "A";
  document.controls[0].action = { type: "scalar.set", target: "showDetails", value: 1 };
  const report = validateMathDocument(document);
  assert.equal(report.status, "invalid");
  assert.equal(report.issues.some(issue => issue.code === "INVALID_VISIBILITY_CONDITION"), true);
  assert.equal(report.issues.some(issue => issue.code === "INVALID_CHECKBOX_ACTION"), true);
  assert.equal(report.issues.some(issue => issue.code === "INVALID_CONTROL_TARGET"), true);
});

test("triangle angle-sum example reveals a construction-backed proof", async () => {
  const document = JSON.parse(await readFile(
    new URL("../examples/conditional-triangle-angle-sum.json", import.meta.url),
    "utf8"
  ));
  assert.equal(validateMathDocument(document).status, "valid");
  const evidence = evaluateAssertions(document, evaluateMathDocument(document));
  assert.deepEqual(evidence.map(item => [item.assertionId, item.status, item.method]), [
    ["parallel-proof-line", "passed", "construction"],
    ["triangle-angle-sum", "passed", "numeric"]
  ]);
  const hidden = renderDirectSvg(document, { width: 900, height: 620 }).svg;
  assert.equal(hidden.includes("∠B + ∠A + ∠C"), false);

  const revealed = applyMathChangeSet(document, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "reveal-angle-sum-proof",
    base: { domain: "math", schema: document.schema, documentId: document.documentId, revision: 1 },
    operations: [{ op: "set_params", nodeId: "op-showProof", patch: { value: true } }]
  });
  assert.equal(revealed.ok, true, JSON.stringify(revealed.diagnostics));
  const visible = renderDirectSvg(revealed.document, { width: 900, height: 620 }).svg;
  assert.equal(visible.includes("∠B + ∠A + ∠C"), true);
  assert.equal(visible.includes("l ∥ BC"), true);
});
