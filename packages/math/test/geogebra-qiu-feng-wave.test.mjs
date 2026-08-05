import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMathRenderBundle, MathDomainRuntime, validateMathDocument } from "../dist/index.js";
import { evaluateMathDocument } from "../dist/kernel/evaluate.js";

const cases = [
  "../../../research/geogebra/cases/05-ssa-ambiguity/case.json",
  "../../../research/geogebra/cases/06-apollonius-ratio-circle/case.json",
  "../../../research/geogebra/cases/07-triangle-exterior-angle/case.json",
  "../../../research/geogebra/cases/08-one-line-three-equal-angles/case.json",
  "../../../research/geogebra/cases/09-equilateral-hand-in-hand/case.json",
  "../../../research/geogebra/cases/10-square-hand-in-hand-rotation/case.json",
  "../../../research/geogebra/cases/11-isosceles-hand-in-hand-rotation/case.json",
  "../../../research/geogebra/cases/12-internal-angle-bisector-theorem/case.json",
  "../../../research/geogebra/cases/13-external-angle-bisector-theorem/case.json",
  "../../../research/geogebra/cases/14-bisector-altitude-angle-relation/case.json",
  "../../../research/geogebra/cases/15-sss-rigid-congruence/case.json",
  "../../../research/geogebra/cases/16-sas-rigid-congruence/case.json",
  "../../../research/geogebra/cases/17-asa-rigid-congruence/case.json",
  "../../../research/geogebra/cases/18-aas-rigid-congruence/case.json",
  "../../../research/geogebra/cases/19-perpendicular-bisector-locus/case.json",
  "../../../research/geogebra/cases/20-isosceles-triangle-properties/case.json",
  "../../../research/geogebra/cases/21-linear-function-properties/case.json",
  "../../../research/geogebra/cases/22-quadratic-ax2-properties/case.json",
  "../../../research/geogebra/cases/23-reflection-shortest-path/case.json",
  "../../../research/geogebra/cases/24-pythagorean-area-proof/case.json",
  "../../../research/geogebra/cases/25-n-gon-diagonals/case.json",
  "../../../research/geogebra/cases/26-rigid-transform-properties/case.json",
  "../../../research/geogebra/cases/27-triangle-definition-boundary/case.json"
];

for (const relative of cases) {
  test(`Qiu Feng wave case validates, renders and bundles: ${relative}`, async () => {
    const spec = JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
    const document = spec.inputs.initialDocument;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
    const rendered = await new MathDomainRuntime().render(document, { renderer: "direct-svg", width: 800, height: 560 });
    assert.equal(rendered.ok, true, JSON.stringify(rendered.diagnostics));
    const bundle = await createMathRenderBundle(document);
    assert.equal(bundle.ok, true, JSON.stringify(bundle.diagnostics));
  });
}

test("bisector-altitude invariant survives multiple safe path positions", async () => {
  const relative = "../../../research/geogebra/cases/14-bisector-altitude-angle-relation/case.json";
  const spec = JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
  const base = spec.inputs.initialDocument;
  const initial = validateMathDocument(base);
  assert.equal(initial.status, "valid", JSON.stringify(initial.issues));
  const evaluation = evaluateMathDocument(base);
  const A = evaluation.entities.get("A")?.value;
  const S = evaluation.entities.get("S")?.value;
  assert.equal(A.kind, "point2");
  assert.equal(S.kind, "point2");

  for (const t of [0, 0.2, 0.45, 0.7, 1]) {
    const document = structuredClone(base);
    document.construction.find(node => node.id === "op-P").params.initial = [
      A.x + (S.x - A.x) * t,
      A.y + (S.y - A.y) * t
    ];
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `t=${t}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, `t=${t}: ${JSON.stringify(validation.assertionEvidence)}`);
  }
});

const rotationCases = [
  {
    relative: "../../../research/geogebra/cases/10-square-hand-in-hand-rotation/case.json",
    samples: [0.4, 0.75, 1.15, 1.55, 1.95, 2.3]
  },
  {
    relative: "../../../research/geogebra/cases/11-isosceles-hand-in-hand-rotation/case.json",
    samples: [1.3, 1.7, 2.1, 2.5, 3.0, 3.6]
  }
];

for (const { relative, samples } of rotationCases) {
  test(`parameterized rotation invariants survive an angle sweep: ${relative}`, async () => {
    const spec = JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
    for (const value of samples) {
      const document = structuredClone(spec.inputs.initialDocument);
      document.construction.find(node => node.id === "op-theta").params.value = value;
      const validation = validateMathDocument(document);
      assert.equal(validation.status, "valid", `theta=${value}: ${JSON.stringify(validation.issues)}`);
      assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, `theta=${value}: ${JSON.stringify(validation.assertionEvidence)}`);
    }
  });
}

for (const relative of [
  "../../../research/geogebra/cases/15-sss-rigid-congruence/case.json",
  "../../../research/geogebra/cases/16-sas-rigid-congruence/case.json",
  "../../../research/geogebra/cases/17-asa-rigid-congruence/case.json",
  "../../../research/geogebra/cases/18-aas-rigid-congruence/case.json"
]) {
  test(`congruence criterion survives a rigid-motion sweep: ${relative}`, async () => {
    const spec = JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
    for (const theta of [-0.5, -0.15, 0.2, 0.55, 0.85]) {
      const document = structuredClone(spec.inputs.initialDocument);
      document.construction.find(node => node.id === "op-theta").params.value = theta;
      const validation = validateMathDocument(document);
      assert.equal(validation.status, "valid", `theta=${theta}: ${JSON.stringify(validation.issues)}`);
      assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, `theta=${theta}: ${JSON.stringify(validation.assertionEvidence)}`);
    }
  });
}

test("perpendicular-bisector locus remains equidistant along the line", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/19-perpendicular-bisector-locus/case.json", import.meta.url), "utf8"));
  for (const y of [-2, -0.8, 0.6, 2.1, 3.6]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "op-P").params.initial = [0, y];
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `y=${y}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, `y=${y}: ${JSON.stringify(validation.assertionEvidence)}`);
  }
});

test("isosceles properties survive a height sweep", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/20-isosceles-triangle-properties/case.json", import.meta.url), "utf8"));
  for (const h of [1.8, 2.3, 3, 3.7, 4.3]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "op-h").params.value = h;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `h=${h}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, `h=${h}: ${JSON.stringify(validation.assertionEvidence)}`);
  }
});

test("linear-function samples remain on y=kx+b across signs and intercepts", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/21-linear-function-properties/case.json", import.meta.url), "utf8"));
  for (const [k, b, x0] of [[-2, -1, -2.5], [-0.6, 2, 1.5], [0, -1.5, 3], [0.8, 0, -3], [2.1, 1.2, 1.7]]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "op-k").params.value = k;
    document.construction.find(node => node.id === "op-b").params.value = b;
    document.construction.find(node => node.id === "op-x0").params.value = x0;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `k=${k},b=${b}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
  }
});

test("quadratic y=ax^2 preserves symmetry including the a=0 boundary", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/22-quadratic-ax2-properties/case.json", import.meta.url), "utf8"));
  for (const [a, t] of [[-2.2, 0.6], [-0.7, 2], [0, 1.4], [0.5, 2.3], [2, 1.1]]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "op-a").params.value = a;
    document.construction.find(node => node.id === "op-t").params.value = t;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `a=${a},t=${t}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
  }
});

test("reflection path never beats the straightened optimum", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/23-reflection-shortest-path/case.json", import.meta.url), "utf8"));
  for (const p of [-5, -2.4, -0.8, 1.7, 5]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "p").params.value = p;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `p=${p}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
  }
});

test("Pythagorean area identity survives side-length sweeps", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/24-pythagorean-area-proof/case.json", import.meta.url), "utf8"));
  for (const [a, b] of [[2, 2], [2.4, 3.7], [3, 4], [3.8, 2.2], [4, 4]]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "a").params.value = a;
    document.construction.find(node => node.id === "b").params.value = b;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `a=${a},b=${b}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
  }
});

test("n-gon diagonal collections match both counting formulas", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/25-n-gon-diagonals/case.json", import.meta.url), "utf8"));
  for (const n of [3, 4, 5, 7, 10]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "n").params.value = n;
    const evaluation = evaluateMathDocument(document);
    assert.equal(evaluation.issues.length, 0, `n=${n}: ${JSON.stringify(evaluation.issues)}`);
    assert.equal(evaluation.entities.get("fan").value.items.length, n - 3);
    assert.equal(evaluation.entities.get("all").value.items.length, n * (n - 3) / 2);
  }
});

test("translation, reflection and rotation preserve side lengths", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/26-rigid-transform-properties/case.json", import.meta.url), "utf8"));
  for (const theta of [0.35, 0.7, 1.35, 2, 2.6]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "theta").params.value = theta;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `theta=${theta}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
  }
});

test("triangle definition keeps the collinear boundary explicit", async () => {
  const spec = JSON.parse(await readFile(new URL("../../../research/geogebra/cases/27-triangle-definition-boundary/case.json", import.meta.url), "utf8"));
  for (const h of [0, 0.1, 1.2, 2.8, 4]) {
    const document = structuredClone(spec.inputs.initialDocument);
    document.construction.find(node => node.id === "h").params.value = h;
    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", `h=${h}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
    const evaluation = evaluateMathDocument(document);
    assert.equal(evaluation.entities.get("valid").value, h > 0);
    assert.equal(evaluation.entities.get("degenerate").value, h === 0);
  }
});
