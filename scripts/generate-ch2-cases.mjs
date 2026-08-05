import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalizeJson } from "../packages/core/dist/index.js";
import { MathDomainRuntime } from "../packages/math/dist/index.js";

const ROOT = new URL("..", import.meta.url).pathname;
const CASES_ROOT = join(ROOT, "corpus/books/zjedu-math-8a-2013/cases");
const PDF_SHA = "d0888daf868964e0b04a7b22f09b24fa24b001becf7c3a617c5f799f1fa078f2";
const CASES = [];
const CASE_BOUNDS = {
  36: [-8, 4.5, 8, -4.5],
  37: [-6, 5, 6, -5],
  38: [-6, 5, 7, -5]
};

const ref = id => ({ ref: id });

function builder() {
  const operations = [];
  const ids = [];
  const points = [];
  const add = (command, outputs, inputs = [], params, extra = {}) => {
    const descriptors = outputs.map(value => typeof value === "string" ? { id: value } : value);
    for (const descriptor of descriptors) {
      ids.push(descriptor.id);
      if (command.startsWith("point.") || (command === "transform.apply" && descriptor.type === "point2")) points.push(descriptor.id);
    }
    const operation = { op: "construct", command, outputs: descriptors, ...extra };
    if (inputs.length) operation.inputs = inputs.map(ref);
    if (params !== undefined) operation.params = params;
    operations.push(operation);
    return descriptors.map(value => value.id);
  };
  const p = (id, x, y, options = {}) => add("point.free", [{ id, label: options.label ?? id, visible: options.visible }], [], { coords: [x, y] }, options.role ? { role: options.role } : {})[0];
  const seg = (id, a, b, label) => add("segment.through_points", [{ id, label }], [a, b])[0];
  const line = (id, a, b, label) => add("line.through_points", [{ id, label }], [a, b])[0];
  const polygon = (id, vertices, label) => add("polygon.vertices", [{ id, label }], vertices)[0];
  const circle = (id, center, radius, label) => add("circle.center_radius", [{ id, label }], [center], { radius })[0];
  const projection = (id, point, path, label = id, visible = true) => add("point.projection", [{ id, label, visible }], [point, path])[0];
  const intersection = (id, a, b, label = id) => add("point.intersection_line_line", [{ id, label }], [a, b])[0];
  const reflect = (id, axis) => add("transform.reflect", [{ id, type: "transform2", visible: false }], [axis])[0];
  const applyPoint = (id, source, transform, label = id, visible = true) => add("transform.apply", [{ id, type: "point2", label, visible }], [source, transform])[0];
  const tick = (id, segment, size = 0.3, position) => add("marker.segment_tick", [id], [segment], position === undefined ? { size } : { size, position })[0];
  const angle = (id, a, o, b, label = "", radius = 0.45) => add("angle.three_points", [{ id, label }], [a, o, b], { radius, labelRadius: radius + 0.36 })[0];
  const right = (id, angleId, size = 0.28) => add("marker.right_angle", [id], [angleId], { size })[0];
  const style = (targets, value) => operations.push({ op: "set_style", targets, style: value });
  const assertion = (id, predicate, refs, message, tolerance = 1e-7) => operations.push({
    op: "add_assertion",
    assertion: { id, predicate, arguments: refs.map(ref), tolerance, message, requiredMethod: "numeric" }
  });
  const finish = () => {
    if (points.length) style(points, { pointSize: 5, fontSize: 15, labelPlacement: "auto" });
    return { operations, ids };
  };
  return { add, p, seg, line, polygon, circle, projection, intersection, reflect, applyPoint, tick, angle, right, style, assertion, finish };
}

function register(meta, build) {
  const b = builder();
  const result = build(b);
  const built = b.finish();
  CASES.push({ ...meta, ...result, operations: built.operations, entityIds: built.ids });
}

function standardStyles(b, primary = [], auxiliary = [], annotations = []) {
  if (primary.length) b.style(primary, { stroke: "#15365F", strokeWidth: 2.3 });
  if (auxiliary.length) b.style(auxiliary, { stroke: "#2E6DB2", strokeWidth: 1.7, dash: "dashed", opacity: 0.75 });
  if (annotations.length) b.style(annotations, { stroke: "#0E8378", fill: "#DCEFE7", strokeWidth: 1.7, fillOpacity: 0.14 });
}

register({
  number: 36,
  slug: "symmetry-axes",
  title: "比较长方形、正方形和圆的对称轴",
  section: "2.1 图形的轴对称",
  pages: [48],
  figures: ["2-1", "2-2", "2-3"],
  knowledge: ["axial-symmetry", "axis-of-symmetry"],
  objective: "通过长方形、正方形和圆比较轴对称图形的对称轴数量，并理解对称轴必须使两侧折叠重合。",
  type: "demonstration",
  difficulty: "introductory"
}, b => {
  // Rectangle centred at (-5, 0).
  b.p("R1", -7, -1.2, { visible: false }); b.p("R2", -3, -1.2, { visible: false });
  b.p("R3", -3, 1.2, { visible: false }); b.p("R4", -7, 1.2, { visible: false });
  const rectangle = b.polygon("rectangle", ["R1", "R2", "R3", "R4"], "长方形");
  b.p("RV1", -5, -3, { visible: false }); b.p("RV2", -5, 3, { visible: false });
  b.p("RH1", -7.5, 0, { visible: false }); b.p("RH2", -2.5, 0, { visible: false });
  const rectVertical = b.seg("rectVertical", "RV1", "RV2");
  const rectHorizontal = b.seg("rectHorizontal", "RH1", "RH2");

  // Square centred at the origin.
  b.p("S1", -1.5, -1.5, { visible: false }); b.p("S2", 1.5, -1.5, { visible: false });
  b.p("S3", 1.5, 1.5, { visible: false }); b.p("S4", -1.5, 1.5, { visible: false });
  const square = b.polygon("square", ["S1", "S2", "S3", "S4"], "正方形");
  b.p("SV1", 0, -3, { visible: false }); b.p("SV2", 0, 3, { visible: false });
  b.p("SH1", -2.5, 0, { visible: false }); b.p("SH2", 2.5, 0, { visible: false });
  b.p("SD11", -2.4, -2.4, { visible: false }); b.p("SD12", 2.4, 2.4, { visible: false });
  b.p("SD21", -2.4, 2.4, { visible: false }); b.p("SD22", 2.4, -2.4, { visible: false });
  const squareVertical = b.seg("squareVertical", "SV1", "SV2");
  const squareHorizontal = b.seg("squareHorizontal", "SH1", "SH2");
  const squareDiagonal1 = b.seg("squareDiagonal1", "SD11", "SD12");
  const squareDiagonal2 = b.seg("squareDiagonal2", "SD21", "SD22");

  // Circle centred at (5, 0), with three representative diameters.
  b.p("O", 5, 0); const circle = b.circle("circle", "O", 1.6, "圆");
  b.p("CV1", 5, -3, { visible: false }); b.p("CV2", 5, 3, { visible: false });
  b.p("CH1", 2.5, 0, { visible: false }); b.p("CH2", 7.5, 0, { visible: false });
  b.p("CD1", 3.2, -1.8, { visible: false }); b.p("CD2", 6.8, 1.8, { visible: false });
  const circleVertical = b.seg("circleVertical", "CV1", "CV2");
  const circleHorizontal = b.seg("circleHorizontal", "CH1", "CH2");
  const circleDiagonal = b.seg("circleDiagonal", "CD1", "CD2");

  b.assertion("rectangle-axes-perpendicular", "perpendicular", [rectVertical, rectHorizontal], "长方形的两条对称轴互相垂直。");
  b.assertion("square-diagonals-perpendicular", "perpendicular", [squareDiagonal1, squareDiagonal2], "正方形的两条对角线互相垂直。");
  standardStyles(b, [rectangle, square, circle], [rectVertical, rectHorizontal, squareVertical, squareHorizontal, squareDiagonal1, squareDiagonal2, circleVertical, circleHorizontal, circleDiagonal]);
  b.style([rectangle, square, circle], { stroke: "#15365F", fill: "#DCEFE7", fillOpacity: 0.18, strokeWidth: 2.3, fontSize: 15, labelVisible: false });
  return {
    capabilities: ["polygon.vertices", "circle.center_radius", "line.through_points", "assertion.perpendicular", "activity.stages"],
    stages: [
      { id: "rectangle", narration: "图 2-1：长方形沿水平或竖直中线折叠都能重合，因此有两条对称轴。", reveal: [rectangle, rectVertical, rectHorizontal] },
      { id: "square", narration: "图 2-2：正方形除两条中线外，两条对角线所在直线也是对称轴，共四条。", reveal: [rectangle, rectVertical, rectHorizontal, square, squareVertical, squareHorizontal, squareDiagonal1, squareDiagonal2] },
      { id: "circle", narration: "图 2-3：圆的任意一条直径所在直线都是对称轴；图中只画出三条代表，实际有无数条。", reveal: [rectangle, rectVertical, rectHorizontal, square, squareVertical, squareHorizontal, squareDiagonal1, squareDiagonal2, "O", circle, circleVertical, circleHorizontal, circleDiagonal], focus: [circleVertical, circleHorizontal, circleDiagonal] }
    ]
  };
});

register({
  number: 37,
  slug: "reflect-triangle-across-line",
  title: "作三角形关于直线的轴对称图形",
  section: "2.1 图形的轴对称",
  pages: [49],
  figures: ["2-6", "2-7"],
  knowledge: ["axial-symmetry", "reflect-point-line", "congruent-figures"],
  objective: "按教材步骤过每个顶点作对称轴的垂线，并在另一侧截取等距点，得到三角形的轴对称图形。",
  type: "guided-construction",
  difficulty: "intermediate"
}, b => {
  b.p("M1", 0, -4.5, { visible: false }); b.p("M2", 0, 4.5, { visible: false });
  const axis = b.line("axisM", "M1", "M2", "m");
  b.p("A", -4.2, 2.8); b.p("B", -3.1, -2.7); b.p("C", -1.1, -1.4);
  const AB = b.seg("AB", "A", "B"); const BC = b.seg("BC", "B", "C"); const CA = b.seg("CA", "C", "A");
  const source = b.polygon("triangleABC", ["A", "B", "C"], "△ABC");
  const reflectM = b.reflect("reflectM", axis);
  const A2 = b.applyPoint("A2", "A", reflectM, "A′");
  const B2 = b.applyPoint("B2", "B", reflectM, "B′");
  const C2 = b.applyPoint("C2", "C", reflectM, "C′");
  const A2B2 = b.seg("A2B2", A2, B2); const B2C2 = b.seg("B2C2", B2, C2); const C2A2 = b.seg("C2A2", C2, A2);
  const target = b.polygon("triangleA2B2C2", [A2, B2, C2], "△A′B′C′");
  const AP = b.projection("P", "A", axis, "P"); const AA2 = b.seg("AA2", "A", A2);
  const PA = b.seg("PA", AP, "A"); const PA2 = b.seg("PA2", AP, A2);
  const rightAngle = b.angle("angleAPM", "A", AP, "M2"); const rightMark = b.right("rightP", rightAngle);
  const ticks = [b.tick("tickPA", PA), b.tick("tickPA2", PA2)];
  b.assertion("a-midpoint-equal", "equal_length", [PA, PA2], "PA=PA′。");
  b.assertion("aa-perpendicular-axis", "perpendicular", [AA2, axis], "AA′⊥m。");
  b.assertion("triangles-congruent-side-1", "equal_length", [AB, A2B2], "AB=A′B′。");
  b.assertion("triangles-congruent-side-2", "equal_length", [BC, B2C2], "BC=B′C′。");
  standardStyles(b, [AB, BC, CA, source], [axis, AA2], [A2B2, B2C2, C2A2, target, rightMark, ...ticks]);
  b.style([source], { stroke: "#15365F", fill: "#DCEFE7", fillOpacity: 0.2, strokeWidth: 2.3, labelVisible: false });
  b.style([target], { stroke: "#EF6C22", fill: "#FBE6D7", fillOpacity: 0.2, strokeWidth: 2.3, labelVisible: false });
  b.style([rightAngle], { opacity: 0, labelVisible: false });
  return {
    capabilities: ["transform.reflect", "transform.apply", "point.projection", "marker.right_angle", "marker.segment_tick", "assertion.equal_length", "activity.stages"],
    stages: [
      { id: "source", narration: "图 2-6：已知 △ABC 和对称轴 m。目标是分别作出 A、B、C 的对称点。", reveal: ["A", "B", "C", AB, BC, CA, source, axis] },
      { id: "perpendicular", narration: "过 A 作 m 的垂线，垂足为 P；延长 AP 到轴的另一侧。", reveal: ["A", "B", "C", AB, BC, CA, axis, AP, AA2, rightMark] },
      { id: "equal-distance", narration: "在垂线上截取 PA′=PA；同理作出 B′、C′。对称轴垂直平分每一对对应点的连线。", reveal: ["A", "B", "C", A2, B2, C2, axis, AA2, PA, PA2, rightMark, ...ticks] },
      { id: "connect", narration: "依次连接 A′B′、B′C′、C′A′，得到与 △ABC 关于直线 m 成轴对称的 △A′B′C′。", reveal: ["A", "B", "C", A2, B2, C2, AB, BC, CA, source, A2B2, B2C2, C2A2, target, axis], focus: [target] }
    ]
  };
});

register({
  number: 38,
  slug: "reflection-shortest-path",
  title: "用轴对称确定河边饮马的最短路线",
  section: "2.1 图形的轴对称",
  pages: [50],
  figures: ["2-8"],
  knowledge: ["axial-symmetry", "shortest-path", "triangle-inequality"],
  objective: "把折线路径 AP+PB 转化为直线 A′P+PB，并用两点之间线段最短确定最优河边点。",
  type: "guided-construction",
  difficulty: "advanced"
}, b => {
  b.p("L1", -6, 0, { visible: false }); b.p("L2", 7, 0, { visible: false });
  const river = b.line("river", "L1", "L2", "l");
  b.p("A", -4.2, 3.4); b.p("B", 4.5, 2.5);
  const reflectL = b.reflect("reflectL", river);
  const A2 = b.applyPoint("A2", "A", reflectL, "A′");
  const A2B = b.line("A2BLine", A2, "B");
  const C = b.intersection("C", river, A2B);
  const AC = b.seg("AC", "A", C); const A2C = b.seg("A2C", A2, C); const CB = b.seg("CB", C, "B"); const A2BSegment = b.seg("A2BSegment", A2, "B");
  const AP = b.projection("P", "A", river, "P"); const AA2 = b.seg("AA2", "A", A2);
  const PA = b.seg("PA", AP, "A"); const PA2 = b.seg("PA2", AP, A2);
  const ticks = [b.tick("tickPA", PA), b.tick("tickPA2", PA2)];
  b.assertion("reflection-distance", "equal_length", [AC, A2C], "AC=A′C。");
  b.assertion("straight-path", "collinear", [A2, C, "B"], "A′、C、B 共线。");
  b.assertion("axis-midpoint", "equal_length", [PA, PA2], "P 是 AA′ 的中点。");
  standardStyles(b, [AC, CB], [river, AA2, A2B, A2C, A2BSegment], ticks);
  b.style([river], { lineLabelPosition: 0.88, lineLabelSide: "left", lineLabelDistance: 1.8 });
  b.style([AC, CB], { stroke: "#EF6C22", strokeWidth: 2.8 });
  b.style([A2C, A2BSegment], { stroke: "#0E8378", strokeWidth: 2.1, dash: "dashed", opacity: 0.85 });
  return {
    capabilities: ["transform.reflect", "transform.apply", "point.intersection_line_line", "marker.segment_tick", "assertion.collinear", "assertion.equal_length", "activity.stages"],
    stages: [
      { id: "problem", narration: "图 2-8：从 A 出发到河边 l 饮马，再回到 B。需要在河边选择一点，使折线总长最短。", reveal: ["A", "B", river] },
      { id: "reflect", narration: "作 A 关于河岸 l 的对称点 A′。对河岸上任一点 P，总有 AP=A′P。", reveal: ["A", A2, "P", river, AA2, PA, PA2, ...ticks] },
      { id: "straighten", narration: "于是 AP+PB 可改写为 A′P+PB。两点之间线段最短，所以当 A′、P、B 共线时取得最小值。", reveal: ["A", A2, "B", river, A2B, A2BSegment] },
      { id: "conclude", narration: "连接 A′B 与河岸交于 C。路线 A—C—B 的长度等于直线段 A′B，因此是最短路线。", reveal: ["A", A2, "B", C, river, AC, A2C, CB, A2BSegment], focus: [AC, CB] }
    ]
  };
});

function initialDocument(meta) {
  return {
    schema: "famtutor.math.document.v1",
    documentId: `ch2-${String(meta.number - 35).padStart(2, "0")}-${meta.slug}`,
    revision: 1,
    seed: 300 + meta.number,
    metadata: {
      title: meta.title,
      locale: "zh-CN",
      purpose: meta.type === "guided-construction" ? "practice" : meta.type,
      subject: "mathematics",
      grade: "grade-8",
      tags: [meta.section.slice(0, 3), ...meta.knowledge]
    },
    entities: [],
    construction: [],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "jsxgraph-svg", boundingBox: CASE_BOUNDS[meta.number], axes: false, grid: false, keepAspectRatio: true, background: "#FAF8F2", cameraPolicy: "stable_across_stages" }],
    activities: [{ id: `activity-${meta.number}`, title: meta.title, stages: meta.stages }],
    provenance: {
      generator: "agent",
      sourceRefs: meta.figures.map(figure => `zjedu-math-8a-2013:printed-${meta.pages.join("-")}:figure-${figure}`)
    }
  };
}

async function makeCase(meta) {
  const document = initialDocument(meta);
  const changeSet = {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: `zj8a-${String(meta.number).padStart(2, "0")}-build`,
    base: { domain: "math", schema: "famtutor.math.document.v1", documentId: document.documentId, revision: 1 },
    operations: meta.operations,
    metadata: { origin: "textbook-case-source-faithful", sourceFidelity: "A", mathCorrectness: "verified", visualQuality: "pending-browser-review" }
  };
  const runtime = new MathDomainRuntime();
  const applied = await runtime.apply(structuredClone(document), changeSet);
  if (!applied.ok || !applied.document) throw new Error(`${meta.number}: ${JSON.stringify(applied.diagnostics)}`);
  const fingerprint = createHash("sha256").update(canonicalizeJson(applied.document)).digest("hex");
  return {
    schema: "famtutor.case.v1",
    caseId: `zj8a-2-1-${String(meta.number).padStart(2, "0")}-${meta.slug}`,
    title: meta.title,
    description: `按教材图 ${meta.figures.join("、")} 实现的来源可追溯几何案例。`,
    source: {
      bookId: "zjedu-math-8a-2013",
      pdfName: "义务教育教科书·数学八年级上册.pdf",
      pdfSha256: PDF_SHA,
      chapter: "2 特殊三角形",
      section: meta.section,
      printedPages: meta.pages,
      pdfPages: meta.pages.map(page => page + 3),
      extractionMethod: "visual-review",
      confidence: 1,
      reviewStatus: "reviewed"
    },
    knowledgePoints: meta.knowledge,
    learningObjective: meta.objective,
    caseType: meta.type,
    difficulty: meta.difficulty,
    requiredCapabilities: [...new Set(meta.capabilities)],
    generation: { provider: "openai-codex", model: "gpt-5", promptVersion: "ch2-source-faithful-v1", seed: document.seed, attempts: 1 },
    inputs: { initialDocument: document },
    trace: { changeSets: [changeSet] },
    expected: {
      documentFingerprint: fingerprint,
      assertions: [
        { kind: "entity-exists", entityIds: meta.entityIds.slice(0, Math.min(8, meta.entityIds.length)) },
        { kind: "runtime-assertions-pass" },
        { kind: "activity-stages", minimum: Math.min(3, meta.stages.length) },
        { kind: "static-render" },
        { kind: "render-bundle" }
      ],
      interactions: []
    },
    artifacts: {},
    status: "accepted",
    diagnostics: []
  };
}

for (const meta of CASES) {
  const spec = await makeCase(meta);
  const directory = join(CASES_ROOT, `${String(meta.number).padStart(2, "0")}-${meta.slug}`);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "case.json"), `${JSON.stringify(spec, null, 2)}\n`);
}

process.stdout.write(`Generated ${CASES.length} Chapter 2 cases.\n`);
