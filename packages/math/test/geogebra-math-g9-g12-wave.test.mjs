import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMathRenderBundle, MathDomainRuntime, validateMathDocument } from "../dist/index.js";

const casePaths = [
  "../../../research/geogebra/cases/21-linear-function-properties/case.json",
  "../../../research/geogebra/cases/22-quadratic-ax2-properties/case.json",
  "../../../research/geogebra/cases/28-functions-and-function-notation/case.json",
  "../../../research/geogebra/cases/29-exponential-equation-graph-critical-values/case.json",
  "../../../research/geogebra/cases/30-graphing-quadratic-functions/case.json",
  "../../../research/geogebra/cases/31-zeros-of-quadratic-functions/case.json"
];

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function setSlider(document, id, value) {
  const node = document.construction.find(item => item.id === id);
  assert.ok(node, `missing slider ${id}`);
  node.params.value = value;
}

for (const relative of casePaths) {
  test(`GeoGebra Math 9-12 material validates, renders and bundles: ${relative}`, async () => {
    const spec = await readJson(new URL(relative, import.meta.url));
    const document = spec.inputs.initialDocument;
    assert.equal(document.construction.some(node => node.command === "function.value_at"), true);

    const validation = validateMathDocument(document);
    assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
    assert.equal(
      validation.assertionEvidence.every(item => item.status === "passed"),
      true,
      JSON.stringify(validation.assertionEvidence)
    );

    const rendered = await new MathDomainRuntime().render(document, {
      renderer: "direct-svg",
      width: 800,
      height: 560
    });
    assert.equal(rendered.ok, true, JSON.stringify(rendered.diagnostics));

    const bundle = await createMathRenderBundle(document);
    assert.equal(bundle.ok, true, JSON.stringify(bundle.diagnostics));
  });
}

const sweeps = [
  {
    relative: casePaths[2],
    samples: [["op-x0", -3], ["op-x0", -1], ["op-x0", 0], ["op-x0", 1.5], ["op-x0", 3]]
  },
  {
    relative: casePaths[3],
    samples: [
      [["op-b", 0.5], ["op-x0", -2]],
      [["op-b", 0.8], ["op-x0", 1.5]],
      [["op-b", 1], ["op-x0", 2]],
      [["op-b", 1.5], ["op-x0", -1]],
      [["op-b", 2], ["op-x0", 2]]
    ]
  },
  {
    relative: casePaths[4],
    samples: [
      [["op-a", -1.5], ["op-h", -1], ["op-k", 2], ["op-x0", -3]],
      [["op-a", -0.5], ["op-h", 2], ["op-k", -1], ["op-x0", 3]],
      [["op-a", 0], ["op-h", 0], ["op-k", 1], ["op-x0", -2]],
      [["op-a", 0.7], ["op-h", -2], ["op-k", 0], ["op-x0", 1]],
      [["op-a", 1.5], ["op-h", 1.5], ["op-k", -2], ["op-x0", 4]]
    ]
  },
  {
    relative: casePaths[5],
    samples: [
      [["op-r1", -3], ["op-r2", 3]],
      [["op-r1", -2], ["op-r2", 1]],
      [["op-r1", 0], ["op-r2", 0]],
      [["op-r1", 1], ["op-r2", 1]],
      [["op-r1", -1], ["op-r2", 2.5]]
    ]
  }
];

for (const { relative, samples } of sweeps) {
  test(`GeoGebra Math 9-12 assertions survive a parameter sweep: ${relative}`, async () => {
    const spec = await readJson(new URL(relative, import.meta.url));
    for (const sample of samples) {
      const document = structuredClone(spec.inputs.initialDocument);
      const assignments = Array.isArray(sample[0]) ? sample : [sample];
      for (const [id, value] of assignments) setSlider(document, id, value);
      const validation = validateMathDocument(document);
      assert.equal(validation.status, "valid", JSON.stringify({ assignments, issues: validation.issues }));
      assert.equal(
        validation.assertionEvidence.every(item => item.status === "passed"),
        true,
        JSON.stringify({ assignments, evidence: validation.assertionEvidence })
      );
    }
  });
}

test("GeoGebra Math 9-12 material index retains six complete Wave 01 vertical packs", async () => {
  const indexUrl = new URL("../../../research/geogebra/math-g9-12/material-index.v1.json", import.meta.url);
  const index = await readJson(indexUrl);
  assert.equal(index.materials.length, 18);

  for (const entry of index.materials.slice(0, 6)) {
    const materialUrl = new URL(entry.path, indexUrl);
    const material = await readJson(materialUrl);
    assert.equal(material.materialId, entry.materialId);
    assert.equal(material.teachingAtoms.length, 5);
    assert.equal(material.quizSeeds.length, 5);
    assert.equal(material.quizSeeds.some(item => item.id.startsWith("quiz-assessment-")), true);
    assert.equal(material.acceptance.sourceFidelity.status, "verified");

    const source = await readJson(new URL(material.sourceSnapshot, materialUrl));
    assert.equal(source.occurrence.occurrenceId, entry.occurrenceId);

    const engineCase = await readJson(new URL(material.engineCase.path, materialUrl));
    assert.equal(engineCase.caseId, material.engineCase.caseId);
    assert.equal(engineCase.inputs.initialDocument.documentId, material.engineCase.documentId);
  }
});
