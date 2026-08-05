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

test("later style bindings patch earlier bindings for the same entity", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "ordered-style-patches",
    revision: 1,
    seed: 17,
    metadata: { title: "Ordered style patches", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "A", type: "point2", role: "free" },
      { id: "B", type: "point2", role: "free" },
      { id: "AB", type: "segment2", role: "derived", label: "AB" }
    ],
    construction: [
      { id: "op-a", command: "point.free", outputs: ["A"], params: { coords: [0, 0] } },
      { id: "op-b", command: "point.free", outputs: ["B"], params: { coords: [3, 0] } },
      { id: "op-ab", command: "segment.through_points", inputs: [{ ref: "A" }, { ref: "B" }], outputs: ["AB"] }
    ],
    styles: [
      { targets: ["AB"], style: { stroke: "#123456", strokeWidth: 2 } },
      { targets: ["AB"], style: { strokeWidth: 4, labelVisible: false } }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, boundingBox: [-1, 1, 4, -1], axes: false, grid: false }],
    activities: [],
    provenance: { generator: "test", sourceRefs: [] }
  };
  const result = renderDirectSvg(document, { width: 400, height: 180 });
  assert.match(result.svg, /stroke="#123456"/);
  assert.match(result.svg, /stroke-width="4"/);
  assert.doesNotMatch(result.svg, />AB<\/text>/);
});

test("interval.from_bounds preserves open, closed, infinite and empty-set semantics", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "interval-semantics",
    revision: 1,
    seed: 31,
    metadata: { title: "Intervals", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "a", type: "scalar", role: "free" },
      { id: "leftRay", type: "interval1", role: "derived" },
      { id: "bounded", type: "interval1", role: "derived" },
      { id: "empty", type: "interval1", role: "derived" }
    ],
    construction: [
      { id: "op-a", command: "scalar.slider", outputs: ["a"], params: { min: -5, max: 5, value: 2 } },
      { id: "op-left", command: "interval.from_bounds", outputs: ["leftRay"], params: { upper: "a", upperClosed: false, y: 1 } },
      { id: "op-bounded", command: "interval.from_bounds", outputs: ["bounded"], params: { lower: -1, upper: "a", lowerClosed: true, upperClosed: true, y: 0 } },
      { id: "op-empty", command: "interval.from_bounds", outputs: ["empty"], params: { lower: 3, upper: 3, lowerClosed: true, upperClosed: false, y: -1 } }
    ],
    styles: [{ targets: ["leftRay", "bounded", "empty"], style: { stroke: "#d06a3a", fill: "#d06a3a", pointSize: 5 } }],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-6, 2, 6, -2], axes: false, grid: false, background: "#faf8f2" }]
  };
  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const evaluation = evaluateMathDocument(document);
  assert.deepEqual(evaluation.entities.get("leftRay")?.value, {
    kind: "interval1", lower: null, upper: 2, lowerClosed: false, upperClosed: false, y: 1, empty: false
  });
  assert.deepEqual(evaluation.entities.get("bounded")?.value, {
    kind: "interval1", lower: -1, upper: 2, lowerClosed: true, upperClosed: true, y: 0, empty: false
  });
  assert.equal(evaluation.entities.get("empty")?.value?.empty, true);
  const rendered = renderDirectSvg(document, { width: 720, height: 260 });
  assert.equal(rendered.report.skippedEntities.length, 0);
  assert.match(rendered.svg, /marker-start="url\(#fme-arrow\)"/);
  assert.match(rendered.svg, /data-interval-endpoint="upper"/);
  assert.match(rendered.svg, />∅<\/text>/);
  assert.match(rendered.svg, /fill="#faf8f2"/);
});

test("right-angle marker evaluates and Direct SVG renders angle labels", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "marker-and-label",
    revision: 1,
    seed: 9,
    metadata: { title: "Marker and label", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "A", type: "point2", role: "free" },
      { id: "B", type: "point2", role: "free", label: "B" },
      { id: "C", type: "point2", role: "free" },
      { id: "AB", type: "segment2", role: "derived", label: "AB" },
      { id: "triangle", type: "polygon2", role: "derived", label: "△ABC" },
      { id: "right", type: "polygon2", role: "annotation" },
      { id: "angle", type: "angle", role: "measurement", label: "90°" }
    ],
    construction: [
      { id: "op-A", command: "point.free", params: { coords: [1, 0] }, outputs: ["A"] },
      { id: "op-B", command: "point.free", params: { coords: [0, 0] }, outputs: ["B"] },
      { id: "op-C", command: "point.free", params: { coords: [0, 1] }, outputs: ["C"] },
      { id: "op-AB", command: "segment.through_points", inputs: [{ ref: "A" }, { ref: "B" }], outputs: ["AB"] },
      { id: "op-triangle", command: "polygon.vertices", inputs: [{ ref: "A" }, { ref: "B" }, { ref: "C" }], outputs: ["triangle"] },
      { id: "op-angle", command: "angle.three_points", inputs: [{ ref: "A" }, { ref: "B" }, { ref: "C" }], params: { radius: 0.5, labelRadius: 0.9 }, outputs: ["angle"] },
      { id: "op-right", command: "marker.right_angle", inputs: [{ ref: "angle" }], params: { size: 0.25 }, outputs: ["right"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-1, 2, 2, -1], background: "#fffde8" }],
    styles: [{ targets: ["AB"], style: { lineLabelPosition: 0.5, lineLabelSide: "right", lineLabelDistance: 1.8 } }]
  };
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  const evaluation = evaluateMathDocument(document);
  assert.equal(evaluation.issues.length, 0, JSON.stringify(evaluation.issues));
  assert.equal(evaluation.entities.get("right")?.value?.kind, "polygon2");
  const rendered = renderDirectSvg(document, { width: 480, height: 360 });
  assert.match(rendered.svg, /data-entity-id="right"/);
  assert.match(rendered.svg, /data-label-for="angle"/);
  assert.match(rendered.svg, /fill="#fffde8"/);
  assert.match(rendered.svg, /data-label-for="B" data-label-placement="top-left"/);
  assert.match(rendered.svg, /data-label-for="AB" data-label-kind="path" data-label-position="0.5" data-label-side="right"/);
  assert.match(rendered.svg, /data-label-for="triangle" data-label-kind="polygon"/);
  assert.match(rendered.svg, />90°<\/text>/);
});

test("point labels prefer the exterior of a polygon near a viewport edge", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "polygon-exterior-labels",
    revision: 1,
    seed: 109,
    metadata: { title: "Polygon exterior labels", locale: "en", purpose: "assessment" },
    entities: [
      { id: "A", type: "point2", role: "free", label: "A" },
      { id: "B", type: "point2", role: "free", label: "B" },
      { id: "C", type: "point2", role: "free", label: "C" },
      { id: "triangle", type: "polygon2", role: "derived", label: "△ABC" }
    ],
    construction: [
      { id: "op-A", command: "point.free", params: { coords: [0, 5] }, outputs: ["A"] },
      { id: "op-B", command: "point.free", params: { coords: [-4, 0] }, outputs: ["B"] },
      { id: "op-C", command: "point.free", params: { coords: [4, 0] }, outputs: ["C"] },
      { id: "op-triangle", command: "polygon.vertices", inputs: [{ ref: "A" }, { ref: "B" }, { ref: "C" }], outputs: ["triangle"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-5, 6, 5, -3], axes: false, grid: false, keepAspectRatio: true }]
  };
  const rendered = renderDirectSvg(document, { width: 720, height: 480 });
  assert.match(rendered.svg, /data-label-for="A" data-label-placement="top-right"/);
  assert.match(rendered.svg, /data-label-for="B" data-label-placement="top-left"/);
  assert.match(rendered.svg, /data-label-for="C" data-label-placement="top-right"/);
});

test("segment equality tick is a renderer-independent geometry atom", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "segment-equality-tick",
    revision: 1,
    seed: 114,
    metadata: { title: "Segment equality tick", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "A", type: "point2", role: "free" },
      { id: "B", type: "point2", role: "free" },
      { id: "AB", type: "segment2", role: "derived" },
      { id: "tick", type: "segment2", role: "annotation" }
    ],
    construction: [
      { id: "op-A", command: "point.free", params: { coords: [0, 0] }, outputs: ["A"] },
      { id: "op-B", command: "point.free", params: { coords: [4, 0] }, outputs: ["B"] },
      { id: "op-AB", command: "segment.through_points", inputs: [{ ref: "A" }, { ref: "B" }], outputs: ["AB"] },
      { id: "op-tick", command: "marker.segment_tick", inputs: [{ ref: "AB" }], params: { size: 0.6 }, outputs: ["tick"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-1, 2, 5, -2], axes: false, grid: false, keepAspectRatio: true }]
  };
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  const evaluation = evaluateMathDocument(document);
  assert.deepEqual(evaluation.entities.get("tick")?.value, {
    kind: "segment2",
    from: { kind: "point2", x: 2, y: -0.3 },
    to: { kind: "point2", x: 2, y: 0.3 }
  });
  assert.match(renderDirectSvg(document).svg, /data-entity-id="tick"/);
});

test("parallel chevron is atomic, endpoint-order independent, and statically rendered", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "parallel-chevron",
    revision: 1,
    seed: 116,
    metadata: { title: "Parallel chevron", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "A", type: "point2", role: "free" },
      { id: "B", type: "point2", role: "free" },
      { id: "M", type: "point2", role: "derived" },
      { id: "BA", type: "segment2", role: "derived" },
      { id: "arm1", type: "segment2", role: "annotation" },
      { id: "arm2", type: "segment2", role: "annotation" }
    ],
    construction: [
      { id: "op-A", command: "point.free", params: { coords: [0, 0] }, outputs: ["A"] },
      { id: "op-B", command: "point.free", params: { coords: [4, 0] }, outputs: ["B"] },
      { id: "op-M", command: "point.midpoint", inputs: [{ ref: "A" }, { ref: "B" }], outputs: ["M"] },
      { id: "op-BA", command: "segment.through_points", inputs: [{ ref: "B" }, { ref: "A" }], outputs: ["BA"] },
      { id: "op-marker", command: "marker.parallel_chevron", inputs: [{ ref: "M" }, { ref: "BA" }], params: { size: 0.8 }, outputs: ["arm1", "arm2"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-1, 2, 5, -2], axes: false, grid: false, keepAspectRatio: true }]
  };
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  const evaluation = evaluateMathDocument(document);
  assert.deepEqual(evaluation.entities.get("arm1")?.value, {
    kind: "segment2",
    from: { kind: "point2", x: 1.6, y: 0.4 },
    to: { kind: "point2", x: 2.4, y: 0 }
  });
  assert.deepEqual(evaluation.entities.get("arm2")?.value, {
    kind: "segment2",
    from: { kind: "point2", x: 1.6, y: -0.4 },
    to: { kind: "point2", x: 2.4, y: 0 }
  });
  const svg = renderDirectSvg(document).svg;
  assert.match(svg, /data-entity-id="arm1"/);
  assert.match(svg, /data-entity-id="arm2"/);
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

test("vector.scale drives a reusable translation from a slider expression", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "slider-vector-scale",
    revision: 1,
    seed: 217,
    metadata: { title: "Slider vector scale", locale: "en", purpose: "exploration" },
    entities: [
      { id: "t", type: "scalar", role: "free" },
      { id: "B", type: "point2", role: "free" },
      { id: "C", type: "point2", role: "free" },
      { id: "P", type: "point2", role: "free" },
      { id: "BCVector", type: "vector2", role: "derived" },
      { id: "motionVector", type: "vector2", role: "derived" },
      { id: "moveTransform", type: "transform2", role: "derived" },
      { id: "movedP", type: "point2", role: "derived" }
    ],
    construction: [
      { id: "op-t", command: "scalar.slider", params: { min: 0, max: 2, value: 0 }, outputs: ["t"] },
      { id: "op-B", command: "point.free", params: { coords: [0, 0] }, outputs: ["B"] },
      { id: "op-C", command: "point.free", params: { coords: [6, 0] }, outputs: ["C"] },
      { id: "op-P", command: "point.free", params: { coords: [1, 2] }, outputs: ["P"] },
      { id: "op-BC", command: "vector.between_points", inputs: [{ ref: "B" }, { ref: "C" }], outputs: ["BCVector"] },
      { id: "op-scale", command: "vector.scale", inputs: [{ ref: "BCVector" }], params: { factor: "max(t - 1, 0)" }, outputs: ["motionVector"] },
      { id: "op-translate", command: "transform.translate", inputs: [{ ref: "motionVector" }], outputs: ["moveTransform"] },
      { id: "op-apply", command: "transform.apply", inputs: [{ ref: "P" }, { ref: "moveTransform" }], outputs: ["movedP"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-1, 3, 8, -1] }],
    interactions: [{ target: "t", permissions: ["set_value"] }]
  };

  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const initial = evaluateMathDocument(document);
  assert.deepEqual(initial.entities.get("motionVector")?.value, { kind: "vector2", x: 0, y: 0 });
  assert.deepEqual(initial.entities.get("movedP")?.value, { kind: "point2", x: 1, y: 2 });

  const simulation = simulateMathDocument(document, {
    type: "set_value",
    target: "t",
    value: 2,
    samples: 3
  }, {
    observe: ["entity:motionVector", "entity:movedP"],
    timestampBase: 2000
  });
  const final = Object.fromEntries(simulation.frames.at(-1).observations.map(item => [item.key, item.value]));
  assert.deepEqual(final["entity:motionVector"], { kind: "vector2", x: 6, y: 0 });
  assert.deepEqual(final["entity:movedP"], { kind: "point2", x: 7, y: 2 });
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
