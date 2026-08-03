import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentMathRuntime,
  expandMacro,
  evaluateMathDocument,
  validateMathDocument,
  repairSuggestionsForCode
} from "../dist/index.js";

function skeleton() {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "macro-demo",
    revision: 1,
    seed: 1,
    metadata: { title: "Macro demo", locale: "zh-CN", purpose: "authoring" },
    entities: [
      { id: "A", type: "point2", role: "free", label: "A" },
      { id: "B", type: "point2", role: "free", label: "B" },
      { id: "C", type: "point2", role: "free", label: "C" }
    ],
    construction: [
      { id: "op-A", command: "point.free", params: { coords: [-2, 0] }, outputs: ["A"] },
      { id: "op-B", command: "point.free", params: { coords: [2, 0] }, outputs: ["B"] },
      { id: "op-C", command: "point.free", params: { coords: [0.5, 3] }, outputs: ["C"] }
    ],
    views: [{
      id: "main",
      kind: "graphics2d",
      visible: true,
      renderer: "direct-svg",
      boundingBox: [-6, 6, 6, -4],
      axes: true,
      grid: false,
      keepAspectRatio: true
    }]
  };
}

test("expandMacro lowers perpendicular bisector to L0 and evaluates", () => {
  const document = skeleton();
  const expansion = expandMacro(document, {
    macro: "macro.line.perpendicular_bisector",
    inputs: { A: "A", B: "B" },
    outputs: { M: "M", AB: "AB", bisector: "bisector" }
  });
  assert.equal(expansion.construction.length, 3);
  assert.deepEqual(expansion.outputs, { M: "M", AB: "AB", bisector: "bisector" });
  document.entities.push(...expansion.entities);
  document.construction.push(...expansion.construction);
  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const evaluation = evaluateMathDocument(document);
  assert.equal(evaluation.issues.length, 0, JSON.stringify(evaluation.issues));
  assert.ok(evaluation.entities.get("bisector")?.defined);
});

test("math_apply expand_macro commits centroid through Agent runtime", async () => {
  const runtime = new AgentMathRuntime();
  const created = await runtime.callTool("math_create", { document: skeleton() });
  assert.equal(created.ok, true);
  const applied = await runtime.callTool("math_apply", {
    documentId: "macro-demo",
    expectedRevision: 1,
    operations: [{
      op: "expand_macro",
      macro: "macro.point.triangle_centroid",
      inputs: { A: "A", B: "B", C: "C" },
      outputs: { G: "G" }
    }]
  });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.ok(Array.isArray(applied.macroExpansions));
  assert.equal(applied.revision, 2);
  const inspect = await runtime.callTool("math_inspect", { documentId: "macro-demo", entityIds: ["G"], includeValues: true });
  assert.equal(inspect.ok, true);
});

test("repair diagnostics suggest cascade delete and revision retry", () => {
  const deleteFixes = repairSuggestionsForCode("DELETE_HAS_DEPENDENTS", {
    path: "$",
    message: "deps",
    actual: ["op-x"]
  });
  assert.ok(deleteFixes.some(fix => fix.operation?.op === "delete"));
  const revisionFixes = repairSuggestionsForCode("REVISION_CONFLICT", {
    path: "$",
    message: "conflict",
    expected: 1,
    actual: 2
  });
  assert.ok(revisionFixes.length >= 1);
});

test("failed apply returns suggestedFixes payload", async () => {
  const runtime = new AgentMathRuntime();
  await runtime.callTool("math_create", { document: skeleton() });
  const failed = await runtime.callTool("math_apply", {
    documentId: "macro-demo",
    expectedRevision: 99,
    operations: [{ op: "construct", command: "point.free", outputs: ["Z"], params: { coords: [0, 0] } }]
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "REVISION_CONFLICT");
  assert.ok(Array.isArray(failed.error.suggestedFixes));
  assert.ok(failed.error.suggestedFixes.length >= 1);
});
