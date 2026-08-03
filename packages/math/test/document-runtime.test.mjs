import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  evaluateMathDocument,
  renderDirectSvg,
  simulateMathDocument,
  validateMathDocument
} from "../dist/index.js";

const examplesDir = new URL("../examples/", import.meta.url);

async function loadExample(name) {
  return JSON.parse(await readFile(new URL(name, examplesDir), "utf8"));
}

test("all shipped examples validate and evaluate without undefined entities", async () => {
  const names = (await readdir(examplesDir)).filter(name => name.endsWith(".json"));
  assert.ok(names.length >= 4);
  for (const name of names) {
    const document = await loadExample(name);
    const report = validateMathDocument(document);
    assert.equal(report.status, "valid", `${name}: ${JSON.stringify(report.issues)}`);
    const evaluation = evaluateMathDocument(document);
    assert.equal(evaluation.issues.length, 0, name);
    assert.equal([...evaluation.entities.values()].filter(entity => !entity.defined).length, 0, name);
  }
});

test("perpendicular-bisector assertion is construction-proved across drag simulation", async () => {
  const document = await loadExample("perpendicular-bisector.json");
  const report = validateMathDocument(document);
  assert.equal(report.assertionEvidence[0].method, "construction");
  assert.equal(report.assertionEvidence[0].status, "passed");

  const result = simulateMathDocument(document, {
    type: "drag",
    target: "P",
    path: [[0, -3.5], [0, 0.5], [0, 4]],
    samples: 21
  }, {
    observe: ["distance(P,A)", "distance(P,B)", "assertion:equal-distance"],
    timestampBase: 1000
  });
  assert.equal(result.frames.length, 21);
  assert.ok(result.frames.every(frame => frame.assertions[0]?.status === "passed"));
  for (const frame of result.frames) {
    const [left, right] = frame.observations;
    assert.ok(Math.abs(left.value - right.value) < 1e-9);
  }
  assert.equal(result.eventTrace[0].type, "object.dragStart");
  assert.equal(result.eventTrace.at(-1).type, "object.dragEnd");
});

test("direct SVG is deterministic and stage-aware", async () => {
  const document = await loadExample("perpendicular-bisector.json");
  const first = renderDirectSvg(document, { width: 880, height: 540, stageId: "observe" });
  const second = renderDirectSvg(document, { width: 880, height: 540, stageId: "observe" });
  assert.equal(first.svg, second.svg);
  assert.equal(first.report.renderHash, second.report.renderHash);
  assert.ok(first.svg.startsWith("<svg"));
  assert.ok(first.svg.includes("aria-label"));
  assert.ok(first.report.renderedEntities.includes("P"));
  assert.equal(first.report.skippedEntities.length, 0);
});

test("invalid cycles and degenerate constructions are reported, not silently rendered", () => {
  const cyclic = {
    schema: "famtutor.math.document.v1",
    documentId: "cycle",
    revision: 1,
    seed: 0,
    metadata: { title: "cycle", locale: "en", purpose: "authoring" },
    entities: [
      { id: "A", type: "point2", role: "derived" },
      { id: "B", type: "point2", role: "derived" }
    ],
    construction: [
      { id: "op-A", command: "point.midpoint", inputs: [{ ref: "B" }, { ref: "B" }], outputs: ["A"] },
      { id: "op-B", command: "point.midpoint", inputs: [{ ref: "A" }, { ref: "A" }], outputs: ["B"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-5,5,5,-5] }]
  };
  const cycleReport = validateMathDocument(cyclic);
  assert.equal(cycleReport.status, "invalid");
  assert.ok(cycleReport.issues.some(issue => issue.code === "CYCLIC_CONSTRUCTION"));

  const degenerate = {
    schema: "famtutor.math.document.v1",
    documentId: "degenerate",
    revision: 1,
    seed: 0,
    metadata: { title: "degenerate", locale: "en", purpose: "authoring" },
    entities: [
      { id: "A", type: "point2", role: "free" },
      { id: "B", type: "point2", role: "free" },
      { id: "l", type: "line2", role: "derived" }
    ],
    construction: [
      { id: "op-A", command: "point.free", params: { coords: [1,1] }, outputs: ["A"] },
      { id: "op-B", command: "point.free", params: { coords: [1,1] }, outputs: ["B"] },
      { id: "op-l", command: "line.through_points", inputs: [{ ref: "A" }, { ref: "B" }], outputs: ["l"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-5,5,5,-5] }]
  };
  const degenerateReport = validateMathDocument(degenerate);
  assert.equal(degenerateReport.status, "invalid");
  assert.ok(degenerateReport.undefinedEntities.includes("l"));
  assert.ok(degenerateReport.issues.some(issue => issue.code === "DEGENERATE_LINE"));
});
