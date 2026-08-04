import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  advanceClock,
  applyMathChangeSet,
  createMathRenderBundle,
  initialClockState,
  MathDomainRuntime,
  validateMathDocument
} from "../dist/index.js";

function baseDocument() {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "control-clock-test",
    revision: 1,
    seed: 91,
    metadata: { title: "Control clock test", locale: "en", purpose: "exploration" },
    entities: [{ id: "t", type: "scalar", label: "t", role: "free" }],
    construction: [{ id: "op-t", command: "scalar.slider", params: { min: 0, max: 2, value: 0, step: 0.25 }, outputs: ["t"] }],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-1, 1, 3, -1] }]
  };
}

test("deterministic clock reaches its endpoint in logical steps", () => {
  const clock = { id: "motion", target: "t", start: 0, end: 1, step: 0.25, intervalMs: 40, loop: "none" };
  let state = { ...initialClockState(clock), status: "running" };
  const values = [];
  for (let index = 0; index < 4; index += 1) {
    const next = advanceClock(clock, state);
    state = next.state;
    values.push(state.value);
  }
  assert.deepEqual(values, [0.25, 0.5, 0.75, 1]);
  assert.equal(state.status, "completed");
  assert.equal(state.tick, 4);
});

test("alternate clock reflects overflow without wall-time input", () => {
  const clock = { id: "motion", target: "t", start: 0, end: 1, step: 0.4, intervalMs: 40, loop: "alternate" };
  let state = { ...initialClockState(clock), status: "running" };
  const values = [];
  for (let index = 0; index < 5; index += 1) {
    state = advanceClock(clock, state).state;
    values.push(state.value);
  }
  assert.deepEqual(values, [0.4, 0.8, 0.8, 0.4, 0]);
  assert.equal(state.direction, 1);
});

test("set_clock and set_control publish reusable document assets", () => {
  const document = baseDocument();
  const result = applyMathChangeSet(document, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "add-control-clock",
    base: { domain: "math", schema: document.schema, documentId: document.documentId, revision: 1 },
    operations: [
      { op: "set_clock", clock: { id: "motion", target: "t", start: 0, end: 2, step: 0.1, intervalMs: 30, loop: "none", resetValue: 0 } },
      { op: "set_control", control: { id: "play", kind: "button", label: "Play", action: { type: "clock.play", target: "motion" } } },
      { op: "set_control", control: { id: "preset", kind: "button", label: "Preset", action: { type: "scalar.set", target: "t", value: 1.5 } } }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.document.clocks[0].id, "motion");
  assert.deepEqual(result.document.controls.map(control => control.id), ["play", "preset"]);
  assert.equal(validateMathDocument(result.document).status, "valid");
  assert.equal(document.clocks, undefined);
});

test("validation rejects clocks on non-slider scalars and dangling control actions", () => {
  const document = baseDocument();
  document.clocks = [{ id: "bad", target: "missing", start: 0, end: 1, step: 0.1, intervalMs: 10 }];
  document.controls = [{ id: "play", kind: "button", label: "Play", action: { type: "clock.play", target: "missing-clock" } }];
  const report = validateMathDocument(document);
  assert.equal(report.status, "invalid");
  assert.equal(report.issues.some(issue => issue.code === "INVALID_CLOCK_TARGET"), true);
  assert.equal(report.issues.some(issue => issue.code === "INVALID_CLOCK_INTERVAL"), true);
  assert.equal(report.issues.some(issue => issue.code === "INVALID_CONTROL_CLOCK"), true);
});

test("validation keeps clock ranges and scalar presets inside slider bounds", () => {
  const document = baseDocument();
  document.clocks = [{ id: "motion", target: "t", start: -1, end: 3, step: 0.25, intervalMs: 40 }];
  document.controls = [{ id: "preset", kind: "button", label: "Preset", action: { type: "scalar.set", target: "t", value: 3 } }];
  const report = validateMathDocument(document);
  assert.equal(report.status, "invalid");
  assert.equal(report.issues.some(issue => issue.code === "CLOCK_OUTSIDE_SLIDER_RANGE"), true);
  assert.equal(report.issues.some(issue => issue.code === "CONTROL_VALUE_OUTSIDE_SLIDER_RANGE"), true);
});

test("Chinese remainder mechanism case validates, renders and bundles", async () => {
  const caseSpec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/01-chinese-remainder-controls/case.json", import.meta.url), "utf8"));
  const document = caseSpec.inputs.initialDocument;
  assert.equal(validateMathDocument(document).status, "valid");
  const rendered = await new MathDomainRuntime().render(document, { renderer: "direct-svg", width: 720, height: 480 });
  assert.equal(rendered.ok, true, JSON.stringify(rendered.diagnostics));
  const bundle = await createMathRenderBundle(document);
  assert.equal(bundle.ok, true, JSON.stringify(bundle.diagnostics));
});
