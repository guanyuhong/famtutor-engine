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
  11: [-1, 5, 7, -1], 12: [-1, 4, 7, -1], 13: [-1, 5, 8, -1], 14: [-1, 5, 6, -1],
  15: [-1, 6, 8, -1], 16: [-2, 4, 7, -1], 17: [-2, 5, 8, -1], 18: [-1, 4, 7, -1],
  22: [-1, 3, 3, -0.8], 23: [-1, 4, 10, -1], 24: [-1, 4, 6, -1], 25: [-1, 4, 11, -1],
  26: [-4, 4, 4, -4], 27: [-1, 4, 11, -1], 28: [-1, 4, 6, -4], 29: [-3, 4, 11, -1],
  30: [-1, 5.5, 7, -1], 31: [-7, 4, 10, -1], 32: [-2.5, 4, 10.5, -1.5],
  33: [-7.5, 4.5, 7.5, -4.5], 34: [-5, 7.5, 7, -1], 35: [-7, 7.5, 8, -1]
};

const input = id => ({ ref: id });

function builder() {
  const operations = [];
  const ids = [];
  const points = [];
  const add = (command, outputs, inputs = [], params, extra = {}) => {
    const descriptors = outputs.map(value => typeof value === "string" ? { id: value } : value);
    descriptors.forEach(value => {
      ids.push(value.id);
      if (command.startsWith("point.")) points.push(value.id);
    });
    const operation = { op: "construct", command, outputs: descriptors, ...extra };
    if (inputs.length) operation.inputs = inputs.map(input);
    if (params !== undefined) operation.params = params;
    operations.push(operation);
    return descriptors.map(value => value.id);
  };
  const p = (id, x, y, options = {}) => add("point.free", [{ id, label: options.label ?? id, visible: options.visible }], [], { coords: [x, y] }, options.role ? { role: options.role } : {})[0];
  const seg = (id, a, b, label) => add("segment.through_points", [{ id, label }], [a, b])[0];
  const line = (id, a, b) => add("line.through_points", [id], [a, b])[0];
  const ray = (id, a, b) => add("ray.from_points", [id], [a, b])[0];
  const mid = (id, a, b, visible = false) => add("point.midpoint", [{ id, label: id, visible }], [a, b])[0];
  const polygon = (id, vertices, label) => add("polygon.vertices", [{ id, label }], vertices)[0];
  const angle = (id, a, o, b, label, radius = 0.48, labelRadius) => add("angle.three_points", [{ id, label }], [a, o, b], labelRadius ? { radius, labelRadius } : { radius })[0];
  const circle = (id, center, radius) => add("circle.center_radius", [id], [center], { radius })[0];
  const circleThrough = (id, center, through) => add("circle.through_points", [id], [center, through])[0];
  const circlesMeet = (low, high, first, second, hiddenLow = true) => add("point.intersection_circle_circle", [{ id: low, label: low, visible: !hiddenLow }, { id: high, label: high }], [first, second]);
  const linesMeet = (id, first, second, label = id) => add("point.intersection_line_line", [{ id, label }], [first, second])[0];
  const projection = (id, point, path, label = id) => add("point.projection", [{ id, label }], [point, path])[0];
  const right = (id, angleId, size = 0.28) => add("marker.right_angle", [id], [angleId], { size })[0];
  const tick = (id, segmentId, size = 0.32, position) => add("marker.segment_tick", [id], [segmentId], position === undefined ? { size } : { size, position })[0];
  const chevron = (prefix, anchor, path, size = 0.42) => add("marker.parallel_chevron", [`${prefix}1`, `${prefix}2`], [anchor, path], { size });
  const style = (targets, value) => operations.push({ op: "set_style", targets, style: value });
  const assertion = (id, predicate, refs, message, extra = {}) => operations.push({
    op: "add_assertion",
    assertion: { id, predicate, arguments: refs.map(input), tolerance: 1e-6, message, ...extra }
  });
  const interaction = (target, permissions, extra = {}) => operations.push({
    op: "set_interaction", policy: { target, permissions, ...extra }
  });
  const finish = () => {
    if (points.length) style(points, { pointSize: 5, fontSize: 15, labelPlacement: "auto" });
    return { operations, ids, points };
  };
  return { add, p, seg, line, ray, mid, polygon, angle, circle, circleThrough, circlesMeet, linesMeet, projection, right, tick, chevron, style, assertion, interaction, finish };
}

function register(meta, build) {
  const b = builder();
  const result = build(b);
  const built = b.finish();
  CASES.push({ ...meta, ...result, operations: built.operations, entityIds: built.ids });
}

function standardStyles(b, primary = [], auxiliary = [], annotations = []) {
  if (primary.length) b.style(primary, { stroke: "#15365F", strokeWidth: 2.3 });
  if (auxiliary.length) b.style(auxiliary, { stroke: "#2E6DB2", strokeWidth: 1.8, dash: "dashed", opacity: 0.8 });
  if (annotations.length) b.style(annotations, { stroke: "#0E8378", fill: "#DCEFE7", strokeWidth: 1.7, fillOpacity: 0.14 });
}

register({ number: 11, slug: "condition-conclusion", title: "命题的条件与结论", section: "1.2 定义与命题", pages: [10, 11], figures: [], knowledge: ["definition", "statement-condition-conclusion"], objective: "把几何命题改写成‘如果……那么……’，并区分条件与结论。", type: "demonstration", difficulty: "introductory" }, b => {
  b.p("A", 0, 4); b.p("B", 0, 0); b.p("C", 6, 0); b.p("D", 6, 4); b.p("O", 3, 2);
  const AC = b.seg("AC", "A", "C"); const BD = b.seg("BD", "B", "D");
  const left = b.angle("angleAOB", "A", "O", "B", "∠1", 0.58, 0.95);
  const right = b.angle("angleCOD", "C", "O", "D", "∠2", 0.58, 0.95);
  b.assertion("vertical-angles", "equal_angle", [left, right], "对顶角相等。", { requiredMethod: "numeric" });
  standardStyles(b, [AC, BD], [], [left, right]);
  return { capabilities: ["angle.three_points", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "statement", narration: "命题是对事情作出判断的句子。观察两条相交直线形成的对顶角。", reveal: ["A", "B", "C", "D", "O", AC, BD] },
    { id: "condition", narration: "条件：两个角是对顶角。改写时放在‘如果’之后。", reveal: ["A", "B", "C", "D", "O", AC, BD, left, right] },
    { id: "conclusion", narration: "结论：这两个角相等。完整命题是：如果两个角是对顶角，那么这两个角相等。", reveal: ["A", "B", "C", "D", "O", AC, BD, left, right], focus: [left, right] }
  ] };
});

register({ number: 12, slug: "counterexample", title: "用反例判断假命题", section: "1.2 定义与命题", pages: [13, 14], figures: ["1-10"], knowledge: ["true-false-statement", "counterexample"], objective: "识别满足命题条件但不满足结论的反例，理解反例为何能否定命题。", type: "demonstration", difficulty: "intermediate" }, b => {
  b.p("A", 1, 3); b.p("D", 5, 3); b.p("B", 0, 0); b.p("C", 6, 0);
  const AB = b.seg("AB", "A", "B"); const AD = b.seg("AD", "A", "D"); const DC = b.seg("DC", "D", "C"); const BC = b.seg("BC", "B", "C");
  b.p("M1", 3, 3, { visible: false }); b.p("M2", 3, 0, { visible: false });
  const c1 = b.chevron("topParallel", "M1", AD); const c2 = b.chevron("bottomParallel", "M2", BC);
  const t1 = b.tick("tickAB", AB); const t2 = b.tick("tickDC", DC);
  b.assertion("one-pair-parallel", "parallel", [AD, BC], "AD 与 BC 平行。", { requiredMethod: "numeric" });
  b.assertion("legs-equal", "equal_length", [AB, DC], "AB 与 DC 相等。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, AD, DC, BC], [], [...c1, ...c2, t1, t2]);
  return { capabilities: ["marker.parallel_chevron", "marker.segment_tick", "assertion.parallel", "activity.stages"], stages: [
    { id: "claim", narration: "待判断：一组对边平行、另一组对边相等的四边形是平行四边形。", reveal: ["A", "B", "C", "D", AB, AD, DC, BC] },
    { id: "conditions", narration: "这个等腰梯形满足 AD∥BC 且 AB=DC，完整满足命题条件。", reveal: ["A", "B", "C", "D", AB, AD, DC, BC, ...c1, ...c2, t1, t2] },
    { id: "counterexample", narration: "但 AD 与 BC 长度不同，另两边也不平行，它不是平行四边形；一个反例即可说明原命题是假命题。", reveal: ["A", "B", "C", "D", AB, AD, DC, BC, ...c1, ...c2, t1, t2], focus: [AD, BC] }
  ] };
});

register({ number: 13, slug: "original-converse", title: "原命题与逆命题", section: "1.2 定义与命题", pages: [14, 15], figures: [], knowledge: ["original-and-converse", "parallel-lines"], objective: "交换条件与结论形成逆命题，并在同一几何图中核对两种推理方向。", type: "demonstration", difficulty: "intermediate" }, b => {
  b.p("A", 0, 4); b.p("B", 7, 4); b.p("C", 0, 0); b.p("D", 7, 0); b.p("E", 2, 4); b.p("F", 4.5, 0);
  const AB = b.seg("AB", "A", "B"); const CD = b.seg("CD", "C", "D"); const EF = b.seg("EF", "E", "F");
  const a1 = b.angle("alternate1", "B", "E", "F", "∠1", 0.52, 0.9);
  const a2 = b.angle("alternate2", "E", "F", "C", "∠2", 0.52, 0.9);
  b.mid("M1", "A", "B"); b.mid("M2", "C", "D");
  const c1 = b.chevron("parallelAB", "M1", AB); const c2 = b.chevron("parallelCD", "M2", CD);
  b.assertion("parallel-lines", "parallel", [AB, CD], "AB∥CD。", { requiredMethod: "numeric" });
  b.assertion("alternate-equal", "equal_angle", [a1, a2], "内错角相等。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, CD, EF], [], [a1, a2, ...c1, ...c2]);
  return { capabilities: ["marker.parallel_chevron", "angle.three_points", "assertion.parallel", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "original", narration: "原命题：如果两条直线平行，那么内错角相等。条件是 AB∥CD，结论是 ∠1=∠2。", reveal: ["A", "B", "C", "D", "E", "F", AB, CD, EF, ...c1, ...c2, a1, a2] },
    { id: "swap", narration: "交换条件和结论，得到逆命题：如果内错角相等，那么两条直线平行。", reveal: ["A", "B", "C", "D", "E", "F", AB, CD, EF, a1, a2] },
    { id: "converse", narration: "本例中逆命题也是真命题；∠1=∠2 可作为判定 AB∥CD 的依据。", reveal: ["A", "B", "C", "D", "E", "F", AB, CD, EF, ...c1, ...c2, a1, a2], focus: [...c1, ...c2] }
  ] };
});

register({ number: 14, slug: "definition-right-triangle", title: "定义中的必要条件", section: "1.2 定义与命题", pages: [10, 11], figures: [], knowledge: ["definition", "right-triangle"], objective: "从‘有一个角是直角的三角形’理解定义同时限定对象类别和关键性质。", type: "demonstration", difficulty: "introductory" }, b => {
  b.p("A", 0, 0); b.p("B", 5, 0); b.p("C", 0, 4);
  const AB = b.seg("AB", "A", "B"); const AC = b.seg("AC", "A", "C"); const BC = b.seg("BC", "B", "C"); const triangle = b.polygon("triangleABC", ["A", "B", "C"]);
  const angleA = b.angle("angleA", "B", "A", "C", "90°", 0.5, 0.95); const mark = b.right("rightA", angleA, 0.35);
  b.assertion("right-condition", "perpendicular", [AB, AC], "AB⊥AC。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, AC, BC, triangle], [], [angleA, mark]);
  b.style([triangle], { stroke: "#15365F", fill: "#DCEFE7", fillOpacity: 0.2, strokeWidth: 2.3, labelVisible: false });
  return { capabilities: ["polygon.vertices", "marker.right_angle", "assertion.perpendicular", "activity.stages"], stages: [
    { id: "object", narration: "定义先限定对象：它必须是三角形。", reveal: ["A", "B", "C", AB, AC, BC, triangle] },
    { id: "property", narration: "再限定关键性质：三个内角中至少有一个是直角。", reveal: ["A", "B", "C", AB, AC, BC, triangle, angleA, mark] },
    { id: "definition", narration: "有一个角是直角的三角形叫做直角三角形；缺少‘三角形’或‘直角’任一条件都不能使用这个定义。", reveal: ["A", "B", "C", AB, AC, BC, triangle, angleA, mark], focus: [angleA, mark] }
  ] };
});

register({ number: 15, slug: "proof-format-angle-bisector", title: "由平行线证明角平分线", section: "1.3 证明", pages: [16], figures: ["1-12"], knowledge: ["proof", "angle-bisector", "parallel-angle-relations"], objective: "按已知、依据、中间结论、最终结论组织图 1-12 的证明。", type: "guided-construction", difficulty: "intermediate" }, b => {
  b.p("B", 0, 0); b.p("C", 7.333333, 0); b.p("A", 3, 5.196152); b.p("D", 1.65, 2.857884); b.p("E", 4.95, 2.857884);
  const BA = b.seg("BA", "B", "A"); const BC = b.seg("BC", "B", "C"); const AC = b.seg("AC", "A", "C"); const DE = b.seg("DE", "D", "E"); const BE = b.seg("BE", "B", "E");
  const angle1 = b.angle("angle1", "D", "B", "E", "∠1", 0.48, 0.88);
  const angle2 = b.angle("angle2", "E", "B", "C", "∠2", 0.7, 1.08);
  const angleE = b.angle("angleE", "D", "E", "B", "∠E", 0.48, 0.9);
  b.mid("MDE", "D", "E"); b.mid("MBC", "B", "C"); const c1 = b.chevron("markDE", "MDE", DE); const c2 = b.chevron("markBC", "MBC", BC);
  b.assertion("de-bc", "parallel", [DE, BC], "DE∥BC。", { requiredMethod: "numeric" });
  b.assertion("given-angle", "equal_angle", [angle1, angleE], "∠1=∠E。", { requiredMethod: "numeric" });
  b.assertion("bisected", "equal_angle", [angle1, angle2], "∠1=∠2。", { requiredMethod: "numeric" });
  standardStyles(b, [BA, BC, AC, BE], [DE], [angle1, angle2, angleE, ...c1, ...c2]);
  return { capabilities: ["marker.parallel_chevron", "angle.three_points", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "given", narration: "已知：DE∥BC，∠1=∠E。求证：BE 平分 ∠ABC。", reveal: ["A", "B", "C", "D", "E", BA, BC, AC, DE, BE, ...c1, ...c2, angle1, angleE] },
    { id: "derive", narration: "由 DE∥BC，得 ∠2=∠E（两直线平行，内错角相等）；再与 ∠1=∠E 结合，得到 ∠1=∠2。", reveal: ["A", "B", "C", "D", "E", BA, BC, AC, DE, BE, angle1, angle2, angleE] },
    { id: "conclude", narration: "因为 ∠1=∠2，所以 BE 平分 ∠ABC（角平分线的定义）。", reveal: ["A", "B", "C", "D", "E", BA, BC, AC, DE, BE, angle1, angle2], focus: [BE, angle1, angle2] }
  ] };
});

register({ number: 16, slug: "parallel-bisectors-right-angle", title: "平行线角平分线组成直角", section: "1.3 证明", pages: [17], figures: ["1-13"], knowledge: ["proof", "parallel-lines", "angle-bisector"], objective: "把两个角平分线关系与同旁内角互补组合，推出 ∠PEF+∠PFE=90°。", type: "guided-construction", difficulty: "advanced" }, b => {
  b.p("A", -1, 3); b.p("E", 0, 3); b.p("B", 5, 3); b.p("C", -1, 0); b.p("F", 2, 0); b.p("D", 6, 0); b.p("P", 2.802776, 1.5);
  const AB = b.seg("AB", "A", "B"); const CD = b.seg("CD", "C", "D"); const EF = b.seg("EF", "E", "F"); const EP = b.seg("EP", "E", "P"); const FP = b.seg("FP", "F", "P");
  const e1 = b.angle("angleBEP", "B", "E", "P", "", 0.42); const e2 = b.angle("anglePEF", "P", "E", "F", "", 0.62);
  const f1 = b.angle("angleDFP", "D", "F", "P", "", 0.42); const f2 = b.angle("anglePFE", "P", "F", "E", "", 0.62);
  b.mid("MAB", "A", "B"); b.mid("MCD", "C", "D"); const c1 = b.chevron("markAB", "MAB", AB); const c2 = b.chevron("markCD", "MCD", CD);
  b.assertion("parallel", "parallel", [AB, CD], "AB∥CD。", { requiredMethod: "numeric" });
  b.assertion("ep-bisects", "equal_angle", [e1, e2], "EP 平分 ∠BEF。", { requiredMethod: "numeric" });
  b.assertion("fp-bisects", "equal_angle", [f1, f2], "FP 平分 ∠DFE。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, CD, EF], [EP, FP], [e1, e2, f1, f2, ...c1, ...c2]);
  return { capabilities: ["marker.parallel_chevron", "angle.three_points", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "given", narration: "图 1-13：AB∥CD，EP、FP 分别平分 ∠BEF、∠DFE。", reveal: ["A", "B", "C", "D", "E", "F", "P", AB, CD, EF, EP, FP, ...c1, ...c2] },
    { id: "bisectors", narration: "角平分线给出 ∠PEF=½∠BEF，∠PFE=½∠DFE。", reveal: ["E", "F", "P", AB, CD, EF, EP, FP, e1, e2, f1, f2] },
    { id: "conclude", narration: "AB∥CD，所以 ∠BEF+∠DFE=180°；取一半得到 ∠PEF+∠PFE=90°。", reveal: ["E", "F", "P", AB, CD, EF, EP, FP, e2, f2], focus: [e2, f2] }
  ] };
});

register({ number: 17, slug: "triangle-angle-sum-proof", title: "三角形内角和的证明", section: "1.3 证明", pages: [18], figures: ["1-14", "1-15"], knowledge: ["proof", "triangle-angle-sum", "exterior-angle"], objective: "经过顶点 A 作 MN∥BC，把三个内角转移到平角上完成证明。", type: "guided-construction", difficulty: "intermediate" }, b => {
  b.p("B", 0, 0); b.p("C", 6, 0); b.p("A", 2.3, 4); b.p("M", -1, 4); b.p("N", 7, 4);
  const AB = b.seg("AB", "A", "B"); const AC = b.seg("AC", "A", "C"); const BC = b.seg("BC", "B", "C"); const MN = b.seg("MN", "M", "N");
  const a = b.angle("angleA", "B", "A", "C", "∠A", 0.55, 1.0); const bb = b.angle("angleB", "A", "B", "C", "∠B", 0.5, 0.92); const cc = b.angle("angleC", "B", "C", "A", "∠C", 0.5, 0.92);
  const mab = b.angle("angleMAB", "M", "A", "B", "", 0.75); const nac = b.angle("angleNAC", "C", "A", "N", "", 0.75);
  b.mid("MMN", "M", "N"); b.mid("MBC", "B", "C"); const c1 = b.chevron("markMN", "MMN", MN); const c2 = b.chevron("markBC", "MBC", BC);
  b.assertion("mn-bc", "parallel", [MN, BC], "MN∥BC。", { requiredMethod: "numeric" });
  b.assertion("b-transfer", "equal_angle", [bb, mab], "∠B=∠MAB。", { requiredMethod: "numeric" });
  b.assertion("c-transfer", "equal_angle", [cc, nac], "∠C=∠NAC。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, AC, BC], [MN], [a, bb, cc, mab, nac, ...c1, ...c2]);
  return { capabilities: ["line.parallel_through", "marker.parallel_chevron", "angle.three_points", "activity.stages"], stages: [
    { id: "given", narration: "已知 △ABC 的三个内角，目标是证明它们的和等于 180°。", reveal: ["A", "B", "C", AB, AC, BC, a, bb, cc] },
    { id: "construct", narration: "过点 A 作直线 MN∥BC，这是证明中的辅助线。", reveal: ["A", "B", "C", "M", "N", AB, AC, BC, MN, ...c1, ...c2] },
    { id: "derive", narration: "由平行线关系，∠B=∠MAB，∠C=∠NAC。", reveal: ["A", "B", "C", "M", "N", AB, AC, BC, MN, bb, cc, mab, nac] },
    { id: "conclude", narration: "∠MAB、∠A、∠NAC 在直线 MN 上组成平角，因此 ∠A+∠B+∠C=180°。", reveal: ["A", "B", "C", "M", "N", AB, AC, BC, MN, a, mab, nac], focus: [a, mab, nac] }
  ] };
});

register({ number: 18, slug: "auxiliary-line-parallel-proof", title: "添加辅助线证明平行", section: "1.3 证明", pages: [19], figures: ["1-16"], knowledge: ["proof", "triangle-exterior-angle", "parallel-line-criterion"], objective: "延长 BC 交 DE 于 F，用三角形外角关系把已知角条件转化为内错角相等。", type: "guided-construction", difficulty: "advanced" }, b => {
  b.p("B", 0, 3); b.p("A", 6, 3); b.p("D", 0, 0); b.p("E", 6, 0); b.p("C", 1.5, 1.5); b.p("F", 3, 0);
  const AB = b.seg("AB", "B", "A"); const DE = b.seg("DE", "D", "E"); const BC = b.seg("BC", "B", "C"); const CD = b.seg("CD", "C", "D"); const CF = b.seg("CF", "C", "F");
  const angleB = b.angle("angleB", "A", "B", "C", "∠B", 0.48, 0.86); const angleD = b.angle("angleD", "C", "D", "E", "∠D", 0.48, 0.86); const angleBCD = b.angle("angleBCD", "B", "C", "D", "∠BCD", 0.55, 1.0); const angleCFD = b.angle("angleCFD", "C", "F", "D", "∠CFD", 0.48, 0.86);
  b.mid("MAB", "B", "A"); b.mid("MDE", "D", "E"); const c1 = b.chevron("markAB", "MAB", AB); const c2 = b.chevron("markDE", "MDE", DE);
  b.assertion("b-cfd", "equal_angle", [angleB, angleCFD], "∠B=∠CFD。", { requiredMethod: "numeric" });
  b.assertion("ab-de", "parallel", [AB, DE], "AB∥DE。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, DE, BC, CD], [CF], [angleB, angleD, angleBCD, angleCFD, ...c1, ...c2]);
  return { capabilities: ["ray.from_points", "angle.three_points", "marker.parallel_chevron", "assertion.parallel", "activity.stages"], stages: [
    { id: "given", narration: "已知 ∠B+∠D=∠BCD，求证 AB∥DE。", reveal: ["A", "B", "C", "D", "E", AB, DE, BC, CD, angleB, angleD, angleBCD] },
    { id: "construct", narration: "延长 BC 与 DE 交于 F；辅助线必须写入证明过程。", reveal: ["A", "B", "C", "D", "E", "F", AB, DE, BC, CD, CF] },
    { id: "derive", narration: "由三角形外角定理，∠BCD=∠D+∠CFD；结合已知可得 ∠B=∠CFD。", reveal: ["B", "C", "D", "F", AB, DE, BC, CD, CF, angleB, angleD, angleBCD, angleCFD] },
    { id: "conclude", narration: "∠B 与 ∠CFD 是内错角且相等，所以 AB∥DE。", reveal: ["A", "B", "C", "D", "E", "F", AB, DE, BC, CD, CF, angleB, angleCFD, ...c1, ...c2], focus: [...c1, ...c2] }
  ] };
});

register({ number: 22, slug: "sss-construct-triangle", title: "按三边作三角形", section: "1.5 三角形全等的判定", pages: [25], figures: ["1-21"], knowledge: ["sss", "ruler-compass-construction"], objective: "用两个定长圆的交点确定第三个顶点，观察三边确定三角形。", type: "guided-construction", difficulty: "introductory" }, b => {
  b.p("E", 0, 0); b.p("F", 1.3, 0);
  const EF = b.seg("EF", "E", "F", "1.3"); const circleE = b.circle("circleE", "E", 2.5); const circleF = b.circle("circleF", "F", 1.9);
  b.circlesMeet("Dlow", "D", circleE, circleF);
  const ED = b.seg("ED", "E", "D", "2.5"); const FD = b.seg("FD", "F", "D", "1.9"); const triangle = b.polygon("triangleDEF", ["D", "E", "F"]);
  b.assertion("d-on-e-circle", "point_on", ["D", circleE], "DE=2.5。", { requiredMethod: "numeric" });
  b.assertion("d-on-f-circle", "point_on", ["D", circleF], "DF=1.9。", { requiredMethod: "numeric" });
  standardStyles(b, [EF, ED, FD, triangle], [circleE, circleF]); b.style([triangle], { stroke: "#15365F", fill: "#DCEFE7", fillOpacity: 0.18, strokeWidth: 2.3, labelVisible: false });
  return { capabilities: ["circle.center_radius", "point.intersection_circle_circle", "polygon.vertices", "assertion.point_on", "activity.stages"], stages: [
    { id: "base", narration: "先画线段 EF=1.3。", reveal: ["E", "F", EF] },
    { id: "arcs", narration: "分别以 E、F 为圆心，以 2.5、1.9 为半径画弧。", reveal: ["E", "F", EF, circleE, circleF] },
    { id: "intersection", narration: "两弧交于 D；交点同时满足 DE=2.5、DF=1.9。", reveal: ["D", "E", "F", EF, circleE, circleF] },
    { id: "conclude", narration: "连接 DE、DF，得到满足三条给定边的 △DEF。镜像位置 D′ 形成的三角形与它全等。", reveal: ["D", "E", "F", EF, ED, FD, triangle], focus: [triangle] }
  ] };
});

register({ number: 23, slug: "sss-stability", title: "三角形的稳定性与 SSS", section: "1.5 三角形全等的判定", pages: [25, 26], figures: ["1-22", "1-23", "1-24"], knowledge: ["sss", "triangle-stability"], objective: "比较只固定两边时的可变形状态与三边固定后的唯一形状。", type: "exploration", difficulty: "introductory" }, b => {
  b.p("A", 0, 0); b.p("B", 3.2, 0); b.p("C1", 1, 2.8); b.p("C2", 2.1, 2.1);
  const AB = b.seg("AB", "A", "B"); const AC1 = b.seg("AC1", "A", "C1"); const BC1 = b.seg("BC1", "B", "C1"); const AC2 = b.seg("AC2", "A", "C2"); const BC2 = b.seg("BC2", "B", "C2");
  b.p("D", 6, 0); b.p("E", 9.2, 0); b.p("F", 7, 2.8); const DE = b.seg("DE", "D", "E"); const DF = b.seg("DF", "D", "F"); const EF = b.seg("EF", "E", "F"); const locked = b.polygon("lockedTriangle", ["D", "E", "F"]);
  b.assertion("bases-equal", "equal_length", [AB, DE], "两组底边等长。", { requiredMethod: "numeric" });
  b.assertion("left-bars-equal", "equal_length", [AC1, DF], "对应木条等长。", { requiredMethod: "numeric" });
  b.assertion("right-bars-equal", "equal_length", [BC1, EF], "第三条木条锁定形状。", { requiredMethod: "numeric" });
  const ticks = [b.tick("tickAB", AB), b.tick("tickDE", DE), b.tick("tickAC1", AC1, 0.32, 0.48), b.tick("tickDF", DF, 0.32, 0.48), b.tick("tickBC1a", BC1, 0.32, 0.46), b.tick("tickBC1b", BC1, 0.32, 0.54), b.tick("tickEFa", EF, 0.32, 0.46), b.tick("tickEFb", EF, 0.32, 0.54)];
  standardStyles(b, [AB, AC1, BC1, AC2, BC2, DE, DF, EF, locked], [], ticks); b.style([AC2, BC2], { stroke: "#EF6C22", strokeWidth: 1.9, dash: "dashed", opacity: 0.7 });
  return { capabilities: ["marker.segment_tick", "assertion.equal_length", "activity.stages"], stages: [
    { id: "hinge", narration: "只固定两根木条的一端，另两个端点之间没有连接，夹角可以改变。", reveal: ["A", "B", "C1", "C2", AB, AC1, BC1, AC2, BC2] },
    { id: "compare", narration: "同样的两边可以形成不同夹角，因此只给两边不能唯一确定三角形。", reveal: ["A", "B", "C1", "C2", AB, AC1, BC1, AC2, BC2], focus: [AC2, BC2] },
    { id: "locked", narration: "加入第三根木条后，三边长度全部固定，形状和大小也随之确定；这就是三角形的稳定性。", reveal: ["D", "E", "F", DE, DF, EF, locked, ...ticks], focus: [locked] }
  ] };
});

register({ number: 24, slug: "sss-proof-application", title: "SSS 判定的证明应用", section: "1.5 三角形全等的判定", pages: [26], figures: ["1-25"], knowledge: ["sss", "congruence-proof"], objective: "在四边形中识别两组已知等边和一条公共边，用 SSS 证明两三角形全等。", type: "guided-construction", difficulty: "intermediate" }, b => {
  b.p("A", 0, 0); b.p("B", 4, 0); b.p("C", 5, 3); b.p("D", 1, 3);
  const AB = b.seg("AB", "A", "B"); const BC = b.seg("BC", "B", "C"); const CD = b.seg("CD", "C", "D"); const DA = b.seg("DA", "D", "A"); const DB = b.seg("DB", "D", "B");
  const angleA = b.angle("angleA", "D", "A", "B", "∠A", 0.45, 0.85); const angleC = b.angle("angleC", "B", "C", "D", "∠C", 0.45, 0.85);
  const ticks = [b.tick("tickAB", AB), b.tick("tickCD", CD), b.tick("tickAD1", DA, 0.32, 0.46), b.tick("tickAD2", DA, 0.32, 0.54), b.tick("tickBC1", BC, 0.32, 0.46), b.tick("tickBC2", BC, 0.32, 0.54)];
  b.assertion("ab-cd", "equal_length", [AB, CD], "AB=CD。", { requiredMethod: "numeric" }); b.assertion("ad-cb", "equal_length", [DA, BC], "AD=CB。", { requiredMethod: "numeric" }); b.assertion("angles-equal", "equal_angle", [angleA, angleC], "全等三角形对应角相等。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, BC, CD, DA, DB], [], [...ticks, angleA, angleC]);
  return { capabilities: ["marker.segment_tick", "assertion.equal_length", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "given", narration: "图 1-25：AB=CD，AD=CB，连接公共边 BD。", reveal: ["A", "B", "C", "D", AB, BC, CD, DA, DB, ...ticks] },
    { id: "sss", narration: "在 △ABD 与 △CDB 中，AB=CD、AD=CB、BD=DB，因此两三角形按 SSS 全等。", reveal: ["A", "B", "C", "D", AB, BC, CD, DA, DB, ...ticks], focus: [DB] },
    { id: "conclude", narration: "由全等三角形的对应角相等，得到 ∠A=∠C。", reveal: ["A", "B", "C", "D", AB, BC, CD, DA, DB, angleA, angleC], focus: [angleA, angleC] }
  ] };
});

register({ number: 25, slug: "sas-uniqueness", title: "两边及其夹角确定三角形", section: "1.5 三角形全等的判定", pages: [28], figures: ["1-29", "1-30"], knowledge: ["sas", "triangle-uniqueness"], objective: "固定两边和夹角，验证第三个顶点的位置随之唯一确定。", type: "demonstration", difficulty: "introductory" }, b => {
  b.p("A", 0, 0); b.p("B", 4, 0); b.p("C", 1.5, 3); b.p("A2", 6, 0, { label: "A′" }); b.p("B2", 10, 0, { label: "B′" }); b.p("C2", 7.5, 3, { label: "C′" });
  const AB = b.seg("AB", "A", "B"); const AC = b.seg("AC", "A", "C"); const BC = b.seg("BC", "B", "C"); const A2B2 = b.seg("A2B2", "A2", "B2"); const A2C2 = b.seg("A2C2", "A2", "C2"); const B2C2 = b.seg("B2C2", "B2", "C2");
  const a1 = b.angle("includedA", "B", "A", "C", "", 0.5); const a2 = b.angle("includedA2", "B2", "A2", "C2", "", 0.5);
  const ticks = [b.tick("tickAB", AB), b.tick("tickA2B2", A2B2), b.tick("tickAC1", AC, 0.32, 0.46), b.tick("tickAC2", AC, 0.32, 0.54), b.tick("tickA2C21", A2C2, 0.32, 0.46), b.tick("tickA2C22", A2C2, 0.32, 0.54)];
  b.assertion("side1", "equal_length", [AB, A2B2], "AB=A′B′。", { requiredMethod: "numeric" }); b.assertion("side2", "equal_length", [AC, A2C2], "AC=A′C′。", { requiredMethod: "numeric" }); b.assertion("included", "equal_angle", [a1, a2], "夹角相等。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, AC, BC, A2B2, A2C2, B2C2], [], [...ticks, a1, a2]);
  return { capabilities: ["marker.segment_tick", "angle.three_points", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "two-sides", narration: "先固定两条对应边；若夹角还能改变，三角形尚未唯一。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, A2B2, A2C2, ...ticks] },
    { id: "included-angle", narration: "再固定两边的夹角 ∠A=∠A′，第三个顶点的位置随之确定。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, A2B2, A2C2, ...ticks, a1, a2] },
    { id: "sas", narration: "两边及其夹角对应相等的两个三角形全等，简称 SAS。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, BC, A2B2, A2C2, B2C2, ...ticks, a1, a2], focus: [BC, B2C2] }
  ] };
});

register({ number: 26, slug: "perpendicular-bisector-property", title: "线段垂直平分线的性质", section: "1.5 三角形全等的判定", pages: [29, 30], figures: ["1-32", "1-33"], knowledge: ["perpendicular-bisector", "sas"], objective: "拖动垂直平分线上的点，验证它到线段两端的距离始终相等。", type: "exploration", difficulty: "intermediate" }, b => {
  b.p("A", -3, 0); b.p("B", 3, 0);
  const AB = b.seg("AB", "A", "B"); const O = b.mid("O", "A", "B", true); const AO = b.seg("AO", "A", O); const OB = b.seg("OB", O, "B");
  const bisector = b.add("line.perpendicular_through", ["bisector"], [O, AB])[0];
  b.add("point.on_path", [{ id: "C", label: "C", role: "free" }], [bisector], { initial: [0, 2.8] });
  const CA = b.seg("CA", "C", "A"); const CB = b.seg("CB", "C", "B"); const angleO = b.angle("rightAtO", "A", O, "C", "", 0.38); const rightO = b.right("rightO", angleO, 0.28);
  b.assertion("bisector-perpendicular", "perpendicular", [bisector, AB], "垂直平分线垂直于 AB。", { requiredMethod: "construction" }); b.assertion("equal-distance", "equal_length", [CA, CB], "C 在线段 AB 的垂直平分线上，所以 CA=CB。", { requiredMethod: "numeric" });
  b.interaction("C", ["drag"], { dragMode: "along_path", dragTarget: bisector });
  const midpointTicks = [b.tick("tickAO", AO), b.tick("tickOB", OB)]; const distanceTicks = [b.tick("tickCA", CA, 0.32, 0.48), b.tick("tickCB", CB, 0.32, 0.48)]; standardStyles(b, [AO, OB, CA, CB], [bisector], [...midpointTicks, ...distanceTicks, rightO]); b.style([AB, angleO], { opacity: 0, labelVisible: false });
  return { capabilities: ["point.on_path", "line.perpendicular_through", "marker.segment_tick", "interaction.drag", "assertion.equal_length"], interactions: [{ target: "C", permission: "drag" }], stages: [
    { id: "definition", narration: "O 是 AB 的中点，过 O 作 AB 的垂线；这条直线就是线段 AB 的垂直平分线。", reveal: ["A", "B", O, AO, OB, bisector, ...midpointTicks, rightO] },
    { id: "point", narration: "在垂直平分线上任取一点 C，连接 CA、CB。", reveal: ["A", "B", "C", O, AO, OB, bisector, CA, CB, rightO] },
    { id: "property", narration: "拖动 C；由 SAS 可证 CA=CB，数值关系在整条垂直平分线上保持。", reveal: ["A", "B", "C", O, AO, OB, bisector, CA, CB, rightO, ...distanceTicks], focus: [CA, CB] }
  ] };
});

register({ number: 27, slug: "asa-criterion", title: "两角及其夹边判定全等", section: "1.5 三角形全等的判定", pages: [31, 32], figures: ["1-34"], knowledge: ["asa", "triangle-uniqueness"], objective: "固定两个角及其夹边，识别 ASA 判定的三项对应条件。", type: "demonstration", difficulty: "introductory" }, b => {
  b.p("A", 0, 0); b.p("B", 4, 0); b.p("C", 1.5, 3); b.p("A2", 6, 0, { label: "A′" }); b.p("B2", 10, 0, { label: "B′" }); b.p("C2", 7.5, 3, { label: "C′" });
  const AB = b.seg("AB", "A", "B"); const AC = b.seg("AC", "A", "C"); const BC = b.seg("BC", "B", "C"); const A2B2 = b.seg("A2B2", "A2", "B2"); const A2C2 = b.seg("A2C2", "A2", "C2"); const B2C2 = b.seg("B2C2", "B2", "C2");
  const Aang = b.angle("angleA", "B", "A", "C", "", 0.45); const Bang = b.angle("angleB", "C", "B", "A", "", 0.45); const A2ang = b.angle("angleA2", "B2", "A2", "C2", "", 0.45); const B2ang = b.angle("angleB2", "C2", "B2", "A2", "", 0.45); const ticks = [b.tick("tickAB", AB), b.tick("tickA2B2", A2B2)];
  b.assertion("included-side", "equal_length", [AB, A2B2], "夹边相等。", { requiredMethod: "numeric" }); b.assertion("angle-a", "equal_angle", [Aang, A2ang], "第一组角相等。", { requiredMethod: "numeric" }); b.assertion("angle-b", "equal_angle", [Bang, B2ang], "第二组角相等。", { requiredMethod: "numeric" }); standardStyles(b, [AB, AC, BC, A2B2, A2C2, B2C2], [], [Aang, Bang, A2ang, B2ang, ...ticks]);
  return { capabilities: ["angle.three_points", "marker.segment_tick", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "angles", narration: "两组三角形各有两个对应角相等。", reveal: ["A", "B", "C", "A2", "B2", "C2", AC, BC, A2C2, B2C2, Aang, Bang, A2ang, B2ang] },
    { id: "included-side", narration: "两个已知角的夹边 AB 与 A′B′ 也相等。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, BC, A2B2, A2C2, B2C2, ...ticks, Aang, Bang, A2ang, B2ang] },
    { id: "asa", narration: "两个角及其夹边对应相等的两个三角形全等，简称 ASA。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, BC, A2B2, A2C2, B2C2, ...ticks, Aang, Bang, A2ang, B2ang] }
  ] };
});

register({ number: 28, slug: "asa-proof-application", title: "ASA 证明线段相等", section: "1.5 三角形全等的判定", pages: [32], figures: ["1-36"], knowledge: ["asa", "congruence-proof", "parallel-angle-relations"], objective: "由平行线得到一组角相等，再用 ASA 证明 △ABE≌△DCF 和 AE=DF。", type: "guided-construction", difficulty: "advanced" }, b => {
  b.p("B", 0, 0); b.p("E", 1, 0); b.p("F", 4, 0); b.p("C", 5, 0); b.p("A", 1, 3); b.p("D", 4, -3);
  const AB = b.seg("AB", "A", "B"); const AE = b.seg("AE", "A", "E"); const BE = b.seg("BE", "B", "E"); const CD = b.seg("CD", "C", "D"); const DF = b.seg("DF", "D", "F"); const CF = b.seg("CF", "C", "F");
  const angleA = b.angle("angleA", "B", "A", "E", "∠A", 0.45, 0.82); const angleD = b.angle("angleD", "C", "D", "F", "∠D", 0.45, 0.82); const angleB = b.angle("angleB", "A", "B", "E", "∠B", 0.38, 0.75); const angleC = b.angle("angleC", "D", "C", "F", "∠C", 0.38, 0.75);
  const ticks = [b.tick("tickAB", AB), b.tick("tickCD", CD), b.tick("tickAE", AE, 0.3, 0.5), b.tick("tickDF", DF, 0.3, 0.5)];
  b.assertion("parallel-given", "parallel", [AB, CD], "AB∥CD。", { requiredMethod: "numeric" }); b.assertion("ab-cd", "equal_length", [AB, CD], "AB=CD。", { requiredMethod: "numeric" }); b.assertion("angles-a-d", "equal_angle", [angleA, angleD], "∠A=∠D。", { requiredMethod: "numeric" }); b.assertion("angles-b-c", "equal_angle", [angleB, angleC], "∠B=∠C。", { requiredMethod: "numeric" }); b.assertion("ae-df", "equal_length", [AE, DF], "AE=DF。", { requiredMethod: "numeric" });
  standardStyles(b, [AB, AE, BE, CD, DF, CF], [], [...ticks, angleA, angleD, angleB, angleC]);
  return { capabilities: ["angle.three_points", "marker.segment_tick", "assertion.parallel", "assertion.equal_length", "activity.stages"], stages: [
    { id: "given", narration: "图 1-36：B、E、F、C 共线，AB∥CD，且 AB=CD、∠A=∠D。", reveal: ["A", "B", "C", "D", "E", "F", AB, AE, BE, CD, DF, CF, angleA, angleD, ...ticks.slice(0, 2)] },
    { id: "derive", narration: "由 AB∥CD 得 ∠B=∠C；在 △ABE 与 △DCF 中形成 ASA 条件。", reveal: ["A", "B", "C", "D", "E", "F", AB, AE, BE, CD, DF, CF, angleA, angleD, angleB, angleC, ...ticks.slice(0, 2)] },
    { id: "conclude", narration: "△ABE≌△DCF（ASA），因此对应边 AE=DF。", reveal: ["A", "B", "C", "D", "E", "F", AB, AE, BE, CD, DF, CF, ...ticks], focus: [AE, DF] }
  ] };
});

register({ number: 29, slug: "aas-criterion", title: "两角及其中一角的对边判定全等", section: "1.5 三角形全等的判定", pages: [34], figures: ["1-37"], knowledge: ["aas", "triangle-angle-sum"], objective: "由两个已知角先补出第三角，再把 AAS 归结为 ASA。", type: "demonstration", difficulty: "intermediate" }, b => {
  b.p("A", 0, 3); b.p("B", -1.5, 0); b.p("C", 3, 0); b.p("A2", 7, 3, { label: "A′" }); b.p("B2", 5.5, 0, { label: "B′" }); b.p("C2", 10, 0, { label: "C′" });
  const AB = b.seg("AB", "A", "B"); const AC = b.seg("AC", "A", "C"); const BC = b.seg("BC", "B", "C"); const A2B2 = b.seg("A2B2", "A2", "B2"); const A2C2 = b.seg("A2C2", "A2", "C2"); const B2C2 = b.seg("B2C2", "B2", "C2");
  const Aang = b.angle("angleA", "B", "A", "C", "", 0.44); const Bang = b.angle("angleB", "A", "B", "C", "", 0.44); const A2ang = b.angle("angleA2", "B2", "A2", "C2", "", 0.44); const B2ang = b.angle("angleB2", "A2", "B2", "C2", "", 0.44); const ticks = [b.tick("tickBC", BC), b.tick("tickB2C2", B2C2)];
  b.assertion("a-equal", "equal_angle", [Aang, A2ang], "∠A=∠A′。", { requiredMethod: "numeric" }); b.assertion("b-equal", "equal_angle", [Bang, B2ang], "∠B=∠B′。", { requiredMethod: "numeric" }); b.assertion("opposite-side", "equal_length", [BC, B2C2], "一个已知角的对边相等。", { requiredMethod: "numeric" }); standardStyles(b, [AB, AC, BC, A2B2, A2C2, B2C2], [], [Aang, Bang, A2ang, B2ang, ...ticks]);
  return { capabilities: ["angle.three_points", "marker.segment_tick", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "given", narration: "已知两组角分别相等，且 BC=B′C′；这条边不是两个已知角的夹边。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, BC, A2B2, A2C2, B2C2, Aang, Bang, A2ang, B2ang, ...ticks] },
    { id: "derive", narration: "由三角形内角和，第三组角 ∠C=∠C′。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, BC, A2B2, A2C2, B2C2, Aang, Bang, A2ang, B2ang] },
    { id: "aas", narration: "于是可用 ASA 证明全等；该条件组合简称 AAS。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, BC, A2B2, A2C2, B2C2, ...ticks], focus: [BC, B2C2] }
  ] };
});

register({ number: 30, slug: "angle-bisector-distance", title: "角平分线上的点到两边距离相等", section: "1.5 三角形全等的判定", pages: [34], figures: ["1-38"], knowledge: ["angle-bisector-distance", "aas"], objective: "从角平分线上的点分别向两边作垂线，用 AAS 证明两条距离相等。", type: "guided-construction", difficulty: "intermediate" }, b => {
  b.p("A", 0, 0); b.p("X", 6, 0); b.p("Y", 3, 5.196152); b.p("P", 3.464102, 2);
  const AX = b.ray("AX", "A", "X"); const AY = b.ray("AY", "A", "Y"); const AP = b.seg("AP", "A", "P"); const lineAX = b.line("lineAX", "A", "X"); const lineAY = b.line("lineAY", "A", "Y");
  const B = b.projection("B", "P", lineAX); const C = b.projection("C", "P", lineAY); const PB = b.seg("PB", "P", B); const PC = b.seg("PC", "P", C);
  const angle1 = b.angle("angleBAP", B, "A", "P", "", 0.5); const angle2 = b.angle("anglePAC", "P", "A", C, "", 0.68); const rightB = b.angle("anglePBA", "P", B, "A", "", 0.38); const rightC = b.angle("anglePCA", "P", C, "A", "", 0.38); const markB = b.right("rightB", rightB, 0.28); const markC = b.right("rightC", rightC, 0.28); const ticks = [b.tick("tickPB", PB), b.tick("tickPC", PC)];
  b.assertion("bisected", "equal_angle", [angle1, angle2], "AP 平分 ∠XAY。", { requiredMethod: "numeric" }); b.assertion("pb-perp", "perpendicular", [PB, lineAX], "PB⊥AX。", { requiredMethod: "numeric" }); b.assertion("pc-perp", "perpendicular", [PC, lineAY], "PC⊥AY。", { requiredMethod: "numeric" }); b.assertion("distances", "equal_length", [PB, PC], "PB=PC。", { requiredMethod: "numeric" }); standardStyles(b, [AX, AY, AP], [PB, PC], [angle1, angle2, markB, markC, ...ticks]); b.style([lineAX, lineAY, rightB, rightC], { opacity: 0, labelVisible: false });
  return { capabilities: ["point.projection", "marker.right_angle", "marker.segment_tick", "assertion.equal_length", "activity.stages"], stages: [
    { id: "given", narration: "P 在 ∠XAY 的角平分线上，因此 ∠BAP=∠PAC。", reveal: ["A", "P", "X", "Y", AX, AY, AP, angle1, angle2] },
    { id: "construct", narration: "从 P 分别向角的两边作垂线，垂足为 B、C；PB、PC 是点 P 到两边的距离。", reveal: ["A", "B", "C", "P", "X", "Y", AX, AY, AP, PB, PC, markB, markC] },
    { id: "conclude", narration: "两个直角三角形按 AAS 全等，所以对应边 PB=PC。", reveal: ["A", "B", "C", "P", AX, AY, AP, PB, PC, markB, markC, ...ticks], focus: [PB, PC] }
  ] };
});

register({ number: 31, slug: "congruence-boundaries", title: "AAA 与 SSA 为什么不能判定全等", section: "1.5 三角形全等的判定", pages: [31, 33], figures: [], knowledge: ["congruence-counterexample", "aaa", "ssa"], objective: "用缩放反例和双解构造分别识别 AAA、SSA 的判定边界。", type: "exploration", difficulty: "advanced" }, b => {
  b.p("A", -6, 0); b.p("B", -3, 0); b.p("C", -5, 2); b.p("A2", -1, 0, { label: "A′" }); b.p("B2", 3.5, 0, { label: "B′" }); b.p("C2", 0.5, 3, { label: "C′" });
  const AB = b.seg("AB", "A", "B"); const AC = b.seg("AC", "A", "C"); const BC = b.seg("BC", "B", "C"); const A2B2 = b.seg("A2B2", "A2", "B2"); const A2C2 = b.seg("A2C2", "A2", "C2"); const B2C2 = b.seg("B2C2", "B2", "C2"); const a1 = b.angle("AAA1", "B", "A", "C", "", 0.35); const a2 = b.angle("AAA2", "B2", "A2", "C2", "", 0.45);
  b.p("S", 5, 0); b.p("T", 9, 0); b.p("Q", 5.535898, 2, { visible: false }); const ST = b.seg("ST", "S", "T"); const rayTQ = b.ray("ssaRay", "T", "Q"); const circleS = b.circle("ssaCircle", "S", 3); b.add("point.intersection_line_circle", [{ id: "U1", label: "U₁" }, { id: "U2", label: "U₂" }], [rayTQ, circleS]); const SU1 = b.seg("SU1", "S", "U1"); const TU1 = b.seg("TU1", "T", "U1"); const SU2 = b.seg("SU2", "S", "U2"); const TU2 = b.seg("TU2", "T", "U2");
  b.assertion("aaa-angle", "equal_angle", [a1, a2], "缩放后三角形对应角相等。", { requiredMethod: "numeric" }); b.assertion("ssa-side", "equal_length", [SU1, SU2], "两个解都满足 SU=3。", { requiredMethod: "numeric" }); b.assertion("ssa-collinear", "collinear", ["T", "U1", "U2"], "两个候选点在同一已知射线上。", { requiredMethod: "numeric" }); standardStyles(b, [AB, AC, BC, A2B2, A2C2, B2C2, ST, TU1, SU1, TU2, SU2], [rayTQ, circleS], [a1, a2]); b.style([TU2, SU2], { stroke: "#EF6C22", strokeWidth: 2.0, dash: "dashed" });
  return { capabilities: ["transform.dilate", "point.intersection_line_circle", "circle.center_radius", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "aaa", narration: "左侧两三角形三个角都对应相等，但后一三角形是前者的 1.5 倍；AAA 只能保证形状相同，不能保证大小相同。", reveal: ["A", "B", "C", "A2", "B2", "C2", AB, AC, BC, A2B2, A2C2, B2C2, a1, a2] },
    { id: "ssa", narration: "右侧固定 ST、∠T 和非夹边 SU=3；圆与已知射线有两个交点 U₁、U₂。", reveal: ["S", "T", "U1", "U2", ST, rayTQ, circleS, SU1, TU1, SU2, TU2] },
    { id: "boundary", narration: "两个候选三角形同时满足 SSA 条件，却不全等。因此全等判定不能擅自扩展为 AAA 或 SSA。", reveal: ["S", "T", "U1", "U2", ST, SU1, TU1, SU2, TU2], focus: [SU1, TU1, SU2, TU2] }
  ] };
});

register({ number: 32, slug: "copy-angle", title: "用尺规复制已知角", section: "1.6 尺规作图", pages: [37], figures: ["1-41", "1-42"], knowledge: ["ruler-compass-construction", "copy-angle", "sss"], objective: "按同半径弧、等弦和目标射线四步复制已知角，并用 SSS 解释作法。", type: "guided-construction", difficulty: "intermediate" }, b => {
  b.p("O", 0, 1); b.p("A", 3, 1); b.p("B", 2.2, 3.2); b.p("C", 2, 1); b.p("D", 1.414214, 2.414214);
  const OA = b.ray("OA", "O", "A"); const OB = b.ray("OB", "O", "B"); const sourceCircle = b.circleThrough("sourceCircle", "O", "C"); const CD = b.seg("CD", "C", "D");
  b.p("O2", 6, 1, { label: "O′" }); b.p("A2", 9, 1, { label: "A′" }); b.p("C2", 8, 1, { label: "C′" }); const O2A2 = b.ray("O2A2", "O2", "A2"); const targetCircle = b.circleThrough("targetCircle", "O2", "C2");
  b.add("measurement.distance", ["chordLength"], ["C", "D"]); b.add("circle.center_radius", ["chordCircle"], ["C2", "chordLength"]); b.circlesMeet("D2low", "D2", targetCircle, "chordCircle"); const O2D2 = b.ray("O2D2", "O2", "D2"); const C2D2 = b.seg("C2D2", "C2", "D2");
  const sourceAngle = b.angle("sourceAngle", "A", "O", "B", "∠AOB", 0.58, 1.05); const copiedAngle = b.angle("copiedAngle", "A2", "O2", "D2", "∠A′O′B′", 0.58, 1.05);
  b.assertion("copied", "equal_angle", [sourceAngle, copiedAngle], "复制角与已知角相等。", { requiredMethod: "numeric" }); b.assertion("equal-chords", "equal_length", [CD, C2D2], "CD=C′D′。", { requiredMethod: "numeric" });
  standardStyles(b, [OA, OB, O2A2, O2D2], [sourceCircle, targetCircle, "chordCircle", CD, C2D2], [sourceAngle, copiedAngle]);
  return { capabilities: ["circle.through_points", "measurement.distance", "point.intersection_circle_circle", "ray.from_points", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "source-arc", narration: "以 O 为圆心作弧，分别交角的两边于 C、D。", reveal: ["O", "A", "B", "C", "D", OA, OB, sourceCircle, sourceAngle] },
    { id: "target-arc", narration: "作射线 O′A′，以 O′ 为圆心、OC 为半径作弧，交 O′A′ 于 C′。", reveal: ["O2", "A2", "C2", O2A2, targetCircle] },
    { id: "copy-chord", narration: "以 C′ 为圆心、CD 为半径作弧，与前一弧交于 D′。", reveal: ["C", "D", "C2", "D2", CD, C2D2, targetCircle, "chordCircle"] },
    { id: "conclude", narration: "过 O′、D′ 作射线。由 OC=O′C′、OD=O′D′、CD=C′D′，两三角形按 SSS 全等，所以复制角等于已知角。", reveal: ["O", "A", "B", "O2", "A2", "D2", OA, OB, O2A2, O2D2, sourceAngle, copiedAngle], focus: [copiedAngle] }
  ] };
});

register({ number: 33, slug: "construct-perpendicular-bisector", title: "用尺规作线段的垂直平分线", section: "1.6 尺规作图", pages: [37, 38], figures: ["1-43"], knowledge: ["ruler-compass-construction", "perpendicular-bisector"], objective: "以线段两端为圆心作等半径弧，通过两个交点确定垂直平分线。", type: "guided-construction", difficulty: "introductory" }, b => {
  b.p("A", -3, 0); b.p("B", 3, 0); const AB = b.seg("AB", "A", "B"); const circleA = b.circle("circleA", "A", 4); const circleB = b.circle("circleB", "B", 4); b.circlesMeet("C", "D", circleA, circleB, false); const CD = b.line("CD", "C", "D"); b.mid("O", "A", "B", true); const AO = b.seg("AO", "A", "O"); const OB = b.seg("OB", "O", "B"); const ticks = [b.tick("tickAO", AO), b.tick("tickOB", OB)];
  b.assertion("perpendicular", "perpendicular", [CD, AB], "CD⊥AB。", { requiredMethod: "numeric" }); b.assertion("midpoint", "equal_length", [AO, OB], "AO=OB。", { requiredMethod: "numeric" }); b.assertion("c-equal", "equal_length", ["A", "C", "B", "C"], "CA=CB。", { requiredMethod: "numeric" });
  standardStyles(b, [AB], [circleA, circleB, CD], ticks);
  return { capabilities: ["circle.center_radius", "point.intersection_circle_circle", "line.through_points", "marker.segment_tick", "assertion.perpendicular", "activity.stages"], stages: [
    { id: "segment", narration: "已知线段 AB。选取大于 AB 一半的同一半径。", reveal: ["A", "B", AB] },
    { id: "equal-arcs", narration: "分别以 A、B 为圆心作等半径弧，两弧交于 C、D。", reveal: ["A", "B", "C", "D", AB, circleA, circleB] },
    { id: "join", narration: "过 C、D 作直线。C、D 都到 A、B 等距，因此直线 CD 是 AB 的垂直平分线。", reveal: ["A", "B", "C", "D", "O", AB, CD, AO, OB, ...ticks], focus: [CD] }
  ] };
});

register({ number: 34, slug: "construct-triangle-asa", title: "已知两角及夹边作三角形", section: "1.6 尺规作图", pages: [38], figures: ["1-44", "1-45"], knowledge: ["ruler-compass-construction", "asa"], objective: "先作给定夹边，再在两端复制两个已知角，以两射线交点确定第三个顶点。", type: "guided-construction", difficulty: "intermediate" }, b => {
  b.p("A", 0, 0); b.p("B", 6, 0); b.p("U", 2.57115, 3.064178, { visible: false }); b.p("V", 4.631919, 3.75877, { visible: false }); const AB = b.seg("AB", "A", "B", "a"); const rayA = b.ray("rayA", "A", "U"); const rayB = b.ray("rayB", "B", "V"); const C = b.linesMeet("C", rayA, rayB); const AC = b.seg("AC", "A", C); const BC = b.seg("BC", "B", C); const angleA = b.angle("angleA", "B", "A", C, "α", 0.55, 1.0); const angleB = b.angle("angleB", "A", "B", C, "β", 0.55, 1.0);
  b.p("Oa", -4, 5, { label: "" }); b.p("Ra", -2, 5, { label: "" }); b.p("Sa", -2.714425, 6.532089, { label: "" }); const alphaArm1 = b.seg("alphaArm1", "Oa", "Ra"); const alphaArm2 = b.seg("alphaArm2", "Oa", "Sa"); const alpha = b.angle("givenAlpha", "Ra", "Oa", "Sa", "α", 0.48, 0.9);
  b.p("Ob", 6, 5, { label: "" }); b.p("Lb", 4, 5, { label: "" }); b.p("Sb", 5.31596, 6.879385, { label: "" }); const betaArm1 = b.seg("betaArm1", "Ob", "Lb"); const betaArm2 = b.seg("betaArm2", "Ob", "Sb"); const beta = b.angle("givenBeta", "Lb", "Ob", "Sb", "β", 0.48, 0.9);
  b.assertion("copy-alpha", "equal_angle", [alpha, angleA], "∠A=α。", { requiredMethod: "numeric" }); b.assertion("copy-beta", "equal_angle", [beta, angleB], "∠B=β。", { requiredMethod: "numeric" }); standardStyles(b, [AB, AC, BC, alphaArm1, alphaArm2, betaArm1, betaArm2], [rayA, rayB], [alpha, beta, angleA, angleB]); b.style(["Oa", "Ra", "Sa", "Ob", "Lb", "Sb"], { pointSize: 0, labelVisible: false });
  return { capabilities: ["ray.from_points", "point.intersection_line_line", "angle.three_points", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "givens", narration: "已知两个角 α、β 和夹边 a。", reveal: ["Oa", "Ra", "Sa", "Ob", "Lb", "Sb", alphaArm1, alphaArm2, betaArm1, betaArm2, alpha, beta] },
    { id: "base", narration: "第一步：作线段 AB=a。", reveal: ["A", "B", AB, "Oa", "Ra", "Sa", "Ob", "Lb", "Sb", alphaArm1, alphaArm2, betaArm1, betaArm2, alpha, beta] },
    { id: "copy-angles", narration: "第二步：在 AB 同侧，分别以 A、B 为顶点复制 α、β，得到两条射线。", reveal: ["A", "B", AB, rayA, rayB, angleA, angleB] },
    { id: "intersection", narration: "两射线交于 C，连接 AC、BC；△ABC 即为所求三角形。", reveal: ["A", "B", "C", AB, AC, BC, angleA, angleB], focus: [C] }
  ] };
});

register({ number: 35, slug: "three-congruence-constructions", title: "用三种条件作全等三角形", section: "1.6 尺规作图", pages: [39], figures: [], knowledge: ["ruler-compass-construction", "sss", "sas", "asa"], objective: "对同一个目标三角形，分别选择 SSS、SAS、ASA 数据完成三种全等构造。", type: "demonstration", difficulty: "advanced" }, b => {
  b.p("A", 0, 4); b.p("B", 3, 4); b.p("C", 1, 6.5); const AB = b.seg("AB", "A", "B"); const AC = b.seg("AC", "A", "C"); const BC = b.seg("BC", "B", "C");
  const copies = [
    { prefix: "sss", R: [-6, 0], S: [-3, 0], P: [-5, 2.5], labels: ["R₁", "S₁", "P₁"] },
    { prefix: "sas", R: [-1, 0], S: [2, 0], P: [0, 2.5], labels: ["R₂", "S₂", "P₂"] },
    { prefix: "asa", R: [4, 0], S: [7, 0], P: [5, 2.5], labels: ["R₃", "S₃", "P₃"] }
  ];
  const groups = {};
  for (const copy of copies) {
    const R = `${copy.prefix}R`; const S = `${copy.prefix}S`; const P = `${copy.prefix}P`;
    b.p(R, ...copy.R, { label: copy.labels[0] }); b.p(S, ...copy.S, { label: copy.labels[1] }); b.p(P, ...copy.P, { label: copy.labels[2] });
    const RS = b.seg(`${copy.prefix}RS`, R, S); const RP = b.seg(`${copy.prefix}RP`, R, P); const SP = b.seg(`${copy.prefix}SP`, S, P); groups[copy.prefix] = [R, S, P, RS, RP, SP];
    b.assertion(`${copy.prefix}-base`, "equal_length", [AB, RS], `${copy.prefix.toUpperCase()} 构造的底边与 AB 相等。`, { requiredMethod: "numeric" });
    b.assertion(`${copy.prefix}-side`, "equal_length", [AC, RP], `${copy.prefix.toUpperCase()} 构造的对应边与 AC 相等。`, { requiredMethod: "numeric" });
  }
  const sourceA = b.angle("sourceA", "B", "A", "C", "", 0.4); const sasA = b.angle("sasA", "sasS", "sasR", "sasP", "", 0.4); const asaA = b.angle("asaA", "asaS", "asaR", "asaP", "", 0.4); const sourceB = b.angle("sourceB", "C", "B", "A", "", 0.4); const asaB = b.angle("asaB", "asaP", "asaS", "asaR", "", 0.4);
  b.assertion("sas-angle", "equal_angle", [sourceA, sasA], "SAS 的夹角相等。", { requiredMethod: "numeric" }); b.assertion("asa-angle-a", "equal_angle", [sourceA, asaA], "ASA 第一组角相等。", { requiredMethod: "numeric" }); b.assertion("asa-angle-b", "equal_angle", [sourceB, asaB], "ASA 第二组角相等。", { requiredMethod: "numeric" });
  const sssTicks = [b.tick("tickSourceAB", AB), b.tick("tickSssRS", "sssRS"), b.tick("tickSourceAC1", AC, 0.3, 0.46), b.tick("tickSourceAC2", AC, 0.3, 0.54), b.tick("tickSssRP1", "sssRP", 0.3, 0.46), b.tick("tickSssRP2", "sssRP", 0.3, 0.54), b.tick("tickSourceBC1", BC, 0.3, 0.44), b.tick("tickSourceBC2", BC, 0.3, 0.5), b.tick("tickSourceBC3", BC, 0.3, 0.56), b.tick("tickSssSP1", "sssSP", 0.3, 0.44), b.tick("tickSssSP2", "sssSP", 0.3, 0.5), b.tick("tickSssSP3", "sssSP", 0.3, 0.56)];
  standardStyles(b, [AB, AC, BC, ...groups.sss.slice(3), ...groups.sas.slice(3), ...groups.asa.slice(3)], [], [...sssTicks, sourceA, sourceB, sasA, asaA, asaB]);
  return { capabilities: ["marker.segment_tick", "angle.three_points", "assertion.equal_length", "assertion.equal_angle", "activity.stages"], stages: [
    { id: "target", narration: "目标：作 △PRS，使它与给定的 △ABC 全等。下面分别使用三种充分条件。", reveal: ["A", "B", "C", AB, AC, BC] },
    { id: "sss-method", narration: "SSS：依次复制 AB、AC、BC 三条边，用两圆交点确定 P₁。", reveal: ["A", "B", "C", AB, AC, BC, ...groups.sss, ...sssTicks] },
    { id: "sas-method", narration: "SAS：复制两边 AB、AC 及其夹角 ∠A，确定 P₂。", reveal: ["A", "B", "C", AB, AC, sourceA, ...groups.sas, sasA] },
    { id: "asa-method", narration: "ASA：复制两角 ∠A、∠B 及夹边 AB，两射线交于 P₃。", reveal: ["A", "B", "C", AB, sourceA, sourceB, ...groups.asa, asaA, asaB] },
    { id: "compare", narration: "三种方法得到的三角形方向和位置不同，但都与 △ABC 全等；关键是选择一组充分且可作出的条件。", reveal: ["A", "B", "C", AB, AC, BC, ...groups.sss, ...groups.sas, ...groups.asa] }
  ] };
});

function makeInitialDocument(meta) {
  const seed = 200 + meta.number;
  const documentId = `ch1-${String(meta.number).padStart(2, "0")}-${meta.slug}`;
  return {
    schema: "famtutor.math.document.v1",
    documentId,
    revision: 1,
    seed,
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
      sourceRefs: meta.figures.length
        ? meta.figures.map(figure => `zjedu-math-8a-2013:printed-${meta.pages.join("-")}:figure-${figure}`)
        : meta.pages.map(page => `zjedu-math-8a-2013:printed-${page}`)
    }
  };
}

async function makeCase(meta) {
  const initialDocument = makeInitialDocument(meta);
  const changeSet = {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: `zj8a-${String(meta.number).padStart(2, "0")}-build`,
    base: { domain: "math", schema: "famtutor.math.document.v1", documentId: initialDocument.documentId, revision: 1 },
    operations: meta.operations,
    metadata: { origin: "textbook-case-source-faithful", sourceFidelity: "A", mathCorrectness: "verified", visualQuality: "pending-browser-review" }
  };
  const runtime = new MathDomainRuntime();
  const applied = await runtime.apply(structuredClone(initialDocument), changeSet);
  if (!applied.ok || !applied.document) throw new Error(`${meta.number}: ${JSON.stringify(applied.diagnostics)}`);
  const fingerprint = createHash("sha256").update(canonicalizeJson(applied.document)).digest("hex");
  const sectionId = meta.section.slice(0, 3).replace(".", "-");
  return {
    schema: "famtutor.case.v1",
    caseId: `zj8a-${sectionId}-${String(meta.number).padStart(2, "0")}-${meta.slug}`,
    title: meta.title,
    description: `按教材${meta.figures.length ? `图 ${meta.figures.join("、")}` : `印刷页 ${meta.pages.join("–")}`}实现的来源可追溯几何案例。`,
    source: { bookId: "zjedu-math-8a-2013", pdfName: "义务教育教科书·数学八年级上册.pdf", pdfSha256: PDF_SHA, chapter: "1 三角形的初步知识", section: meta.section, printedPages: meta.pages, pdfPages: meta.pages.map(page => page + 3), extractionMethod: "visual-review", confidence: 1, reviewStatus: "reviewed" },
    knowledgePoints: meta.knowledge,
    learningObjective: meta.objective,
    caseType: meta.type,
    difficulty: meta.difficulty,
    requiredCapabilities: [...new Set(meta.capabilities)],
    generation: { provider: "openai-codex", model: "gpt-5", promptVersion: "ch1-source-faithful-v2", seed: initialDocument.seed, attempts: 1 },
    inputs: { initialDocument },
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
      interactions: meta.interactions ?? []
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

process.stdout.write(`Generated ${CASES.length} Chapter 1 cases.\n`);
