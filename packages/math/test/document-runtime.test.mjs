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

test("conditional feedback follows slider-driven expressions", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "conditional-feedback",
    revision: 1,
    seed: 104,
    metadata: { title: "Conditional feedback", locale: "zh-CN", purpose: "exploration" },
    entities: [
      { id: "sideA", type: "scalar", role: "free" },
      { id: "sideB", type: "scalar", role: "free" },
      { id: "sideC", type: "scalar", role: "free" },
      { id: "startA", type: "point2", role: "free" },
      { id: "endA", type: "point2", role: "derived" },
      { id: "segmentA", type: "segment2", role: "derived" },
      { id: "canFormTriangle", type: "boolean", role: "derived" },
      { id: "feedback", type: "text", role: "annotation" }
    ],
    construction: [
      { id: "op-sideA", command: "scalar.slider", params: { min: 1, max: 10, value: 3, step: 1, position: [-5, 5] }, outputs: ["sideA"] },
      { id: "op-sideB", command: "scalar.slider", params: { min: 1, max: 10, value: 4, step: 1, position: [-5, 4] }, outputs: ["sideB"] },
      { id: "op-sideC", command: "scalar.slider", params: { min: 1, max: 10, value: 5, step: 1, position: [-5, 3] }, outputs: ["sideC"] },
      { id: "op-startA", command: "point.free", params: { coords: [-5, 1.5] }, outputs: ["startA"] },
      { id: "op-endA", command: "point.from_expressions", params: { x: "-5 + sideA", y: 1.5 }, outputs: ["endA"] },
      { id: "op-segmentA", command: "segment.through_points", inputs: [{ ref: "startA" }, { ref: "endA" }], outputs: ["segmentA"] },
      {
        id: "op-can-form-triangle",
        command: "boolean.expression",
        params: { expression: "(sideA + sideB > sideC) && (sideA + sideC > sideB) && (sideB + sideC > sideA)" },
        outputs: ["canFormTriangle"]
      },
      {
        id: "op-feedback",
        command: "text.conditional",
        inputs: [{ ref: "canFormTriangle" }],
        params: { trueText: "可以组成三角形", falseText: "不能组成三角形", at: [-5, -3] },
        outputs: ["feedback"]
      }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-6, 6, 7, -4] }],
    interactions: [{ target: "sideA", permissions: ["set_value"] }]
  };

  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));

  const initial = evaluateMathDocument(document);
  assert.equal(initial.entities.get("canFormTriangle")?.value, true);
  assert.equal(initial.entities.get("feedback")?.value?.text, "可以组成三角形");
  assert.deepEqual(initial.entities.get("endA")?.value, { kind: "point2", x: -2, y: 1.5 });

  const simulation = simulateMathDocument(document, {
    type: "set_value",
    target: "sideA",
    value: 10,
    samples: 3
  }, {
    observe: ["entity:endA", "entity:canFormTriangle", "entity:feedback"],
    timestampBase: 1000
  });
  const finalObservations = Object.fromEntries(simulation.frames.at(-1).observations.map(item => [item.key, item.value]));
  assert.deepEqual(finalObservations["entity:endA"], { kind: "point2", x: 5, y: 1.5 });
  assert.equal(finalObservations["entity:canFormTriangle"], false);
  assert.equal(finalObservations["entity:feedback"].text, "不能组成三角形");

  const validSvg = renderDirectSvg(document).svg;
  const invalidSvg = renderDirectSvg(document, { overrides: { scalars: { sideA: 10 } } }).svg;
  assert.match(validSvg, /可以组成三角形/);
  assert.match(invalidSvg, /不能组成三角形/);
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
