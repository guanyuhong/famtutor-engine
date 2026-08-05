import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const casesRoot = join(repoRoot, "research/geogebra/cases");
const materialRoot = join(repoRoot, "research/geogebra/math-g9-12");

const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

const entity = (id, type, role = "derived", extra = {}) => ({ id, type, role, ...extra });
const node = (id, command, outputs, inputs, params) => ({
  id,
  command,
  ...(inputs?.length ? { inputs } : {}),
  ...(params ? { params } : {}),
  outputs: Array.isArray(outputs) ? outputs : [outputs]
});
const ref = id => ({ ref: id });

function commonView(boundingBox) {
  return [{
    id: "main",
    kind: "graphics2d",
    visible: true,
    renderer: "jsxgraph-svg",
    boundingBox,
    axes: true,
    grid: true,
    keepAspectRatio: true,
    background: "#FBFCFE",
    cameraPolicy: "document"
  }];
}

const curveStyle = targets => ({
  targets,
  style: { stroke: "#155B73", strokeWidth: 2.8, labelVisible: false }
});
const pointStyle = (targets, placement = "auto", color = "#6C5CE7") => ({
  targets,
  style: {
    stroke: color,
    fill: color,
    pointSize: 4,
    fontSize: 10,
    labelVisible: true,
    labelPlacement: placement
  }
});
const helperStyle = targets => ({
  targets,
  style: { stroke: "#9DA9B5", strokeWidth: 1.3, dash: "dashed", labelVisible: false }
});
const textStyle = targets => ({
  targets,
  style: { stroke: "#315F78", fontSize: 12 }
});

function makeDocument({
  documentId,
  seed,
  title,
  description,
  tags,
  entities,
  construction,
  boundingBox,
  styles,
  interactions,
  assertions,
  stages,
  task,
  sourceRefs
}) {
  return {
    schema: "famtutor.math.document.v1",
    documentId,
    revision: 1,
    seed,
    metadata: {
      title,
      description,
      locale: "zh-CN",
      purpose: "exploration",
      subject: "mathematics",
      grade: "grade-9-12",
      tags: ["geogebra-math-index", "grade-9-12", ...tags]
    },
    entities,
    construction,
    views: commonView(boundingBox),
    styles,
    interactions,
    assertions,
    activities: [{
      id: documentId,
      title,
      stages,
      tasks: [task]
    }],
    provenance: {
      generator: "agent",
      sourceRefs
    }
  };
}

function makeCase({ number, slug, title, officialUrl, skillId, document, interactions, capabilities }) {
  return {
    schema: "famtutor.case.v1",
    caseId: `research-geogebra-${number}-${slug}`,
    title,
    status: "accepted",
    caseType: "exploration",
    difficulty: "mechanism-reference",
    source: {
      printedPages: [],
      pdfPages: [],
      references: [officialUrl],
      note: "依据 GeoGebra Math 公开知识目标原创构建；不复制活动正文、插图、Applet 或脚本。"
    },
    requiredCapabilities: [...new Set([
      "function.explicit",
      "function.value_at",
      "scalar.slider",
      "point.from_expressions",
      "assertion.expression_equal",
      ...capabilities
    ])],
    inputs: { initialDocument: document },
    trace: { changeSets: [] },
    expected: {
      assertions: [
        { kind: "runtime-assertions-pass" },
        { kind: "activity-stages", minimum: 3 },
        { kind: "static-render" },
        { kind: "render-bundle" }
      ],
      interactions
    }
  };
}

function functionNotationDocument() {
  return makeDocument({
    documentId: "geogebra-math-functions-notation",
    seed: 2801,
    title: "函数与函数记号",
    description: "改变输入 x，沿着 f(x) 的求值链观察输出值和图上点同步变化。",
    tags: ["function-notation", "function-evaluation", "coordinate-graph"],
    entities: [
      entity("x0", "scalar", "free", { label: "输入 x" }),
      entity("f", "function1", "derived", { label: "f(x)=0.5x²−2x+1" }),
      entity("y0", "scalar", "derived", { label: "输出 f(x)" }),
      entity("X", "point2", "auxiliary"),
      entity("P", "point2", "derived", { label: "P(x,f(x))" }),
      entity("XP", "segment2", "auxiliary"),
      entity("formula", "text", "annotation")
    ],
    construction: [
      node("op-x0", "scalar.slider", "x0", [], { value: 1, min: -3, max: 3, step: 0.1, position: [-5.2, -5.55], length: 5 }),
      node("op-f", "function.explicit", "f", [], { expression: "0.5*x^2-2*x+1", domain: [-4, 4] }),
      node("op-y0", "function.value_at", "y0", [ref("f"), ref("x0")]),
      node("op-X", "point.from_expressions", "X", [], { x: "x0", y: "0" }),
      node("op-P", "point.from_expressions", "P", [], { x: "x0", y: "y0" }),
      node("op-XP", "segment.through_points", "XP", [ref("X"), ref("P")]),
      node("op-formula", "text.at", "formula", [], { text: "输入 x → 规则 f → 输出 f(x)", at: [-5.4, 5.15] })
    ],
    boundingBox: [-6, 5.7, 6, -6.2],
    styles: [
      curveStyle(["f"]),
      pointStyle(["P"], "right", "#E36E45"),
      { targets: ["X"], style: { pointSize: 2.5, stroke: "#9DA9B5", fill: "#FFFFFF", labelVisible: false } },
      helperStyle(["XP"]),
      textStyle(["formula"])
    ],
    interactions: [{ target: "x0", permissions: ["select", "drag"], dragMode: "free" }],
    assertions: [
      { id: "input-coordinate", predicate: "expression_equal", arguments: [{ expr: "x(P)" }, { expr: "x0" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "P 的横坐标就是输入 x。" },
      { id: "output-coordinate", predicate: "expression_equal", arguments: [{ expr: "y(P)" }, { expr: "y0" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "P 的纵坐标就是函数输出。" },
      { id: "function-evaluation", predicate: "expression_equal", arguments: [{ expr: "y0" }, { expr: "0.5*x0^2-2*x0+1" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "f(x) 按函数规则求值。" }
    ],
    stages: [
      { id: "notation", narration: "f 是函数名，括号里的 x 表示输入；f(x) 表示把 x 送入规则后得到的输出。", focus: ["formula", "f"] },
      { id: "evaluate", narration: "拖动输入 x，底层通过同一个 function1 实体计算 y0=f(x)，不再复制一份求值公式。", focus: ["x0", "P"] },
      { id: "graph-point", narration: "每一组输入和输出对应图像上的点 P(x,f(x))；竖直虚线帮助把横坐标与图上点对齐。", focus: ["P", "XP"] }
    ],
    task: {
      id: "evaluate-values",
      prompt: "分别取 x=-2、0、2，观察 f(x) 和图上点的位置。",
      allowedTools: ["interaction.drag"],
      evidence: [
        { kind: "assertion", ref: "input-coordinate" },
        { kind: "assertion", ref: "output-coordinate" },
        { kind: "assertion", ref: "function-evaluation" }
      ]
    },
    sourceRefs: [
      "ggb.math.occurrence.functions.9-12.03",
      "ggb.math.skill.functions-and-function-notation",
      "https://www.geogebra.org/math/functions?lang=en-GB"
    ]
  });
}

function exponentialDocument() {
  return makeDocument({
    documentId: "geogebra-math-exponential-critical-values",
    seed: 2901,
    title: "指数函数的式、图像和关键特征",
    description: "改变底数 b 与输入 x，比较增长、衰减和 b=1 的边界，并核验关键点。",
    tags: ["exponential-function", "growth-decay", "critical-values"],
    entities: [
      entity("b", "scalar", "free", { label: "底数 b" }),
      entity("x0", "scalar", "free", { label: "输入 x" }),
      entity("zero", "scalar", "derived"),
      entity("one", "scalar", "derived"),
      entity("f", "function1", "derived", { label: "f(x)=bˣ" }),
      entity("y0", "scalar", "derived"),
      entity("atZero", "scalar", "derived"),
      entity("atOne", "scalar", "derived"),
      entity("P", "point2", "derived", { label: "P" }),
      entity("Q", "point2", "derived", { label: "Q(0,1)" }),
      entity("R", "point2", "derived", { label: "R(1,b)" }),
      entity("growth", "boolean", "derived", { visible: false }),
      entity("decay", "boolean", "derived", { visible: false }),
      entity("boundary", "boolean", "derived", { visible: false }),
      entity("growthText", "text", "annotation"),
      entity("decayText", "text", "annotation"),
      entity("boundaryText", "text", "annotation")
    ],
    construction: [
      node("op-b", "scalar.slider", "b", [], { value: 1.5, min: 0.5, max: 2, step: 0.1, position: [-5.2, -4.65], length: 5 }),
      node("op-x0", "scalar.slider", "x0", [], { value: 2, min: -3, max: 3, step: 0.1, position: [-5.2, -5.4], length: 5 }),
      node("op-zero", "scalar.constant", "zero", [], { value: 0 }),
      node("op-one", "scalar.constant", "one", [], { value: 1 }),
      node("op-f", "function.explicit", "f", [], { expression: "b^x", domain: [-3, 3] }),
      node("op-y0", "function.value_at", "y0", [ref("f"), ref("x0")]),
      node("op-at-zero", "function.value_at", "atZero", [ref("f"), ref("zero")]),
      node("op-at-one", "function.value_at", "atOne", [ref("f"), ref("one")]),
      node("op-P", "point.from_expressions", "P", [], { x: "x0", y: "y0" }),
      node("op-Q", "point.from_expressions", "Q", [], { x: "0", y: "atZero" }),
      node("op-R", "point.from_expressions", "R", [], { x: "1", y: "atOne" }),
      node("op-growth", "boolean.expression", "growth", [], { expression: "b>1" }),
      node("op-decay", "boolean.expression", "decay", [], { expression: "b<1" }),
      node("op-boundary", "boolean.expression", "boundary", [], { expression: "b==1" }),
      node("op-growth-text", "text.conditional", "growthText", [ref("growth")], { trueText: "b>1：指数增长", falseText: "​", at: [-5.4, 7.45] }),
      node("op-decay-text", "text.conditional", "decayText", [ref("decay")], { trueText: "0<b<1：指数衰减", falseText: "​", at: [-5.4, 7.45] }),
      node("op-boundary-text", "text.conditional", "boundaryText", [ref("boundary")], { trueText: "b=1：退化为常数函数 y=1", falseText: "​", at: [-5.4, 7.45] })
    ],
    boundingBox: [-6, 8.1, 6, -6.05],
    styles: [
      curveStyle(["f"]),
      pointStyle(["P"], "right", "#6C5CE7"),
      pointStyle(["Q", "R"], "auto", "#E36E45"),
      textStyle(["growthText", "decayText", "boundaryText"])
    ],
    interactions: [
      { target: "b", permissions: ["select", "drag"], dragMode: "free" },
      { target: "x0", permissions: ["select", "drag"], dragMode: "free" }
    ],
    assertions: [
      { id: "passes-zero-one", predicate: "expression_equal", arguments: [{ expr: "atZero" }, { value: 1 }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "b^0=1。" },
      { id: "passes-one-b", predicate: "expression_equal", arguments: [{ expr: "atOne" }, { expr: "b" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "b^1=b。" },
      { id: "sample-on-graph", predicate: "expression_equal", arguments: [{ expr: "y(P)" }, { expr: "y0" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "样本点 P 在指数函数图像上。" }
    ],
    stages: [
      { id: "exponential-equation", narration: "先固定形式 f(x)=b^x，并保持 b>0；底数是决定增长或衰减的关键参数。", focus: ["f", "b"] },
      { id: "growth-decay", narration: "b>1 时从左向右增长，0<b<1 时衰减；b=1 是常数函数边界。", focus: ["f", "growthText", "decayText", "boundaryText"] },
      { id: "critical-values", narration: "无论底数怎样变化，图像都经过 Q(0,1)；R(1,b) 把底数直接显示为函数值。", focus: ["Q", "R", "P"] }
    ],
    task: {
      id: "compare-growth-decay",
      prompt: "分别取 b=0.6、1、1.8，再改变 x，比较图像和函数值。",
      allowedTools: ["interaction.drag"],
      evidence: [
        { kind: "assertion", ref: "passes-zero-one" },
        { kind: "assertion", ref: "passes-one-b" },
        { kind: "assertion", ref: "sample-on-graph" }
      ]
    },
    sourceRefs: [
      "ggb.math.occurrence.exponential-functions.9-12.03",
      "ggb.math.skill.exponential-functions-equation-graph-and-critical-values",
      "https://www.geogebra.org/math/exponential-functions?lang=en-GB"
    ]
  });
}

function quadraticGraphingDocument() {
  return makeDocument({
    documentId: "geogebra-math-graphing-quadratic-functions",
    seed: 3001,
    title: "二次函数作图",
    description: "用顶点式参数、顶点、对称轴、y 轴截距和一个动态图上点确定二次函数图像。",
    tags: ["quadratic-function", "vertex-form", "axis-of-symmetry", "intercepts"],
    entities: [
      entity("a", "scalar", "free", { label: "a" }),
      entity("h", "scalar", "free", { label: "h" }),
      entity("k", "scalar", "free", { label: "k" }),
      entity("x0", "scalar", "free", { label: "取样 x" }),
      entity("zero", "scalar", "derived"),
      entity("f", "function1", "derived", { label: "y=a(x−h)²+k" }),
      entity("vertexY", "scalar", "derived"),
      entity("sampleY", "scalar", "derived"),
      entity("interceptY", "scalar", "derived"),
      entity("V", "point2", "derived", { label: "V(h,k)" }),
      entity("P", "point2", "derived", { label: "P" }),
      entity("Y", "point2", "derived", { label: "Y" }),
      entity("axisLow", "point2", "auxiliary"),
      entity("axisHigh", "point2", "auxiliary"),
      entity("axis", "line2", "auxiliary", { label: "x=h" }),
      entity("up", "boolean", "derived", { visible: false }),
      entity("down", "boolean", "derived", { visible: false }),
      entity("flat", "boolean", "derived", { visible: false }),
      entity("upText", "text", "annotation"),
      entity("downText", "text", "annotation"),
      entity("flatText", "text", "annotation")
    ],
    construction: [
      node("op-a", "scalar.slider", "a", [], { value: 0.8, min: -1.5, max: 1.5, step: 0.1, position: [-5.3, -6.2], length: 2.8 }),
      node("op-h", "scalar.slider", "h", [], { value: 1, min: -2.5, max: 2.5, step: 0.1, position: [-5.3, -6.95], length: 2.8 }),
      node("op-k", "scalar.slider", "k", [], { value: -1, min: -2.5, max: 2.5, step: 0.1, position: [0.4, -6.2], length: 2.8 }),
      node("op-x0", "scalar.slider", "x0", [], { value: 2.5, min: -4, max: 4, step: 0.1, position: [0.4, -6.95], length: 2.8 }),
      node("op-zero", "scalar.constant", "zero", [], { value: 0 }),
      node("op-f", "function.explicit", "f", [], { expression: "a*(x-h)^2+k", domain: [-5, 5] }),
      node("op-vertex-y", "function.value_at", "vertexY", [ref("f"), ref("h")]),
      node("op-sample-y", "function.value_at", "sampleY", [ref("f"), ref("x0")]),
      node("op-intercept-y", "function.value_at", "interceptY", [ref("f"), ref("zero")]),
      node("op-V", "point.from_expressions", "V", [], { x: "h", y: "vertexY" }),
      node("op-P", "point.from_expressions", "P", [], { x: "x0", y: "sampleY" }),
      node("op-Y", "point.from_expressions", "Y", [], { x: "0", y: "interceptY" }),
      node("op-axis-low", "point.from_expressions", "axisLow", [], { x: "h", y: "-5" }),
      node("op-axis-high", "point.from_expressions", "axisHigh", [], { x: "h", y: "5" }),
      node("op-axis", "line.through_points", "axis", [ref("axisLow"), ref("axisHigh")]),
      node("op-up", "boolean.expression", "up", [], { expression: "a>0" }),
      node("op-down", "boolean.expression", "down", [], { expression: "a<0" }),
      node("op-flat", "boolean.expression", "flat", [], { expression: "a==0" }),
      node("op-up-text", "text.conditional", "upText", [ref("up")], { trueText: "a>0：V 是最小值点", falseText: "​", at: [-5.5, 5.35] }),
      node("op-down-text", "text.conditional", "downText", [ref("down")], { trueText: "a<0：V 是最大值点", falseText: "​", at: [-5.5, 5.35] }),
      node("op-flat-text", "text.conditional", "flatText", [ref("flat")], { trueText: "a=0：退化为常数函数", falseText: "​", at: [-5.5, 5.35] })
    ],
    boundingBox: [-6, 5.9, 6, -7.55],
    styles: [
      { targets: ["a", "h", "k", "x0"], style: { fontSize: 12, labelOffset: [4, 0] } },
      curveStyle(["f"]),
      pointStyle(["V"], "bottom-right", "#E36E45"),
      pointStyle(["P"], "right", "#6C5CE7"),
      pointStyle(["Y"], "left", "#2B8A3E"),
      { targets: ["axisLow", "axisHigh"], style: { opacity: 0, pointSize: 1, labelVisible: false } },
      helperStyle(["axis"]),
      textStyle(["upText", "downText", "flatText"])
    ],
    interactions: [
      { target: "a", permissions: ["select", "drag"], dragMode: "free" },
      { target: "h", permissions: ["select", "drag"], dragMode: "free" },
      { target: "k", permissions: ["select", "drag"], dragMode: "free" },
      { target: "x0", permissions: ["select", "drag"], dragMode: "free" }
    ],
    assertions: [
      { id: "vertex-x", predicate: "expression_equal", arguments: [{ expr: "x(V)" }, { expr: "h" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "顶点横坐标是 h。" },
      { id: "vertex-y", predicate: "expression_equal", arguments: [{ expr: "y(V)" }, { expr: "k" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "顶点纵坐标是 k。" },
      { id: "sample-on-graph", predicate: "expression_equal", arguments: [{ expr: "y(P)" }, { expr: "sampleY" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "P 是由函数实体求值得到的图上点。" },
      { id: "y-intercept", predicate: "expression_equal", arguments: [{ expr: "x(Y)" }, { value: 0 }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "Y 是 y 轴截距点。" }
    ],
    stages: [
      { id: "vertex-form", narration: "顶点式 y=a(x-h)^2+k 直接给出三个作图参数：开口与宽窄、水平位置和竖直位置。", focus: ["f", "a", "h", "k"] },
      { id: "vertex-axis", narration: "V(h,k) 是顶点，对称轴是 x=h；a 的符号决定 V 是最大值点还是最小值点。", focus: ["V", "axis", "upText", "downText", "flatText"] },
      { id: "key-points", narration: "Y 给出 y 轴截距，P 是可移动取样点；顶点、对称轴和关键点共同约束图像。", focus: ["V", "Y", "P"] }
    ],
    task: {
      id: "graph-from-vertex-form",
      prompt: "改变 a、h、k，先预测顶点和对称轴，再拖动 x 检查图上点。",
      allowedTools: ["interaction.drag"],
      evidence: [
        { kind: "assertion", ref: "vertex-x" },
        { kind: "assertion", ref: "vertex-y" },
        { kind: "assertion", ref: "sample-on-graph" },
        { kind: "assertion", ref: "y-intercept" }
      ]
    },
    sourceRefs: [
      "ggb.math.occurrence.quadratic-functions.9-12.04",
      "ggb.math.skill.graphing-quadratic-functions",
      "https://www.geogebra.org/math/quadratic-functions?lang=en-GB"
    ]
  });
}

function quadraticZerosDocument() {
  return makeDocument({
    documentId: "geogebra-math-quadratic-zeros",
    seed: 3101,
    title: "二次函数的零点",
    description: "改变因式中的两个根，观察因式、零点、x 轴交点和重根边界同步变化。",
    tags: ["quadratic-function", "zeros", "factored-form", "double-root"],
    entities: [
      entity("r1", "scalar", "free", { label: "零点 r₁" }),
      entity("r2", "scalar", "free", { label: "零点 r₂" }),
      entity("zero", "scalar", "derived"),
      entity("f", "function1", "derived", { label: "f(x)=(x−r₁)(x−r₂)" }),
      entity("atR1", "scalar", "derived"),
      entity("atR2", "scalar", "derived"),
      entity("atZero", "scalar", "derived"),
      entity("Z1", "point2", "derived", { label: "Z₁" }),
      entity("Z2", "point2", "derived", { label: "Z₂" }),
      entity("Y", "point2", "derived", { label: "Y" }),
      entity("V", "point2", "derived", { label: "V" }),
      entity("axisLow", "point2", "auxiliary"),
      entity("axisHigh", "point2", "auxiliary"),
      entity("axis", "line2", "auxiliary"),
      entity("doubleRoot", "boolean", "derived", { visible: false }),
      entity("distinctRoots", "boolean", "derived", { visible: false }),
      entity("doubleText", "text", "annotation"),
      entity("distinctText", "text", "annotation")
    ],
    construction: [
      node("op-r1", "scalar.slider", "r1", [], { value: -2, min: -3, max: 3, step: 0.25, position: [-5.2, -5.25], length: 4.2 }),
      node("op-r2", "scalar.slider", "r2", [], { value: 2, min: -3, max: 3, step: 0.25, position: [-5.2, -5.9], length: 4.2 }),
      node("op-zero", "scalar.constant", "zero", [], { value: 0 }),
      node("op-f", "function.explicit", "f", [], { expression: "(x-r1)*(x-r2)", domain: [-4, 4] }),
      node("op-at-r1", "function.value_at", "atR1", [ref("f"), ref("r1")]),
      node("op-at-r2", "function.value_at", "atR2", [ref("f"), ref("r2")]),
      node("op-at-zero", "function.value_at", "atZero", [ref("f"), ref("zero")]),
      node("op-Z1", "point.from_expressions", "Z1", [], { x: "r1", y: "atR1" }),
      node("op-Z2", "point.from_expressions", "Z2", [], { x: "r2", y: "atR2" }),
      node("op-Y", "point.from_expressions", "Y", [], { x: "0", y: "atZero" }),
      node("op-V", "point.from_expressions", "V", [], { x: "(r1+r2)/2", y: "-(r1-r2)^2/4" }),
      node("op-axis-low", "point.from_expressions", "axisLow", [], { x: "(r1+r2)/2", y: "-4.5" }),
      node("op-axis-high", "point.from_expressions", "axisHigh", [], { x: "(r1+r2)/2", y: "6" }),
      node("op-axis", "line.through_points", "axis", [ref("axisLow"), ref("axisHigh")]),
      node("op-double", "boolean.expression", "doubleRoot", [], { expression: "r1==r2" }),
      node("op-distinct", "boolean.expression", "distinctRoots", [], { expression: "r1!=r2" }),
      node("op-double-text", "text.conditional", "doubleText", [ref("doubleRoot")], { trueText: "r₁=r₂：两个零点合并为重根", falseText: "​", at: [-5.4, 5.45] }),
      node("op-distinct-text", "text.conditional", "distinctText", [ref("distinctRoots")], { trueText: "r₁≠r₂：图像与 x 轴有两个交点", falseText: "​", at: [-5.4, 5.45] })
    ],
    boundingBox: [-6, 6, 6, -6.35],
    styles: [
      { targets: ["r1", "r2"], style: { fontSize: 12, labelOffset: [4, 0] } },
      curveStyle(["f"]),
      pointStyle(["Z1", "Z2"], "bottom", "#E36E45"),
      pointStyle(["V"], "right", "#6C5CE7"),
      pointStyle(["Y"], "left", "#2B8A3E"),
      { targets: ["axisLow", "axisHigh"], style: { opacity: 0, pointSize: 1, labelVisible: false } },
      helperStyle(["axis"]),
      textStyle(["doubleText", "distinctText"])
    ],
    interactions: [
      { target: "r1", permissions: ["select", "drag"], dragMode: "free" },
      { target: "r2", permissions: ["select", "drag"], dragMode: "free" }
    ],
    assertions: [
      { id: "first-zero", predicate: "expression_equal", arguments: [{ expr: "atR1" }, { value: 0 }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "f(r₁)=0。" },
      { id: "second-zero", predicate: "expression_equal", arguments: [{ expr: "atR2" }, { value: 0 }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "f(r₂)=0。" },
      { id: "first-intercept", predicate: "expression_equal", arguments: [{ expr: "y(Z1)" }, { value: 0 }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "Z₁ 在 x 轴上。" },
      { id: "second-intercept", predicate: "expression_equal", arguments: [{ expr: "y(Z2)" }, { value: 0 }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "Z₂ 在 x 轴上。" },
      { id: "y-intercept-product", predicate: "expression_equal", arguments: [{ expr: "y(Y)" }, { expr: "r1*r2" }], expected: true, tolerance: 1e-9, requiredMethod: "numeric", severity: "error", message: "f(0)=r₁r₂。" }
    ],
    stages: [
      { id: "factored-form", narration: "因式分解式 f(x)=(x-r₁)(x-r₂) 把两个候选零点直接写在式子里。", focus: ["f", "r1", "r2"] },
      { id: "zeros-intercepts", narration: "代入 r₁ 或 r₂ 时有一个因式为零，所以函数值为零；对应点就是 x 轴交点。", focus: ["Z1", "Z2"] },
      { id: "double-root", narration: "当 r₁=r₂ 时两个交点合并，抛物线与 x 轴相切；对称轴始终经过两根中点。", focus: ["V", "axis", "doubleText", "distinctText"] }
    ],
    task: {
      id: "move-the-zeros",
      prompt: "先取两个不同零点，再令 r₁=r₂，解释图像与 x 轴交点数量的变化。",
      allowedTools: ["interaction.drag"],
      evidence: [
        { kind: "assertion", ref: "first-zero" },
        { kind: "assertion", ref: "second-zero" },
        { kind: "assertion", ref: "y-intercept-product" }
      ]
    },
    sourceRefs: [
      "ggb.math.occurrence.quadratic-functions.9-12.07",
      "ggb.math.skill.zeros-of-quadratic-functions",
      "https://www.geogebra.org/math/quadratic-functions?lang=en-GB"
    ]
  });
}

function insertAfter(items, afterId, value) {
  const existing = items.findIndex(item => item.id === value.id);
  if (existing >= 0) items.splice(existing, 1);
  const index = items.findIndex(item => item.id === afterId);
  items.splice(index >= 0 ? index + 1 : items.length, 0, value);
}

async function upgradeExistingCases() {
  const linearPath = join(casesRoot, "21-linear-function-properties/case.json");
  const linear = await readJson(linearPath);
  linear.title = "斜率与截距变化对直线的影响";
  linear.source.references = [...new Set([
    ...linear.source.references,
    "https://www.geogebra.org/math/linear-functions?lang=en-GB"
  ])];
  linear.source.note = "原机制案例升级为 GeoGebra Math 9–12 垂直素材；依据公开目标原创复现。";
  linear.requiredCapabilities = [...new Set([...linear.requiredCapabilities, "function.value_at"])];
  const linearDoc = linear.inputs.initialDocument;
  linearDoc.metadata.grade = "grade-9-12";
  linearDoc.metadata.tags = [...new Set([...linearDoc.metadata.tags, "geogebra-math-index", "grade-9-12", "function-value-at"])];
  insertAfter(linearDoc.entities, "f", entity("y0", "scalar", "derived", { label: "f(x)" }));
  insertAfter(linearDoc.construction, "op-f", node("op-y0", "function.value_at", "y0", [ref("f"), ref("x0")]));
  linearDoc.construction.find(item => item.id === "op-P").params.y = "y0";
  const pointAssertion = linearDoc.assertions.find(item => item.id === "point-on-function");
  pointAssertion.arguments = [{ expr: "y(P)" }, { expr: "y0" }];
  if (!linearDoc.assertions.some(item => item.id === "function-value")) {
    linearDoc.assertions.push({
      id: "function-value",
      predicate: "expression_equal",
      arguments: [{ expr: "y0" }, { expr: "k*x0+b" }],
      expected: true,
      tolerance: 1e-9,
      requiredMethod: "numeric",
      severity: "error",
      message: "函数实体在 x0 处求值得到 kx0+b。"
    });
  }
  linearDoc.provenance.sourceRefs = [...new Set([
    ...linearDoc.provenance.sourceRefs,
    "ggb.math.occurrence.linear-functions.9-12.01",
    "ggb.math.skill.effects-of-changes-in-slope-and-intercepts-of-lines",
    "https://www.geogebra.org/math/linear-functions?lang=en-GB"
  ])];
  await writeJson(linearPath, linear);

  const parentPath = join(casesRoot, "22-quadratic-ax2-properties/case.json");
  const parent = await readJson(parentPath);
  parent.title = "非线性母函数 y=ax² 的伸缩与反射";
  parent.source.references = [...new Set([
    ...parent.source.references,
    "https://www.geogebra.org/math/functions?lang=en-GB"
  ])];
  parent.source.note = "原 y=ax² 机制案例升级为 GeoGebra Math 9–12 母函数变换垂直素材。";
  parent.requiredCapabilities = [...new Set([...parent.requiredCapabilities, "function.value_at"])];
  const parentDoc = parent.inputs.initialDocument;
  parentDoc.metadata.title = "非线性母函数 y=ax² 的伸缩与反射";
  parentDoc.metadata.description = "改变 a，观察母函数 y=x² 的竖直伸缩、关于 x 轴的反射和 a=0 边界。";
  parentDoc.metadata.grade = "grade-9-12";
  parentDoc.metadata.tags = [...new Set([...parentDoc.metadata.tags, "geogebra-math-index", "grade-9-12", "parent-function-transformations", "function-value-at"])];
  insertAfter(parentDoc.entities, "f", entity("yT", "scalar", "derived", { label: "f(t)" }));
  insertAfter(parentDoc.construction, "op-f", node("op-yT", "function.value_at", "yT", [ref("f"), ref("t")]));
  parentDoc.construction.find(item => item.id === "op-L").params.y = "yT";
  parentDoc.construction.find(item => item.id === "op-R").params.y = "yT";
  if (!parentDoc.assertions.some(item => item.id === "function-value")) {
    parentDoc.assertions.push({
      id: "function-value",
      predicate: "expression_equal",
      arguments: [{ expr: "yT" }, { expr: "a*t^2" }],
      expected: true,
      tolerance: 1e-9,
      requiredMethod: "numeric",
      severity: "error",
      message: "函数实体在 t 处求值得到 at²。"
    });
  }
  const activity = parentDoc.activities[0];
  activity.title = "母函数的伸缩、反射和边界";
  activity.stages = [
    { id: "parent", narration: "从母函数 y=x² 出发；a=1 时保留原图像，顶点和对称轴不变。", focus: ["f", "O"] },
    { id: "stretch", narration: "|a| 改变纵向伸缩：|a| 越大图像越窄，0<|a|<1 时越宽。", focus: ["f", "L", "R", "LR"] },
    { id: "reflect", narration: "a<0 时图像关于 x 轴反射；a=0 是常数函数边界，不再是二次函数。", focus: ["f", "upText", "downText", "zeroText"] }
  ];
  parentDoc.provenance.sourceRefs = [...new Set([
    ...parentDoc.provenance.sourceRefs,
    "ggb.math.occurrence.functions.9-12.07",
    "ggb.math.skill.transformations-on-nonlinear-parent-functions",
    "https://www.geogebra.org/math/functions?lang=en-GB"
  ])];
  await writeJson(parentPath, parent);
}

const materialDefinitions = [
  {
    order: 1,
    slug: "functions-and-function-notation",
    materialId: "ggb-math-g9-12-functions-and-function-notation",
    title: "函数与函数记号",
    titleEn: "Functions and Function Notation",
    occurrenceId: "ggb.math.occurrence.functions.9-12.03",
    skillId: "ggb.math.skill.functions-and-function-notation",
    rawTitle: "Functions and Function Notation",
    topic: "functions",
    officialUrl: "https://www.geogebra.org/math/functions?lang=en-GB",
    objectiveSummary: "使用并解释函数记号，在给定定义域元素时确定函数值。",
    caseRef: "../../cases/28-functions-and-function-notation/case.json",
    caseId: "research-geogebra-28-functions-and-function-notation",
    documentId: "geogebra-math-functions-notation",
    stages: ["notation", "evaluate", "graph-point"],
    atoms: [
      ["function-name", "concept", "f 是函数名，x 是输入。"],
      ["function-value", "rule", "f(x) 表示输入 x 对应的输出。"],
      ["evaluate", "procedure", "代入输入，按同一函数规则求值。"],
      ["graph-point", "representation", "输入输出对对应点 (x,f(x))。"],
      ["notation-misread", "misconception", "f(x) 不是 f 与 x 的乘积。"]
    ],
    quizzes: [
      ["quiz-assessment-function-value", "若 f(x)=2x-3，f(4) 等于多少？", "5", "把 x=4 代入同一个函数规则。"],
      ["quiz-notation-name", "在 f(2) 中，2 表示什么？", "输入", "括号中的量是函数输入。"],
      ["quiz-notation-output", "点 (3,7) 在 y=f(x) 上说明什么？", "f(3)=7", "图上点把输入和输出配成有序对。"],
      ["quiz-notation-misconception", "判断：f(x) 一定等于 f×x。", "错误", "f(x) 是函数值记号，不是普通乘法。"],
      ["quiz-notation-transfer", "若 f(-1)=4，图像上必经过哪个点？", "(-1,4)", "函数值可直接转成图上点。"]
    ]
  },
  {
    order: 2,
    slug: "slope-and-intercept-changes",
    materialId: "ggb-math-g9-12-slope-and-intercept-changes",
    title: "斜率和截距变化",
    titleEn: "Effects of Changes in Slope and Intercepts of Lines",
    occurrenceId: "ggb.math.occurrence.linear-functions.9-12.01",
    skillId: "ggb.math.skill.effects-of-changes-in-slope-and-intercepts-of-lines",
    rawTitle: "Effects of Changes in Slope and Intercepts of Lines",
    topic: "linear-functions",
    officialUrl: "https://www.geogebra.org/math/linear-functions?lang=en-GB",
    objectiveSummary: "判断斜率和截距变化对直线图像与方程的影响。",
    caseRef: "../../cases/21-linear-function-properties/case.json",
    caseId: "research-geogebra-21-linear-function-properties",
    documentId: "qiu-feng-linear-function-properties",
    stages: ["slope", "intercept", "sample"],
    atoms: [
      ["slope-sign", "rule", "k 的符号决定直线上升或下降。"],
      ["slope-size", "rule", "|k| 影响直线倾斜程度。"],
      ["intercept", "concept", "b 是图像与 y 轴交点的纵坐标。"],
      ["parallel-shift", "representation", "固定 k 改变 b，直线保持平行移动。"],
      ["zero-slope", "misconception", "k=0 时是常数函数，不是无图像。"]
    ],
    quizzes: [
      ["quiz-assessment-slope-intercept", "固定 k，仅增大 b，直线怎样变化？", "向上平移", "斜率不变，所以方向不变。"],
      ["quiz-slope-sign", "k<0 时直线从左到右怎样？", "下降", "负斜率表示随 x 墠大 y 减小。"],
      ["quiz-intercept", "y=2x-3 的 y 轴截距是多少？", "-3", "令 x=0 得 y=-3。"],
      ["quiz-parallel", "哪两条直线一定平行？", "斜率相同的两条不同直线", "相同斜率给出相同方向。"],
      ["quiz-zero-slope", "y=4 的斜率是多少？", "0", "水平直线的斜率为零。"]
    ]
  },
  {
    order: 3,
    slug: "nonlinear-parent-function-transformations",
    materialId: "ggb-math-g9-12-nonlinear-parent-function-transformations",
    title: "非线性母函数变换",
    titleEn: "Transformations on Nonlinear Parent Functions",
    occurrenceId: "ggb.math.occurrence.functions.9-12.07",
    skillId: "ggb.math.skill.transformations-on-nonlinear-parent-functions",
    rawTitle: "Transformations on Nonlinear Parent Functions",
    topic: "functions",
    officialUrl: "https://www.geogebra.org/math/functions?lang=en-GB",
    objectiveSummary: "从函数记号、代数式或图像识别非线性母函数的变换。",
    caseRef: "../../cases/22-quadratic-ax2-properties/case.json",
    caseId: "research-geogebra-22-quadratic-ax2-properties",
    documentId: "qiu-feng-quadratic-ax2-properties",
    stages: ["parent", "stretch", "reflect"],
    atoms: [
      ["parent", "concept", "y=x² 是本素材的母函数。"],
      ["vertical-scale", "rule", "|a| 控制 y=ax² 的纵向伸缩。"],
      ["reflection", "rule", "a<0 时图像关于 x 轴反射。"],
      ["invariant", "representation", "伸缩和反射不改变顶点与对称轴。"],
      ["boundary", "misconception", "a=0 时不再是二次函数。"]
    ],
    quizzes: [
      ["quiz-assessment-parent-transform", "由 y=x² 变为 y=-2x²，发生了什么？", "纵向伸长并关于 x 轴反射", "|a|=2 控制伸长，负号控制反射。"],
      ["quiz-parent", "y=x² 的顶点在哪里？", "(0,0)", "母函数顶点是原点。"],
      ["quiz-scale", "0<|a|<1 时图像通常怎样？", "更宽", "纵向压缩在图像上表现为开口变宽。"],
      ["quiz-reflect", "a 的什么性质决定开口方向？", "符号", "正负号决定是否关于 x 轴反射。"],
      ["quiz-boundary", "判断：y=0x² 仍是二次函数。", "错误", "二次项系数必须非零。"]
    ]
  },
  {
    order: 4,
    slug: "exponential-equation-graph-critical-values",
    materialId: "ggb-math-g9-12-exponential-equation-graph-critical-values",
    title: "指数函数的式、图像和关键特征",
    titleEn: "Exponential Functions: Equation, Graph, and Critical Values",
    occurrenceId: "ggb.math.occurrence.exponential-functions.9-12.03",
    skillId: "ggb.math.skill.exponential-functions-equation-graph-and-critical-values",
    rawTitle: "Exponential Functions- Equation, Graph and Critical Values",
    topic: "exponential-functions",
    officialUrl: "https://www.geogebra.org/math/exponential-functions?lang=en-GB",
    objectiveSummary: "写出并绘制 f(x)=ab^x 等指数函数，识别并解释关键值。",
    caseRef: "../../cases/29-exponential-equation-graph-critical-values/case.json",
    caseId: "research-geogebra-29-exponential-equation-graph-critical-values",
    documentId: "geogebra-math-exponential-critical-values",
    stages: ["exponential-equation", "growth-decay", "critical-values"],
    atoms: [
      ["form", "concept", "f(x)=b^x 中自变量位于指数位置。"],
      ["growth", "rule", "b>1 时函数指数增长。"],
      ["decay", "rule", "0<b<1 时函数指数衰减。"],
      ["critical-zero", "representation", "图像始终经过 (0,1)。"],
      ["boundary", "misconception", "b=1 时退化为常数函数。"]
    ],
    quizzes: [
      ["quiz-assessment-exponential-critical", "f(x)=3·2^x 的 y 轴截距是多少？", "3", "令 x=0，2^0=1。"],
      ["quiz-growth", "哪一个底数产生指数增长：0.5 还是 1.5？", "1.5", "底数大于 1 时增长。"],
      ["quiz-decay", "0<b<1 时图像从左到右怎样？", "下降", "函数值随 x 墠大而衰减。"],
      ["quiz-zero", "b^0 等于多少？", "1", "任意正底数的零次幂为 1。"],
      ["quiz-boundary", "判断：b=1 时仍表现指数增长。", "错误", "此时 f(x)=1。"]
    ]
  },
  {
    order: 5,
    slug: "graphing-quadratic-functions",
    materialId: "ggb-math-g9-12-graphing-quadratic-functions",
    title: "二次函数作图",
    titleEn: "Graphing Quadratic Functions",
    occurrenceId: "ggb.math.occurrence.quadratic-functions.9-12.04",
    skillId: "ggb.math.skill.graphing-quadratic-functions",
    rawTitle: "Graphing Quadratic Functions",
    topic: "quadratic-functions",
    officialUrl: "https://www.geogebra.org/math/quadratic-functions?lang=en-GB",
    objectiveSummary: "绘制二次函数，识别并解释截距、最大值或最小值以及对称轴。",
    caseRef: "../../cases/30-graphing-quadratic-functions/case.json",
    caseId: "research-geogebra-30-graphing-quadratic-functions",
    documentId: "geogebra-math-graphing-quadratic-functions",
    stages: ["vertex-form", "vertex-axis", "key-points"],
    atoms: [
      ["vertex-form", "concept", "y=a(x-h)²+k 的顶点是 (h,k)。"],
      ["axis", "rule", "对称轴是直线 x=h。"],
      ["extreme", "rule", "a 的符号决定最大值或最小值。"],
      ["intercept", "procedure", "令 x=0 可求 y 轴截距。"],
      ["key-points", "representation", "顶点、对称轴和关键点约束图像。"]
    ],
    quizzes: [
      ["quiz-assessment-quadratic-graph", "y=2(x-1)²-3 的顶点是什么？", "(1,-3)", "从顶点式直接读取 h 和 k。"],
      ["quiz-axis", "y=a(x+2)²+1 的对称轴是什么？", "x=-2", "x+2=x-(-2)。"],
      ["quiz-extreme", "a<0 时顶点表示最大值还是最小值？", "最大值", "开口向下。"],
      ["quiz-intercept", "求 y 轴截距时应令哪个变量为 0？", "x", "y 轴上所有点横坐标为零。"],
      ["quiz-boundary", "判断：a=0 时图像仍是抛物线。", "错误", "二次项消失后不再是二次函数。"]
    ]
  },
  {
    order: 6,
    slug: "zeros-of-quadratic-functions",
    materialId: "ggb-math-g9-12-zeros-of-quadratic-functions",
    title: "二次函数的零点",
    titleEn: "Zeros of Quadratic Functions",
    occurrenceId: "ggb.math.occurrence.quadratic-functions.9-12.07",
    skillId: "ggb.math.skill.zeros-of-quadratic-functions",
    rawTitle: "Zeros of Quadratic Functions",
    topic: "quadratic-functions",
    officialUrl: "https://www.geogebra.org/math/quadratic-functions?lang=en-GB",
    objectiveSummary: "利用因式分解识别并解释二次函数的零点。",
    caseRef: "../../cases/31-zeros-of-quadratic-functions/case.json",
    caseId: "research-geogebra-31-zeros-of-quadratic-functions",
    documentId: "geogebra-math-quadratic-zeros",
    stages: ["factored-form", "zeros-intercepts", "double-root"],
    atoms: [
      ["zero-definition", "concept", "函数零点满足 f(x)=0。"],
      ["factored-form", "rule", "一个因式为零时乘积为零。"],
      ["intercept", "representation", "零点对应图像与 x 轴交点。"],
      ["axis", "rule", "两零点中点位于对称轴上。"],
      ["double-root", "misconception", "重根对应一个相切点，不是无零点。"]
    ],
    quizzes: [
      ["quiz-assessment-quadratic-zero", "f(x)=(x-2)(x+3) 的零点是什么？", "2 和 -3", "分别令两个因式为零。"],
      ["quiz-zero-definition", "函数零点满足什么等式？", "f(x)=0", "零点是使函数值为零的输入。"],
      ["quiz-intercept", "零点在图像上对应哪类点？", "x 轴交点", "x 轴上纵坐标为零。"],
      ["quiz-double", "r₁=r₂ 时图像与 x 轴怎样相交？", "相切", "两个交点合并为一个重根点。"],
      ["quiz-axis", "零点为 -1 和 5 时对称轴是什么？", "x=2", "对称轴经过两根的中点。"]
    ]
  }
];

function materialJson(definition) {
  const teachingAtoms = definition.atoms.map(([id, type, visibleText]) => ({
    id: `atom-${id}`,
    type,
    visibleText,
    narrationSeed: visibleText,
    sourceRef: definition.occurrenceId
  }));
  return {
    schema: "famtutor.geogebra.math.material.v1",
    materialId: definition.materialId,
    title: definition.title,
    titleEn: definition.titleEn,
    gradeBand: "9-12",
    domain: "Algebra",
    pattern: "algebra_relationship",
    knowledgePoint: {
      uniqueSkillId: definition.skillId,
      occurrenceIds: [definition.occurrenceId],
      topicSlug: definition.topic
    },
    sourceSnapshot: "source-snapshot.json",
    teachingAtoms,
    engineCase: {
      path: `../../../cases/${definition.caseRef.split("/").at(-2)}/case.json`,
      caseId: definition.caseId,
      documentId: definition.documentId
    },
    stages: definition.stages.map((id, index) => ({ id, order: index + 1 })),
    quizSeeds: definition.quizzes.map(([id, stem, answer, feedback], index) => ({
      id,
      type: index === 3 ? "true_false" : "short_answer",
      stem,
      answer,
      feedback: { correct: feedback, incorrect: feedback },
      sourceAtomIds: [teachingAtoms[Math.min(index, teachingAtoms.length - 1)].id]
    })),
    acceptance: {
      sourceFidelity: {
        status: "verified",
        evidence: [definition.occurrenceId, definition.officialUrl]
      },
      mathCorrectness: {
        status: "automated",
        evidence: ["runtime assertions", "parameter sweep test"]
      },
      visualQuality: {
        status: "verified-browser-review",
        evidence: ["Direct SVG", "Mounted JSXGraph Gallery at 330px height", "six-case stage-switch review"]
      },
      runtimeStatus: {
        status: "automated",
        evidence: ["validate", "Direct SVG", "MountedRenderer browser gate", "Render Bundle"]
      }
    }
  };
}

function sourceSnapshot(definition) {
  return {
    schema: "famtutor.geogebra.math.source-snapshot.v1",
    retrievedAt: "2026-08-05",
    sourceIndex: {
      package: "famtutor-geogebra-math-skill-index-v0.2.0",
      schema: "famtutor.geogebra_math.skill_index.v0.2.0"
    },
    occurrence: {
      occurrenceId: definition.occurrenceId,
      uniqueSkillId: definition.skillId,
      gradeBand: "9-12",
      topicSlug: definition.topic,
      skillTitleEnRaw: definition.rawTitle,
      skillTitleEnNormalized: definition.titleEn,
      skillTitleZhReviewedForMaterial: definition.title
    },
    officialPage: {
      url: definition.officialUrl,
      objectiveSummaryZh: definition.objectiveSummary,
      verification: "browser-reviewed"
    },
    curriculumAlignment: {
      status: "not-mapped",
      reason: "GeoGebra 仅给出 9–12 宽学段；本批次未获得适用的中国高中课程切片。",
      authorInferences: [
        "将公开目标拆成三阶段交互板。",
        "选择可展示边界状态的参数范围。",
        "quiz seeds 为原创检查题，不复制 GeoGebra 活动题目。"
      ]
    },
    copyrightBoundary: "只保留短标题、来源 URL 和原创中文概述；不复制活动正文、插图、Applet、脚本或 .ggb 文件。"
  };
}

async function writeMaterials() {
  for (const definition of materialDefinitions) {
    const directory = join(materialRoot, "materials", definition.slug);
    await writeJson(join(directory, "material.json"), materialJson(definition));
    await writeJson(join(directory, "source-snapshot.json"), sourceSnapshot(definition));
  }
  await writeJson(join(materialRoot, "material-index.v1.json"), {
    schema: "famtutor.geogebra.math.material-index.v1",
    gradeBand: "9-12",
    wave: "01",
    generatedAt: "2026-08-05",
    materials: materialDefinitions.map(definition => ({
      order: definition.order,
      materialId: definition.materialId,
      title: definition.title,
      uniqueSkillId: definition.skillId,
      occurrenceId: definition.occurrenceId,
      path: `materials/${definition.slug}/material.json`,
      caseRef: definition.caseRef
    }))
  });
  await writeJson(join(materialRoot, "gap-ledger.v1.json"), {
    schema: "famtutor.geogebra.math.gap-ledger.v1",
    wave: "01",
    generatedAt: "2026-08-05",
    materials: materialDefinitions.map(definition => definition.materialId),
    gaps: [
      {
        capability: "function.value_at",
        layer: "kernel",
        status: "closed-new-l0",
        evidenceMaterials: materialDefinitions.map(definition => definition.materialId),
        evidence: "function1 原先只能绘制；六个素材中的采样点或关键值都需要在给定标量输入上复用同一函数实体。",
        decision: "新增 function.value_at(function1, scalar) -> scalar；域外输入产生结构化失败，JSXGraph 与 headless 共用求值语义。"
      },
      {
        capability: "nonlinear-parent-transform-authoring",
        layer: "authoring",
        status: "closed-compose-existing",
        evidenceMaterials: ["ggb-math-g9-12-nonlinear-parent-function-transformations", "ggb-math-g9-12-graphing-quadratic-functions"],
        decision: "参数滑块 + function.explicit 足以表达伸缩、反射和平移；不新增母函数专用命令。"
      },
      {
        capability: "scalar-slider-label-offset",
        layer: "renderer",
        status: "closed-existing-style-semantics",
        evidenceMaterials: ["ggb-math-g9-12-graphing-quadratic-functions", "ggb-math-g9-12-zeros-of-quadratic-functions"],
        evidence: "多滑块窄画布暴露标签拥挤；通用 EntityStyle.labelOffset 已发布，但 JSXGraph scalar slider 未消费该字段。",
        decision: "补齐 scalar slider 对 fontSize/labelOffset 的原生 JSXGraph 映射；素材只使用公开样式，不添加案例文字覆盖或 Gallery 分支。"
      },
      {
        capability: "general-function-critical-points",
        layer: "kernel",
        status: "deferred",
        evidenceMaterials: ["ggb-math-g9-12-exponential-equation-graph-critical-values", "ggb-math-g9-12-graphing-quadratic-functions"],
        decision: "本批关键点由函数定义和已知参数给出；等待独立素材要求从任意 function1 数值求零点或极值后再设计通用测量。"
      },
      {
        capability: "dynamic-math-text",
        layer: "presentation",
        status: "deferred",
        evidenceMaterials: materialDefinitions.map(definition => definition.materialId),
        decision: "当前用短标签、条件文本和 narration 表达；不因六个案例需要显示数值字符串就扩张数学内核。"
      }
    ]
  });
}

async function main() {
  await upgradeExistingCases();
  const newCases = [
    makeCase({
      number: "28",
      slug: "functions-and-function-notation",
      title: "函数与函数记号",
      officialUrl: "https://www.geogebra.org/math/functions?lang=en-GB",
      skillId: "ggb.math.skill.functions-and-function-notation",
      document: functionNotationDocument(),
      interactions: [{ target: "x0", permission: "drag" }],
      capabilities: ["segment.through_points"]
    }),
    makeCase({
      number: "29",
      slug: "exponential-equation-graph-critical-values",
      title: "指数函数的式、图像和关键特征",
      officialUrl: "https://www.geogebra.org/math/exponential-functions?lang=en-GB",
      skillId: "ggb.math.skill.exponential-functions-equation-graph-and-critical-values",
      document: exponentialDocument(),
      interactions: [{ target: "b", permission: "drag" }, { target: "x0", permission: "drag" }],
      capabilities: ["boolean.expression", "text.conditional"]
    }),
    makeCase({
      number: "30",
      slug: "graphing-quadratic-functions",
      title: "二次函数作图",
      officialUrl: "https://www.geogebra.org/math/quadratic-functions?lang=en-GB",
      skillId: "ggb.math.skill.graphing-quadratic-functions",
      document: quadraticGraphingDocument(),
      interactions: [
        { target: "a", permission: "drag" },
        { target: "h", permission: "drag" },
        { target: "k", permission: "drag" },
        { target: "x0", permission: "drag" }
      ],
      capabilities: ["line.through_points", "boolean.expression", "text.conditional"]
    }),
    makeCase({
      number: "31",
      slug: "zeros-of-quadratic-functions",
      title: "二次函数的零点",
      officialUrl: "https://www.geogebra.org/math/quadratic-functions?lang=en-GB",
      skillId: "ggb.math.skill.zeros-of-quadratic-functions",
      document: quadraticZerosDocument(),
      interactions: [{ target: "r1", permission: "drag" }, { target: "r2", permission: "drag" }],
      capabilities: ["line.through_points", "boolean.expression", "text.conditional"]
    })
  ];
  for (const spec of newCases) {
    const suffix = spec.caseId.replace(/^research-geogebra-/, "");
    await writeJson(join(casesRoot, suffix, "case.json"), spec);
  }
  await writeMaterials();
}

await main();
