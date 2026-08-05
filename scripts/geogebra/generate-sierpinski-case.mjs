import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMacroExpansion, expandMacro } from "../../packages/math/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputFile = path.join(root, "research/geogebra/cases/04-sierpinski-imported-macro/case.json");

const document = {
  schema: "famtutor.math.document.v1",
  documentId: "geogebra-sierpinski-imported-macro",
  revision: 1,
  seed: 4404,
  metadata: {
    title: "Sierpiński Triangle 的嵌套 Macro",
    description: "将 GeoGebra Tri Custom Tool 降级为中点与多边形原子，并以三层嵌套 Macro 构造分形。",
    locale: "zh-CN",
    purpose: "exploration",
    subject: "mathematics",
    tags: ["geogebra-study", "custom-tool", "macro-dag", "sierpinski"]
  },
  entities: [
    { id: "A", type: "point2", label: "A", role: "free" },
    { id: "B", type: "point2", label: "B", role: "free" },
    { id: "C", type: "point2", label: "C", role: "free" },
    { id: "outer", type: "polygon2", role: "derived" }
  ],
  construction: [
    { id: "make-A", command: "point.free", params: { coords: [0, 5.4] }, outputs: ["A"] },
    { id: "make-B", command: "point.free", params: { coords: [-6.2, -4.2] }, outputs: ["B"] },
    { id: "make-C", command: "point.free", params: { coords: [6.2, -4.2] }, outputs: ["C"] },
    { id: "make-outer", command: "polygon.vertices", inputs: [{ ref: "A" }, { ref: "B" }, { ref: "C" }], outputs: ["outer"] }
  ],
  views: [{
    id: "main", kind: "graphics2d", visible: true, renderer: "jsxgraph-svg",
    boundingBox: [-7.4, 6.4, 7.4, -5.2], axes: false, grid: false, keepAspectRatio: true,
    background: "#FAF8F2", cameraPolicy: "document"
  }],
  styles: [],
  interactions: [
    { target: "A", permissions: ["drag"] },
    { target: "B", permissions: ["drag"] },
    { target: "C", permissions: ["drag"] }
  ]
};

const holesByLevel = [[], [], []];
function subdivide(A, B, C, remaining, level, pathId) {
  const outputs = {
    D: `${pathId}_D`,
    E: `${pathId}_E`,
    F: `${pathId}_F`,
    medial: `${pathId}_hole`
  };
  const expansion = expandMacro(document, {
    macro: "macro.polygon.medial_subdivision",
    inputs: { A, B, C },
    outputs,
    idPrefix: pathId
  });
  applyMacroExpansion(document, expansion);
  holesByLevel[level].push(outputs.medial);
  if (remaining <= 1) return;
  subdivide(A, outputs.F, outputs.E, remaining - 1, level + 1, `${pathId}a`);
  subdivide(outputs.F, B, outputs.D, remaining - 1, level + 1, `${pathId}b`);
  subdivide(outputs.E, outputs.D, C, remaining - 1, level + 1, `${pathId}c`);
}

subdivide("A", "B", "C", 3, 0, "tri");

for (const entity of document.entities) {
  if (entity.type === "point2" && !["A", "B", "C"].includes(entity.id)) entity.visible = false;
  if (entity.type === "polygon2" && entity.id !== "outer") entity.label = undefined;
}
const holes = holesByLevel.flat();
document.styles = [
  { targets: ["outer"], style: { stroke: "#553B8B", strokeWidth: 2.2, fill: "#8B71C5", fillOpacity: 0.82, labelVisible: false } },
  { targets: holes, style: { stroke: "#FAF8F2", strokeWidth: 1.2, fill: "#FAF8F2", fillOpacity: 1, labelVisible: false } },
  { targets: ["A", "B", "C"], style: { stroke: "#15365F", fill: "#15365F", pointSize: 4.5, fontSize: 12, labelPlacement: "auto" } }
];
document.activities = [{
  id: "macro-depth",
  title: "观察 Macro 的逐层展开",
  stages: [
    { id: "level-1", narration: "Tri(A,B,C) 只由三个中点和一个中点三角形组成；白色中点三角形是第一层孔洞。", hide: [...holesByLevel[1], ...holesByLevel[2]] },
    { id: "level-2", narration: "把同一个 Tri Macro 应用于三个角三角形，得到第二层的 3 个孔洞。", hide: [...holesByLevel[2]] },
    { id: "level-3", narration: "第三层共有 9 个新孔洞；整个图形是 13 次相同 Macro 的确定性组合。" }
  ]
}];
document.provenance = {
  createdAt: "2026-08-04T00:00:00.000Z",
  generator: "agent",
  sourceRefs: ["geogebra:wEkG5mAm", "macro:macro.polygon.medial_subdivision"],
  notes: "GeoGebra Tri uses Polygon + three Midpoint + Polygon. The imported 工具2 DAG contains 12 Tri calls and lowers exactly to existing L0 commands."
};

const caseDocument = {
  schema: "famtutor.case.v1",
  caseId: "research-geogebra-04-sierpinski-imported-macro",
  title: "Sierpiński Triangle：Imported Macro DAG",
  status: "accepted",
  caseType: "exploration",
  difficulty: "mechanism-reference",
  source: {
    printedPages: [], pdfPages: [], references: ["https://www.geogebra.org/m/wEkG5mAm"],
    note: "Mechanism study; original FamTutor rendering generated from the parsed Custom Tool semantics."
  },
  requiredCapabilities: ["macro.polygon.medial_subdivision", "imported-macro-dag"],
  inputs: { initialDocument: document },
  trace: { changeSets: [] },
  expected: {
    assertions: [{ kind: "static-render" }, { kind: "mounted-render" }, { kind: "render-bundle" }],
    interactions: [{ target: "A", permission: "drag" }, { target: "B", permission: "drag" }, { target: "C", permission: "drag" }]
  }
};

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(caseDocument, null, 2)}\n`);
console.log(outputFile);
