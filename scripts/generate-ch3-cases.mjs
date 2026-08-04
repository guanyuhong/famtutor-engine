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
  39: [-3, 3.5, 63, -3.5],
  40: [-6, 3.6, 6, -3.6],
  41: [-2, 3.5, 24, -3.5]
};

const ref = id => ({ ref: id });
const value = item => ({ value: item });

function builder() {
  const operations = [];
  const ids = [];
  const points = [];
  const add = (command, outputs, inputs = [], params, extra = {}) => {
    const descriptors = outputs.map(item => typeof item === "string" ? { id: item } : item);
    for (const descriptor of descriptors) {
      ids.push(descriptor.id);
      if (command.startsWith("point.")) points.push(descriptor.id);
    }
    const operation = { op: "construct", command, outputs: descriptors, ...extra };
    if (inputs.length) operation.inputs = inputs.map(item => typeof item === "string" ? ref(item) : item);
    if (params !== undefined) operation.params = params;
    operations.push(operation);
    return descriptors.map(item => item.id);
  };
  const p = (id, x, y, options = {}) => add("point.free", [{ id, label: options.label, visible: options.visible }], [], { coords: [x, y] }, options.role ? { role: options.role } : {})[0];
  const expressionPoint = (id, x, y, label = id) => add("point.from_expressions", [{ id, label }], [], { x, y })[0];
  const seg = (id, a, b) => add("segment.through_points", [id], [a, b])[0];
  const ray = (id, a, b) => add("ray.from_points", [id], [a, b])[0];
  const slider = (id, min, max, initial, position, length, step = 1, label = id) => add("scalar.slider", [{ id, label }], [], { min, max, value: initial, position, length, step })[0];
  const constant = (id, constantValue) => add("scalar.constant", [id], [], { value: constantValue })[0];
  const interval = (id, params, label) => add("interval.from_bounds", [{ id, label }], [], params)[0];
  const bool = (id, expression) => add("boolean.expression", [id], [], { expression })[0];
  const textAt = (id, text, at) => add("text.at", [id], [], { text, at })[0];
  const conditionalText = (id, condition, anchor, trueText, falseText) => add("text.conditional", [id], [condition, anchor], { trueText, falseText })[0];
  const style = (targets, authored) => operations.push({ op: "set_style", targets, style: authored });
  const assertion = (id, predicate, arguments_, message, extra = {}) => operations.push({
    op: "add_assertion",
    assertion: { id, predicate, arguments: arguments_, tolerance: 1e-7, message, requiredMethod: "numeric", ...extra }
  });
  const interaction = (target, permissions) => operations.push({ op: "set_interaction", policy: { target, permissions } });
  const finish = () => {
    if (points.length) style(points, { pointSize: 4.8, fontSize: 14, labelPlacement: "auto" });
    return { operations, ids };
  };
  return { add, p, expressionPoint, seg, ray, slider, constant, interval, bool, textAt, conditionalText, style, assertion, interaction, finish };
}

function addNumberLine(b, prefix, y, min, max, ticks) {
  const start = b.p(`${prefix}Start`, min, y, { visible: false });
  const through = b.p(`${prefix}Through`, max, y, { visible: false });
  const axis = b.ray(`${prefix}Axis`, start, through);
  const tickEntities = [];
  for (const tick of ticks) {
    const low = b.p(`${prefix}Tick${String(tick).replace("-", "m")}Low`, tick, y - 0.12, { visible: false });
    const high = b.p(`${prefix}Tick${String(tick).replace("-", "m")}High`, tick, y + 0.12, { visible: false });
    tickEntities.push(b.seg(`${prefix}Tick${String(tick).replace("-", "m")}`, low, high));
    tickEntities.push(b.textAt(`${prefix}Label${String(tick).replace("-", "m")}`, String(tick), [tick - 0.22, y - 0.55]));
  }
  b.style([axis, ...tickEntities], { stroke: "#6F7F8C", fill: "#6F7F8C", strokeWidth: 1.5, fontSize: 13, labelVisible: false });
  return [axis, ...tickEntities];
}

function register(meta, build) {
  const b = builder();
  const result = build(b);
  const built = b.finish();
  CASES.push({ ...meta, ...result, operations: built.operations, entityIds: built.ids });
}

register({
  number: 39,
  slug: "speed-limit-inequality",
  title: "把限速要求写成不等式",
  section: "3.1 认识不等式",
  pages: [90, 91],
  figures: ["3-1", "3-4"],
  knowledge: ["inequality-meaning", "inequality-number-line", "closed-endpoint"],
  objective: "理解“速度不得超过 40 km/h”应表示为 v≤40，并用数轴与动态取值验证不等式是否成立。",
  type: "exploration",
  difficulty: "introductory"
}, b => {
  const axis = addNumberLine(b, "speed", 0, 0, 60, [0, 20, 40, 60]);
  const allowed = b.interval("allowedSpeed", { lower: 0, upper: 40, lowerClosed: true, upperClosed: true, y: 0.2 });
  const speed = b.slider("v", 0, 60, 35, [7, -2.25], 42, 1, "v（km/h）");
  const current = b.expressionPoint("currentSpeed", "v", 0.2, "v");
  const satisfies = b.bool("withinLimit", "v <= 40");
  const anchor = b.p("feedbackAnchor", 2, 2.4, { visible: false });
  const feedbackOk = b.conditionalText("feedbackOk", satisfies, anchor, "满足限速：v ≤ 40", "​");
  const feedbackNo = b.conditionalText("feedbackNo", satisfies, anchor, "​", "超过限速：v > 40");
  b.assertion("initial-speed-in-range", "value_in_range", [ref(speed), value(0), value(40)], "初始速度 35 km/h 满足限速要求。", { requiredMethod: "numeric" });
  b.interaction(speed, ["set_value"]);
  b.style([allowed], { stroke: "#D06A3A", fill: "#D06A3A", strokeWidth: 3, pointSize: 5.2, labelVisible: false });
  b.style([current], { stroke: "#155A73", fill: "#155A73", pointSize: 6, fontSize: 14, labelPlacement: "top" });
  b.style([feedbackOk], { token: "success", fontSize: 15 });
  b.style([feedbackNo], { token: "danger", fontSize: 15 });
  return {
    capabilities: ["interval.from_bounds", "scalar.slider", "point.from_expressions", "boolean.expression", "text.conditional", "assertion.value_in_range", "activity.stages"],
    interactions: [{ target: speed, permission: "set_value" }],
    stages: [
      { id: "meaning", narration: "图 3-1：限速 40 表示速度可以小于 40，也可以正好等于 40，所以应写成 v≤40。", reveal: [...axis, allowed] },
      { id: "test-value", narration: "调整速度 v。蓝点表示当前速度；它落在橙色闭区间内时满足限速要求。", reveal: [...axis, allowed, speed, current, satisfies, feedbackOk, feedbackNo], focus: [current, feedbackOk, feedbackNo] }
    ]
  };
});

register({
  number: 40,
  slug: "number-line-open-closed-intervals",
  title: "用空心、实心端点表示不等式",
  section: "3.1 认识不等式",
  pages: [91],
  figures: ["3-4", "3-5", "3-6"],
  knowledge: ["inequality-number-line", "open-endpoint", "closed-endpoint", "bounded-interval"],
  objective: "区分严格不等式与含等号不等式在数轴上的端点语义，并认识单侧和双侧区间。",
  type: "demonstration",
  difficulty: "introductory"
}, b => {
  const bValue = b.constant("bValue", -3);
  const aValue = b.constant("aValue", 2);
  const topAxis = addNumberLine(b, "top", 2.1, -5, 5, [-3, 0, 2]);
  const middleAxis = addNumberLine(b, "middle", 0, -5, 5, [-3, 0, 2]);
  const bottomAxis = addNumberLine(b, "bottom", -2.1, -5, 5, [-3, 0, 2]);
  const lessThan = b.interval("lessThanA", { upper: "aValue", upperClosed: false, y: 2.28 });
  const greaterEqual = b.interval("greaterEqualA", { lower: "aValue", lowerClosed: true, y: 0.18 });
  const between = b.interval("betweenBA", { lower: "bValue", upper: "aValue", lowerClosed: false, upperClosed: false, y: -1.92 });
  const topText = b.textAt("lessText", "x < a（a=2，不包含端点）", [-5.5, 3.0]);
  const middleText = b.textAt("greaterText", "x ≥ a（a=2，包含端点）", [-5.5, 0.9]);
  const bottomText = b.textAt("betweenText", "b < x < a（b=-3，a=2）", [-5.5, -1.2]);
  b.style([lessThan, greaterEqual, between], { stroke: "#D06A3A", fill: "#D06A3A", strokeWidth: 3, pointSize: 5.2, labelVisible: false });
  b.style([topText, middleText, bottomText], { stroke: "#155A73", fontSize: 14 });
  b.assertion("zero-between-b-and-a", "value_in_range", [value(0), ref(bValue), ref(aValue)], "0 位于 b=-3 与 a=2 之间。", { requiredMethod: "numeric" });
  return {
    capabilities: ["interval.from_bounds", "ray.from_points", "segment.through_points", "text.at", "activity.stages"],
    interactions: [],
    stages: [
      { id: "strict", narration: "图 3-4：x<a 不包含 a；在 a=2 处画空心端点，解集向左无限延伸。", reveal: [...topAxis, lessThan, topText], focus: [lessThan] },
      { id: "inclusive", narration: "图 3-5：x≥a 包含 a；在 a=2 处画实心端点，解集向右无限延伸。", reveal: [...topAxis, lessThan, topText, ...middleAxis, greaterEqual, middleText], focus: [greaterEqual] },
      { id: "bounded", narration: "图 3-6：b<x<a 同时排除 b、a 两个端点，只保留两者之间的点。", reveal: [...topAxis, lessThan, topText, ...middleAxis, greaterEqual, middleText, ...bottomAxis, between, bottomText], focus: [between] }
    ]
  };
});

register({
  number: 41,
  slug: "reservoir-level-interval-test",
  title: "判断水库水位是否在正常工作范围",
  section: "3.1 认识不等式",
  pages: [92],
  figures: ["3-7", "3-8"],
  knowledge: ["compound-inequality", "inequality-number-line", "solution-checking"],
  objective: "把 12～20 m（含端点）的工作范围写成 12≤x≤20，并通过动态取值解释哪些水位满足条件。",
  type: "exploration",
  difficulty: "introductory"
}, b => {
  const axis = addNumberLine(b, "water", 0, 0, 22, [0, 4, 8, 12, 16, 20]);
  const workingRange = b.interval("workingRange", { lower: 12, upper: 20, lowerClosed: true, upperClosed: true, y: 0.2 });
  const level = b.slider("x", 6, 22, 15, [3, -2.3], 12, 1, "x（m）");
  const current = b.expressionPoint("currentLevel", "x", 0.2, "x");
  const canWork = b.bool("canWork", "x >= 12 && x <= 20");
  const anchor = b.p("waterFeedbackAnchor", 1, 2.45, { visible: false });
  const feedbackOk = b.conditionalText("waterFeedbackOk", canWork, anchor, "正常工作：12 ≤ x ≤ 20", "​");
  const feedbackNo = b.conditionalText("waterFeedbackNo", canWork, anchor, "​", "不能正常工作：x 不在 [12,20] 内");
  b.assertion("initial-level-in-range", "value_in_range", [ref(level), value(12), value(20)], "初始水位 15 m 在正常工作范围内。", { requiredMethod: "numeric" });
  b.interaction(level, ["set_value"]);
  b.style([workingRange], { stroke: "#D06A3A", fill: "#D06A3A", strokeWidth: 3, pointSize: 5.2, labelVisible: false });
  b.style([current], { stroke: "#155A73", fill: "#155A73", pointSize: 6, fontSize: 14, labelPlacement: "top" });
  b.style([feedbackOk], { token: "success", fontSize: 15 });
  b.style([feedbackNo], { token: "danger", fontSize: 15 });
  return {
    capabilities: ["interval.from_bounds", "scalar.slider", "point.from_expressions", "boolean.expression", "text.conditional", "assertion.value_in_range", "activity.stages"],
    interactions: [{ target: level, permission: "set_value" }],
    stages: [
      { id: "range", narration: "图 3-7：正常工作范围包含 12 m 和 20 m，因此写成 12≤x≤20，两端都用实心点。", reveal: [...axis, workingRange] },
      { id: "check", narration: "图 3-8：调整水位 x，观察当前点是否落在橙色区间内，并核对实时判断。", reveal: [...axis, workingRange, level, current, canWork, feedbackOk, feedbackNo], focus: [current, feedbackOk, feedbackNo] }
    ]
  };
});

function initialDocument(meta) {
  return {
    schema: "famtutor.math.document.v1",
    documentId: `ch3-${String(meta.number - 38).padStart(2, "0")}-${meta.slug}`,
    revision: 1,
    seed: 400 + meta.number,
    metadata: {
      title: meta.title,
      locale: "zh-CN",
      purpose: meta.type,
      subject: "mathematics",
      grade: "grade-8",
      tags: ["3.1", ...meta.knowledge]
    },
    entities: [],
    construction: [],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "jsxgraph-svg", boundingBox: CASE_BOUNDS[meta.number], axes: false, grid: false, keepAspectRatio: false, background: "#FAF8F2", cameraPolicy: "stable_across_stages" }],
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
    caseId: `zj8a-3-1-${String(meta.number).padStart(2, "0")}-${meta.slug}`,
    title: meta.title,
    description: `按教材图 ${meta.figures.join("、")} 实现的来源可追溯不等式案例。`,
    source: {
      bookId: "zjedu-math-8a-2013",
      pdfName: "义务教育教科书·数学八年级上册.pdf",
      pdfSha256: PDF_SHA,
      chapter: "3 一元一次不等式",
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
    generation: { provider: "openai-codex", model: "gpt-5", promptVersion: "ch3-source-faithful-v1", seed: document.seed, attempts: 1 },
    inputs: { initialDocument: document },
    trace: { changeSets: [changeSet] },
    expected: {
      documentFingerprint: fingerprint,
      assertions: [
        { kind: "entity-exists", entityIds: meta.entityIds.slice(0, Math.min(10, meta.entityIds.length)) },
        { kind: "runtime-assertions-pass" },
        { kind: "activity-stages", minimum: meta.stages.length },
        { kind: "static-render" },
        { kind: "render-bundle" }
      ],
      interactions: meta.interactions
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

process.stdout.write(`Generated ${CASES.length} Chapter 3 cases.\n`);
