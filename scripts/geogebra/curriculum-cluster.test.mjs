import assert from "node:assert/strict";
import test from "node:test";
import { buildCurriculumClusters, classifyGeometryFamilies, mechanismsForBrief } from "./curriculum-cluster.mjs";

function brief({ id, title, curriculum, commands = {}, controls = {}, visibility = [], animations = [], tags = [], gaps = [], unknown = [] }) {
  return {
    source: { profileMaterialId: id, sourceUrl: `https://www.geogebra.org/m/${id}`, title, ggbSha256: id.padEnd(64, "0") },
    curriculum,
    evidence: {
      visibleText: { strings: [{ text: title }] },
      structure: {
        elements: { total: 8 }, commands: { total: Object.values(commands).reduce((a, b) => a + b, 0), byName: commands },
        controls, conditionalVisibility: visibility, animations, macros: [], scriptApiCalls: [], capabilityTags: tags
      }
    },
    capabilityAssessment: {
      exactCommandOccurrences: Object.values(commands).reduce((a, b) => a + b, 0),
      gapCommandOccurrences: gaps.reduce((sum, item) => sum + item.count, 0),
      unknownCommandOccurrences: unknown.reduce((sum, item) => sum + item.count, 0), gaps, unknown
    }
  };
}

test("family classification separates primary circle and triangle topics", () => {
  assert.deepEqual(classifyGeometryFamilies("【九上-29圆】01弓形面积最小"), ["circle"]);
  assert.deepEqual(classifyGeometryFamilies("【14全等三角形-定理模型】01边边边全等判定定理"), ["triangle"]);
});

test("mechanisms come from controls, visibility and structure rather than title", () => {
  const source = brief({
    id: "abc", title: "三角形内角和", curriculum: { chapter: 13, kind: "theorem-model" },
    commands: { Rotate: 2, Sequence: 1 }, controls: { sliders: [{}], checkboxes: [{}], buttons: [] },
    visibility: [{}], animations: [{}], tags: ["simulation"]
  });
  assert.deepEqual(mechanismsForBrief(source), [
    "animation", "checkbox-control", "conditional-visibility", "sequence", "simulation", "slider-control", "transform"
  ]);
});

test("cluster catalog is deterministic and preserves boundary candidates", () => {
  const triangle = brief({
    id: "tri", title: "【13三角形-定理模型】01三角形的定义", curriculum: { category: "13三角形-定理模型", chapter: 13, kind: "theorem-model" },
    commands: { Polygon: 1 }, controls: { checkboxes: [{}] }, visibility: [{}]
  });
  const circle = brief({
    id: "cir", title: "【九上-29圆】01弓形面积最小", curriculum: { category: "九上-29圆", grade: 9, term: "上", chapter: 29, kind: "exercise" },
    commands: { Circle: 1, Locus: 1 }, gaps: [{ command: "Locus", count: 1, requiredCapability: "locus_trace" }]
  });
  const catalog = buildCurriculumClusters([triangle, circle], { triangleLimit: 1, circleLimit: 1 });
  assert.equal(catalog.summary.materials, 2);
  assert.equal(catalog.summary.triangleMaterials, 1);
  assert.equal(catalog.summary.circleMaterials, 1);
  assert.equal(catalog.firstWave.find(item => item.materialId === "cir").representationRole, "boundary");
  assert.equal(catalog.firstWave.find(item => item.materialId === "cir").capabilityState, "blocked-capability");
  assert.equal(catalog.clusters.some(item => item.family === "triangle" && item.mechanism === "conditional-visibility"), true);
});
