import { evaluateMathDocument, MathDomainRuntime, mountMathRenderer } from "/packages/math/dist/index.js?v=qiu-feng-wave-1";

const CASE_PATHS = [
  "/corpus/books/zjedu-math-8a-2013/cases/01-triangle-elements/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/02-drag-angle-sum/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/03-triangle-inequality/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/04-adjust-three-segments/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/05-angle-bisector/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/06-median/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/07-altitudes/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/08-altitude-bisector-angle/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/09-identify-triangle-lines/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/10-midpoint-area/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/11-condition-conclusion/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/12-counterexample/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/13-original-converse/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/14-definition-right-triangle/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/15-proof-format-angle-bisector/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/16-parallel-bisectors-right-angle/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/17-triangle-angle-sum-proof/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/18-auxiliary-line-parallel-proof/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/19-congruent-figures/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/20-corresponding-parts/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/21-fold-congruent-triangles/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/22-sss-construct-triangle/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/23-sss-stability/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/24-sss-proof-application/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/25-sas-uniqueness/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/26-perpendicular-bisector-property/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/27-asa-criterion/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/28-asa-proof-application/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/29-aas-criterion/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/30-angle-bisector-distance/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/31-congruence-boundaries/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/32-copy-angle/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/33-construct-perpendicular-bisector/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/34-construct-triangle-asa/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/35-three-congruence-constructions/case.json",
  "/corpus/books/zjedu-math-8a-2013/cases/36-symmetry-axes/case.json?v=ch2-3",
  "/corpus/books/zjedu-math-8a-2013/cases/37-reflect-triangle-across-line/case.json?v=ch2-3",
  "/corpus/books/zjedu-math-8a-2013/cases/38-reflection-shortest-path/case.json?v=ch2-3",
  "/corpus/books/zjedu-math-8a-2013/cases/39-speed-limit-inequality/case.json?v=ch3-2",
  "/corpus/books/zjedu-math-8a-2013/cases/40-number-line-open-closed-intervals/case.json?v=ch3-2",
  "/corpus/books/zjedu-math-8a-2013/cases/41-reservoir-level-interval-test/case.json?v=ch3-2",
  "/research/geogebra/cases/01-chinese-remainder-controls/case.json?v=controls-clock-1",
  "/research/geogebra/cases/02-circle-inversion-common-tangents/case.json?v=circle-inversion-1",
  "/research/geogebra/cases/03-steiner-chain-sequence-zip/case.json?v=collection-sequence-1",
  "/research/geogebra/cases/04-sierpinski-imported-macro/case.json?v=imported-macro-1",
  "/research/geogebra/cases/05-ssa-ambiguity/case.json?v=qiu-feng-wave-1",
  "/research/geogebra/cases/06-apollonius-ratio-circle/case.json?v=qiu-feng-wave-1",
  "/research/geogebra/cases/07-triangle-exterior-angle/case.json?v=qiu-feng-wave-2",
  "/research/geogebra/cases/08-one-line-three-equal-angles/case.json?v=qiu-feng-wave-2",
  "/research/geogebra/cases/09-equilateral-hand-in-hand/case.json?v=qiu-feng-wave-2",
  "/research/geogebra/cases/10-square-hand-in-hand-rotation/case.json?v=qiu-feng-wave-3",
  "/research/geogebra/cases/11-isosceles-hand-in-hand-rotation/case.json?v=qiu-feng-wave-3",
  "/research/geogebra/cases/12-internal-angle-bisector-theorem/case.json?v=qiu-feng-wave-4",
  "/research/geogebra/cases/13-external-angle-bisector-theorem/case.json?v=qiu-feng-wave-4",
  "/research/geogebra/cases/14-bisector-altitude-angle-relation/case.json?v=qiu-feng-wave-5",
  "/research/geogebra/cases/15-sss-rigid-congruence/case.json?v=qiu-feng-wave-6",
  "/research/geogebra/cases/16-sas-rigid-congruence/case.json?v=qiu-feng-wave-6",
  "/research/geogebra/cases/17-asa-rigid-congruence/case.json?v=qiu-feng-wave-6",
  "/research/geogebra/cases/18-aas-rigid-congruence/case.json?v=qiu-feng-wave-7",
  "/research/geogebra/cases/19-perpendicular-bisector-locus/case.json?v=qiu-feng-wave-7",
  "/research/geogebra/cases/20-isosceles-triangle-properties/case.json?v=qiu-feng-wave-7",
  "/research/geogebra/cases/21-linear-function-properties/case.json?v=qiu-feng-wave-8",
  "/research/geogebra/cases/22-quadratic-ax2-properties/case.json?v=qiu-feng-wave-8",
  "/research/geogebra/cases/23-reflection-shortest-path/case.json?v=qiu-feng-wave-9",
  "/research/geogebra/cases/24-pythagorean-area-proof/case.json?v=qiu-feng-wave-9",
  "/research/geogebra/cases/25-n-gon-diagonals/case.json?v=qiu-feng-wave-9",
  "/research/geogebra/cases/26-rigid-transform-properties/case.json?v=qiu-feng-wave-9",
  "/research/geogebra/cases/27-triangle-definition-boundary/case.json?v=qiu-feng-wave-10",
  "/research/geogebra/cases/28-functions-and-function-notation/case.json?v=geogebra-math-g9-12-wave-1",
  "/research/geogebra/cases/29-exponential-equation-graph-critical-values/case.json?v=geogebra-math-g9-12-wave-1",
  "/research/geogebra/cases/30-graphing-quadratic-functions/case.json?v=geogebra-math-g9-12-wave-1",
  "/research/geogebra/cases/31-zeros-of-quadratic-functions/case.json?v=geogebra-math-g9-12-wave-1",
  "/research/geogebra/cases/32-representations-of-relations-and-functions/case.json?v=geogebra-math-g9-12-wave-2",
  "/research/geogebra/cases/33-increasing-and-decreasing-functions/case.json?v=geogebra-math-g9-12-wave-2",
  "/research/geogebra/cases/34-graphing-absolute-value-functions-and-inequalities/case.json?v=geogebra-math-g9-12-wave-2",
  "/research/geogebra/cases/35-graphing-to-solve-quadratic-equations/case.json?v=geogebra-math-g9-12-wave-2",
  "/research/geogebra/cases/36-domain-and-range-of-special-functions/case.json?v=geogebra-math-g9-12-wave-3",
  "/research/geogebra/cases/37-composition-and-inverse-of-functions/case.json?v=geogebra-math-g9-12-wave-3",
  "/research/geogebra/cases/38-solving-systems-of-linear-equations/case.json?v=geogebra-math-g9-12-wave-3",
  "/research/geogebra/cases/39-discriminant-and-roots-of-a-quadratic-equation/case.json?v=geogebra-math-g9-12-wave-3",
  "/research/geogebra/cases/40-solving-linear-inequalities/case.json?v=geogebra-math-g9-12-wave-4",
  "/research/geogebra/cases/41-systems-of-linear-inequalities/case.json?v=geogebra-math-g9-12-wave-4",
  "/research/geogebra/cases/42-solving-nonlinear-systems-of-equations-and-inequalities/case.json?v=geogebra-math-g9-12-wave-4",
  "/research/geogebra/cases/43-using-the-quadratic-formula-to-solve-quadratic-equations/case.json?v=geogebra-math-g9-12-wave-4"
];

const runtime = new MathDomainRuntime();
const gallery = document.querySelector("#gallery");
const template = document.querySelector("#case-card-template");
const errorPanel = document.querySelector("#error-panel");
const rendererByCase = new Map();
const replayedDocumentByCase = new Map();

const STAGE_LABELS = {
  source: "来源",
  triangle: "已知",
  bisector: "角平分线",
  altitude: "高",
  move: "旋转验证",
  "included-angle": "夹角",
  "included-side": "夹边",
  "opposite-side": "一角对边",
  equidistant: "等距",
  "base-angles": "底角",
  "three-lines": "三线合一",
  slope: "斜率",
  intercept: "截距",
  sample: "取样点",
  opening: "开口",
  symmetry: "对称性",
  monotonicity: "增减性",
  try: "尝试路径",
  squares: "三边正方形",
  area: "面积关系",
  polygon: "改变边数",
  fan: "单顶点",
  all: "全部对角线",
  translation: "平移",
  reflection: "翻折",
  rotation: "旋转",
  invariant: "共同不变量",
  segments: "三条线段",
  "non-collinear": "非共线",
  boundary: "退化边界",
  derive: "推导",
  conclude: "结论",
  pair: "成对",
  fold: "翻折",
  triangles: "全等三角形",
  vertices: "对应顶点",
  edges: "对应边",
  angles: "对应角",
  given: "已知",
  "fold-axis": "翻折轴",
  overlap: "重合",
  correspondence: "对应顺序",
  statement: "命题",
  condition: "条件",
  conclusion: "结论",
  exterior: "外角",
  relation: "数量关系",
  ratio: "比例",
  claim: "待判断",
  conditions: "核对条件",
  counterexample: "反例",
  original: "原命题",
  swap: "交换",
  converse: "逆命题",
  object: "对象",
  property: "性质",
  definition: "定义",
  construct: "辅助构造",
  cut: "切割",
  assemble: "拼角",
  base: "第一步",
  arcs: "作弧",
  intersection: "交点",
  hinge: "活动铰链",
  locked: "三边锁定",
  sss: "SSS",
  sas: "SAS",
  asa: "ASA",
  aas: "AAS",
  "source-arc": "已知角作弧",
  "target-arc": "目标弧",
  "copy-chord": "复制弦",
  "equal-arcs": "等半径弧",
  join: "连接交点",
  givens: "已知数据",
  "copy-angles": "复制角",
  target: "目标",
  "sss-method": "SSS 作法",
  "sas-method": "SAS 作法",
  "asa-method": "ASA 作法",
  compare: "比较",
  rectangle: "长方形",
  square: "正方形",
  circle: "圆",
  perpendicular: "作垂线",
  "equal-distance": "取等距点",
  connect: "连接",
  problem: "问题",
  reflect: "作对称点",
  straighten: "化为直线",
  meaning: "理解语义",
  "test-value": "检验取值",
  strict: "严格不等式",
  inclusive: "含等号",
  bounded: "有限区间",
  range: "工作范围",
  check: "动态检验",
  counterexamples: "两个反例",
  locus: "比值轨迹",
  notation: "函数记号",
  evaluate: "代入求值",
  "graph-point": "图上点",
  parent: "母函数",
  stretch: "伸缩",
  "exponential-equation": "指数式",
  "growth-decay": "增长与衰减",
  "critical-values": "关键值",
  "vertex-form": "顶点式",
  "vertex-axis": "顶点与对称轴",
  "key-points": "关键点",
  "factored-form": "因式分解式",
  "zeros-intercepts": "零点与截距",
  "double-root": "重根"
};

function caseNumber(caseId) {
  return caseId.match(/-(\d{2})-/)?.[1] ?? "??";
}

function sourceLabel(caseSpec) {
  if ((caseSpec.source.printedPages ?? []).length === 0 && (caseSpec.source.pdfPages ?? []).length === 0) {
    return "GeoGebra 机制研究 · FamTutor 原创复现";
  }
  const printed = caseSpec.source.printedPages.join("–");
  const pdf = caseSpec.source.pdfPages.join("–");
  return `印刷页 ${printed} · PDF ${pdf}`;
}

function interactionLabel(caseSpec) {
  const interactions = caseSpec.expected.interactions ?? [];
  if (interactions.length === 0) return "观察案例 · 无需操作";
  const entityTypeById = new Map((caseSpec.inputs.initialDocument.entities ?? []).map(entity => [entity.id, entity.type]));
  const dragCount = interactions.filter(item => item.permission === "drag").length;
  const scalarCount = interactions.filter(item => item.permission === "set_value" && entityTypeById.get(item.target) === "scalar").length;
  const parts = [];
  if (dragCount) parts.push(`可拖动 ${dragCount} 个对象`);
  if (scalarCount) parts.push(`可调整 ${scalarCount} 个滑块`);
  const documentValue = caseSpec.inputs.initialDocument;
  const tracedOperations = caseSpec.trace.changeSets.flatMap(changeSet => changeSet.operations ?? []);
  const controlCount = (documentValue.controls ?? []).length + tracedOperations.filter(operation => operation.op === "set_control").length;
  const clockCount = (documentValue.clocks ?? []).length + tracedOperations.filter(operation => operation.op === "set_clock").length;
  if (controlCount) parts.push(`${controlCount} 个声明式控制`);
  if (clockCount) parts.push(`${clockCount} 个确定性时钟`);
  return parts.join(" · ") || `${interactions.length} 个可交互对象`;
}

function clockSummary(renderer) {
  const clocks = renderer.getState().metadata?.clocks;
  if (!Array.isArray(clocks) || clocks.length === 0) return "";
  return clocks.map(clock => `${clock.clockId}: ${clock.status} · t=${clock.value} · tick ${clock.tick}`).join(" ｜ ");
}

function setupRuntimeControls(card, renderer) {
  const panel = card.querySelector(".runtime-control-panel");
  const buttons = card.querySelector(".runtime-control-buttons");
  const status = card.querySelector(".runtime-control-status");
  const runtimeDocument = renderer.getDocument();
  const controls = runtimeDocument.controls ?? [];
  const clocks = runtimeDocument.clocks ?? [];
  buttons.replaceChildren();
  panel.hidden = controls.length === 0 && clocks.length === 0;
  if (panel.hidden) return;

  for (const control of controls) {
    const interactive = control.kind === "checkbox" ? document.createElement("input") : document.createElement("button");
    const wrapper = control.kind === "checkbox" ? document.createElement("label") : interactive;
    if (control.kind === "checkbox") {
      interactive.className = "runtime-checkbox-input";
      interactive.type = "checkbox";
      interactive.checked = evaluateMathDocument(runtimeDocument).entities.get(control.action.target)?.value === true;
      wrapper.className = "runtime-control runtime-checkbox";
      wrapper.append(interactive, document.createTextNode(control.label));
    } else {
      interactive.className = "runtime-control";
      interactive.type = "button";
      interactive.textContent = control.label;
    }
    if (control.description) wrapper.title = control.description;
    interactive.addEventListener(control.kind === "checkbox" ? "change" : "click", async () => {
      interactive.disabled = true;
      try {
        const result = await renderer.dispatch({ type: "control.invoke", target: control.id, payload: {} });
        if (!result.ok) throw new Error(result.diagnostics.map(item => `${item.code}: ${item.message}`).join("\n"));
        if (control.kind === "checkbox") {
          interactive.checked = evaluateMathDocument(result.document).entities.get(control.action.target)?.value === true;
        }
        status.textContent = clockSummary(renderer) || `已执行：${control.label}`;
      } finally {
        interactive.disabled = false;
      }
    });
    buttons.append(wrapper);
  }
  status.textContent = clockSummary(renderer) || "所有按钮动作均来自 MathDocument.controls。";
  renderer.subscribe(event => {
    if (event.type.startsWith("clock.")) status.textContent = clockSummary(renderer);
  });
}

async function fetchCase(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`加载 ${path} 失败：HTTP ${response.status}`);
  return response.json();
}

async function replayCase(caseSpec) {
  let documentValue = structuredClone(caseSpec.inputs.initialDocument);
  for (const changeSet of caseSpec.trace.changeSets) {
    const result = await runtime.apply(documentValue, changeSet);
    if (!result.ok || !result.document) {
      const details = (result.diagnostics ?? []).map(item => `${item.code}: ${item.message}`).join("\n");
      throw new Error(`${caseSpec.caseId} 重放失败\n${details}`);
    }
    documentValue = result.document;
  }
  return documentValue;
}

function caseStages(caseSpec) {
  return caseSpec.inputs.initialDocument.activities?.flatMap(activity => activity.stages ?? []) ?? [];
}

function updateStagePanel(caseSpec, card, stageIndex) {
  const stages = caseStages(caseSpec);
  if (stages.length === 0) return;
  const boundedIndex = Math.max(0, Math.min(stageIndex, stages.length - 1));
  const stage = stages[boundedIndex];
  card.dataset.stageIndex = String(boundedIndex);
  card.dataset.stageId = stage.id;
  card.querySelectorAll(".stage-tab").forEach((button, index) => {
    button.setAttribute("aria-selected", String(index === boundedIndex));
    button.tabIndex = index === boundedIndex ? 0 : -1;
  });
  card.querySelector(".stage-previous").disabled = boundedIndex === 0;
  card.querySelector(".stage-next").disabled = boundedIndex === stages.length - 1;
  card.querySelector(".stage-narration").textContent = `${boundedIndex + 1}/${stages.length} · ${stage.narration ?? stage.id}`;
}

async function setCaseStage(caseSpec, card, stageIndex) {
  const stages = caseStages(caseSpec);
  const stage = stages[stageIndex];
  const renderer = rendererByCase.get(caseSpec.caseId);
  if (!stage || !renderer) return false;
  const beforeRevision = renderer.getDocument().revision;
  const result = await renderer.dispatch({ type: "stage.set", payload: { stageId: stage.id } });
  if (!result.ok || result.revisionChanged || renderer.getDocument().revision !== beforeRevision) {
    throw new Error(`${caseSpec.caseId} 阶段切换失败或意外修改了文档 revision`);
  }
  updateStagePanel(caseSpec, card, stageIndex);
  return true;
}

function setupStagePanel(caseSpec, card) {
  const stages = caseStages(caseSpec);
  if (stages.length === 0) return;
  const panel = card.querySelector(".stage-panel");
  const tabs = card.querySelector(".stage-tabs");
  panel.hidden = false;
  stages.forEach((stage, index) => {
    const button = document.createElement("button");
    button.className = "stage-tab";
    button.type = "button";
    button.role = "tab";
    button.textContent = `${index + 1} ${STAGE_LABELS[stage.id] ?? stage.id}`;
    button.addEventListener("click", () => setCaseStage(caseSpec, card, index));
    tabs.append(button);
  });
  card.querySelector(".stage-previous").addEventListener("click", () => {
    setCaseStage(caseSpec, card, Number(card.dataset.stageIndex ?? 0) - 1);
  });
  card.querySelector(".stage-next").addEventListener("click", () => {
    setCaseStage(caseSpec, card, Number(card.dataset.stageIndex ?? 0) + 1);
  });
  updateStagePanel(caseSpec, card, 0);
}

async function mountCase(caseSpec, card, documentValue) {
  const previous = rendererByCase.get(caseSpec.caseId);
  if (previous) await previous.destroy();
  const host = card.querySelector(".case-board");
  const stages = caseStages(caseSpec);
  const stageIndex = Math.max(0, Math.min(Number(card.dataset.stageIndex ?? 0), stages.length - 1));
  const renderer = await mountMathRenderer(host, structuredClone(documentValue), {
    stageId: stages[stageIndex]?.id
  });
  rendererByCase.set(caseSpec.caseId, renderer);
  setupRuntimeControls(card, renderer);
  if (stages.length > 0) updateStagePanel(caseSpec, card, stageIndex);
  card.querySelector(".loading-mask").hidden = true;
  card.dataset.mounted = "true";
}

function createCard(caseSpec) {
  const card = template.content.firstElementChild.cloneNode(true);
  const number = caseNumber(caseSpec.caseId);
  card.dataset.caseId = caseSpec.caseId;
  card.dataset.status = caseSpec.status;
  card.dataset.caseType = caseSpec.caseType;
  card.querySelector(".case-id").textContent = `${caseSpec.caseId.startsWith("research-") ? "RESEARCH" : "CASE"} ${number} · ${caseSpec.caseType}`;
  card.querySelector(".case-title").textContent = caseSpec.title;

  const chip = card.querySelector(".status-chip");
  chip.textContent = caseSpec.status === "accepted" ? "ACCEPTED" : "EXPECTED UNSUPPORTED";
  chip.classList.add(caseSpec.status === "accepted" ? "is-accepted" : "is-unsupported");

  card.querySelector(".case-meta").textContent = `${sourceLabel(caseSpec)} · ${caseSpec.difficulty}`;
  card.querySelector(".interaction-hint").textContent = interactionLabel(caseSpec);
  card.querySelector(".capabilities").textContent = caseSpec.requiredCapabilities.join(" · ");
  setupStagePanel(caseSpec, card);

  if (caseSpec.status === "expected-unsupported") {
    const diagnostic = card.querySelector(".diagnostic");
    const failure = caseSpec.expected.expectedFailure;
    diagnostic.hidden = false;
    diagnostic.innerHTML = `<strong>${failure?.code ?? "CAPABILITY_GAP"}</strong><span>${failure?.message ?? "当前引擎尚未覆盖此案例意图。"}</span>`;
  }

  card.querySelector(".reset-button").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    card.querySelector(".loading-mask").hidden = false;
    card.querySelector(".loading-mask").textContent = "正在重置…";
    try {
      await mountCase(caseSpec, card, replayedDocumentByCase.get(caseSpec.caseId));
    } finally {
      button.disabled = false;
      card.querySelector(".loading-mask").textContent = "重放并挂载中…";
    }
  });
  return card;
}

function updateCounts(cases) {
  const accepted = cases.filter(item => item.status === "accepted").length;
  document.querySelector("#total-count").textContent = String(cases.length);
  document.querySelector("#accepted-count").textContent = String(accepted);
  document.querySelector("#unsupported-count").textContent = String(cases.length - accepted);
}

function applyFilter(status) {
  const cards = [...gallery.querySelectorAll(".case-card")];
  let matched = 0;
  for (const card of cards) {
    const matches = status === "all" || card.dataset.status === status;
    card.classList.toggle("is-filtered", !matches);
    card.setAttribute("aria-hidden", String(!matches));
    if (matches) matched += 1;
  }
  document.querySelector("#visible-count").textContent = `当前聚焦 ${matched} / ${cards.length} 个案例`;
}

document.querySelector("#status-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  document.querySelectorAll(".filter").forEach(item => item.classList.toggle("active", item === button));
  applyFilter(button.dataset.filter);
});

async function main() {
  const cases = await Promise.all(CASE_PATHS.map(fetchCase));
  updateCounts(cases);

  for (const caseSpec of cases) {
    const card = createCard(caseSpec);
    gallery.append(card);
    const documentValue = await replayCase(caseSpec);
    replayedDocumentByCase.set(caseSpec.caseId, documentValue);
    await mountCase(caseSpec, card, documentValue);
  }

  window.__famtutorGallery = {
    cases,
    rendererByCase,
    replayedDocumentByCase,
    applyFilter,
    setCaseStage: async (caseId, stageIndex) => {
      const caseSpec = cases.find(item => item.caseId === caseId);
      const card = document.querySelector(`[data-case-id="${caseId}"]`);
      if (!caseSpec || !card) return false;
      return setCaseStage(caseSpec, card, stageIndex);
    }
  };
  applyFilter("all");
  document.body.dataset.status = "ready";
}

main().catch(error => {
  console.error(error);
  errorPanel.hidden = false;
  errorPanel.textContent = error?.stack ?? String(error);
  document.body.dataset.status = "failed";
  document.querySelector("#visible-count").textContent = "Gallery 加载失败";
});
