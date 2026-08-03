import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  distance,
  evaluateAssertions,
  evaluateMathDocument,
  isPoint,
  simulateMathDocument
} from "../dist/index.js";

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const between = (random, min, max) => min + (max - min) * random();

test("perpendicular-bisector equality survives randomized non-degenerate configurations", async () => {
  const document = JSON.parse(await readFile(new URL("../examples/perpendicular-bisector.json", import.meta.url), "utf8"));
  const random = mulberry32(0xFAD01234);

  for (let index = 0; index < 250; index += 1) {
    let A;
    let B;
    do {
      A = [between(random, -10, 10), between(random, -10, 10)];
      B = [between(random, -10, 10), between(random, -10, 10)];
    } while (Math.hypot(A[0] - B[0], A[1] - B[1]) < 0.25);
    const candidateP = [between(random, -12, 12), between(random, -12, 12)];
    const evaluation = evaluateMathDocument(document, { points: { A, B, P: candidateP } });
    assert.equal(evaluation.issues.length, 0, JSON.stringify(evaluation.issues));
    const a = evaluation.entities.get("A")?.value;
    const b = evaluation.entities.get("B")?.value;
    const p = evaluation.entities.get("P")?.value;
    assert.ok(isPoint(a) && isPoint(b) && isPoint(p));
    const residual = Math.abs(distance(p, a) - distance(p, b));
    assert.ok(residual <= 1e-9 * Math.max(1, distance(p, a), distance(p, b)), `iteration ${index}: residual=${residual}`);
    const evidence = evaluateAssertions(document, evaluation)[0];
    assert.equal(evidence.status, "passed", JSON.stringify(evidence));
    assert.equal(evidence.method, "construction");
  }
});

test("drag simulation projects every randomized sample back onto the constrained path", async () => {
  const document = JSON.parse(await readFile(new URL("../examples/perpendicular-bisector.json", import.meta.url), "utf8"));
  const random = mulberry32(0x20260803);
  for (let trial = 0; trial < 40; trial += 1) {
    const path = Array.from({ length: 5 }, () => [between(random, -8, 8), between(random, -8, 8)]);
    const simulation = simulateMathDocument(document, {
      type: "drag",
      target: "P",
      path,
      samples: 17
    }, { observe: ["distance(P,A)-distance(P,B)", "assertion:equal-distance"], timestampBase: 0 });
    assert.equal(simulation.frames.length, 17);
    assert.equal(simulation.issues.length, 0, JSON.stringify(simulation.issues));
    for (const frame of simulation.frames) {
      const residual = frame.observations[0]?.value;
      assert.equal(typeof residual, "number");
      assert.ok(Math.abs(residual) < 1e-9, `trial=${trial} frame=${frame.index} residual=${residual}`);
      assert.equal(frame.assertions[0]?.status, "passed");
    }
  }
});
