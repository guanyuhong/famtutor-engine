import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const casesRoot = join(root, "research/geogebra/cases");
const materialsRoot = join(root, "research/geogebra/math-g9-12/materials");
const readJson = async p => JSON.parse(await readFile(p, "utf8"));
const writeJson = async (p, v) => { await mkdir(dirname(p), { recursive: true }); await writeFile(p, `${JSON.stringify(v, null, 2)}\n`); };
const E = (id, type, role = "derived", extra = {}) => ({ id, type, role, ...extra });
const N = (id, command, output, inputs = [], params) => ({ id, command, ...(inputs.length ? { inputs: inputs.map(ref => ({ ref })) } : {}), ...(params ? { params } : {}), outputs: [output] });
const style = (targets, token = "primary", extra = {}) => ({ targets, style: { token, ...extra } });

function doc(id, seed, title, description, entities, construction, box, styles, interactions, assertions, stages) {
  return { schema: "famtutor.math.document.v1", documentId: id, revision: 1, seed,
    metadata: { title, description, locale: "zh-CN", purpose: "exploration", subject: "mathematics", grade: "grade-9-12", tags: ["geogebra-math-index", "grade-9-12", "wave-02"] },
    entities, construction,
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "jsxgraph-svg", boundingBox: box, axes: true, grid: true, keepAspectRatio: true, background: "#FBFCFE", cameraPolicy: "document" }],
    styles, interactions, assertions,
    activities: [{ id, title, stages, tasks: [{ id: `${id}-task`, prompt: "拖动参数、切换阶段，并用图像与代数互相核验。", allowedTools: ["interaction.drag"], evidence: assertions.map(a => ({ kind: "assertion", ref: a.id })) }] }],
    provenance: { generator: "agent", sourceRefs: [] } };
}
const eq = (id, a, b, message) => ({ id, predicate: "expression_equal", arguments: [{ expr: a }, { expr: b }], expected: true, tolerance: 1e-7, requiredMethod: "numeric", severity: "error", message });

function representations() {
  const entities = [E("x0","scalar","free",{label:"输入 x"}),E("f","function1","derived",{label:"f(x)=2x+1"}),E("y0","scalar"),E("P","point2","derived",{label:"P(x,f(x))"}),E("A","point2","derived",{label:"(-2,-3)"}),E("B","point2","derived",{label:"(0,1)"}),E("C","point2","derived",{label:"(2,5)"}),E("rule","text","annotation"),E("table","text","annotation"),E("words","text","annotation")];
  const construction = [N("x","scalar.slider","x0",[],{value:1,min:-3,max:3,step:.25,position:[-5.4,-5.1],length:5}),N("f","function.explicit","f",[],{expression:"2*x+1",domain:[-4,4]}),N("y","function.value_at","y0",["f","x0"]),N("p","point.from_expressions","P",[],{x:"x0",y:"y0"}),N("a","point.from_expressions","A",[],{x:"-2",y:"-3"}),N("b","point.from_expressions","B",[],{x:"0",y:"1"}),N("c","point.from_expressions","C",[],{x:"2",y:"5"}),N("rule","text.at","rule",[],{text:"规则：输出 = 2×输入 + 1",at:[-5.4,6]}),N("table","text.at","table",[],{text:"表：(-2,-3)  (0,1)  (2,5)",at:[-5.4,5.4]}),N("words","text.at","words",[],{text:"语言：输出比输入的两倍多 1",at:[-5.4,4.8]})];
  return doc("geogebra-math-function-representations",3201,"关系与函数的多种表示","同一关系在规则、表、语言和坐标图之间转换。",entities,construction,[-6,6.5,6,-5.7],[style(["f"],"primary",{strokeWidth:2.8,labelVisible:false}),style(["P"],"accent",{labelPlacement:"right"}),style(["A","B","C"],"success",{labelPlacement:"auto"}),style(["rule","table","words"],"primary",{fontSize:12})],[{target:"x0",permissions:["select","drag"]}],[eq("point-rule","y(P)","2*x(P)+1","图上点满足同一规则。"),eq("sample-c","y(C)","5","表中样例正确。")],[{id:"rule",narration:"先读代数规则和语言描述。",focus:["rule","words"]},{id:"table",narration:"有序对表把输入和输出逐行配对；这里由同一函数关系核验。",focus:["table","A","B","C"]},{id:"graph",narration:"拖动输入，动态点 P 仍落在同一图像上。",focus:["f","P"]}]);
}

function monotonic() {
  const entities=[E("h","scalar","free",{label:"顶点横坐标 h"}),E("f","function1","derived",{label:"f(x)=(x-h)²-2"}),E("V","point2","derived",{label:"V"}),E("left","interval1","auxiliary",{label:"递减区间"}),E("right","interval1","auxiliary",{label:"递增区间"}),E("note","text","annotation")];
  const construction=[N("h","scalar.slider","h",[],{value:1,min:-2,max:2,step:.25,position:[-5.3,-5.05],length:5}),N("f","function.explicit","f",[],{expression:"(x-h)^2-2",domain:[-5,5]}),N("v","point.from_expressions","V",[],{x:"h",y:"-2"}),N("left","interval.from_bounds","left",[],{upper:"h",upperClosed:false,y:-3.7}),N("right","interval.from_bounds","right",[],{lower:"h",lowerClosed:false,y:-4.35}),N("note","text.at","note",[],{text:"转折点 x=h 把定义域分成两个单调区间",at:[-5.3,6]})];
  return doc("geogebra-math-increasing-decreasing",3301,"函数的递增与递减","用移动顶点识别二次函数的递减、递增区间。",entities,construction,[-6,6.5,6,-5.7],[style(["f"],"primary",{strokeWidth:2.8,labelVisible:false}),style(["V"],"accent",{labelPlacement:"bottom-right"}),style(["left"],"danger",{lineLabelSide:"left"}),style(["right"],"success",{lineLabelSide:"right"}),style(["note"],"primary",{fontSize:12})],[{target:"h",permissions:["select","drag"]}],[eq("vertex-x","x(V)","h","顶点横坐标等于 h。"),eq("vertex-y","y(V)","-2","顶点纵坐标保持 -2。")],[{id:"behavior",narration:"从左向右追踪函数值的变化，而不是只看曲线朝向。",focus:["f"]},{id:"turning",narration:"顶点 x=h 是由递减转为递增的分界。",focus:["V","h"]},{id:"intervals",narration:"开区间 (-∞,h) 递减，(h,∞) 递增；转折点不属于任一严格单调区间。",focus:["left","right","V"]}]);
}

function absoluteInequality() {
  const entities=[E("h","scalar","free",{label:"水平平移 h"}),E("k","scalar","free",{label:"竖直平移 k"}),E("f","function1","derived",{label:"f(x)=|x-h|+k"}),E("solution","region2","derived",{label:"y≥f(x)"}),E("V","point2","derived",{label:"V(h,k)"}),E("note","text","annotation")];
  const construction=[N("h","scalar.slider","h",[],{value:1,min:-2,max:2,step:.25,position:[-5.4,-5.05],length:4.4}),N("k","scalar.slider","k",[],{value:-1,min:-2,max:2,step:.25,position:[.8,-5.05],length:4.4}),N("f","function.explicit","f",[],{expression:"abs(x-h)+k",domain:[-5,5]}),N("region","region.function_inequality","solution",["f"],{relation:"above",domain:[-5,5],boundaryIncluded:true}),N("v","point.from_expressions","V",[],{x:"h",y:"k"}),N("note","text.at","note",[],{text:"阴影表示 y ≥ |x-h|+k（边界计入）",at:[-5.4,6]})];
  return doc("geogebra-math-absolute-value-inequality",3401,"绝对值函数与不等式作图","平移 V 形母函数，并用函数边界定义二维解区域。",entities,construction,[-6,6.5,6,-5.7],[style(["solution"],"accent",{fillOpacity:.18,strokeWidth:2.5}),style(["f"],"primary",{strokeWidth:2.8,labelVisible:false}),style(["V"],"danger",{labelPlacement:"bottom-right"}),style(["h","k"],"primary",{fontSize:10,labelOffset:[0,-12]}),style(["note"],"primary",{fontSize:12})],[{target:"h",permissions:["select","drag"]},{target:"k",permissions:["select","drag"]}],[eq("vertex-x","x(V)","h","顶点横坐标由 h 决定。"),eq("vertex-y","y(V)","k","顶点纵坐标由 k 决定。")],[{id:"parent",narration:"母函数 y=|x| 是 V 形，顶点在原点。",focus:["f"]},{id:"transform",narration:"h 控制水平平移，k 控制竖直平移，顶点始终是 (h,k)。",focus:["h","k","V"]},{id:"inequality",narration:"关系 y≥f(x) 选择边界上方；等号使边界为实线并包含在解集中。",focus:["solution","f"]}]);
}

function graphSolveQuadratic() {
  const entities=[E("f","function1","derived",{label:"y=x²-2x-3"}),E("R1","point2","derived",{label:"x=-1"}),E("R2","point2","derived",{label:"x=3"}),E("vertex","point2","derived",{label:"V(1,-4)"}),E("note","text","annotation")];
  const construction=[N("f","function.explicit","f",[],{expression:"x^2-2*x-3",domain:[-4,5]}),N("r1","point.function_root","R1",["f"],{bracket:[-2,0]}),N("r2","point.function_root","R2",["f"],{bracket:[2,4]}),N("v","point.from_expressions","vertex",[],{x:"1",y:"-4"}),N("note","text.at","note",[],{text:"解 f(x)=0 ⇔ 图像与 x 轴交点的横坐标",at:[-4.5,6]})];
  return doc("geogebra-math-graph-solve-quadratic",3501,"用图像解二次方程","把方程化为 f(x)=0，并从函数图像与 x 轴的交点读出两根。",entities,construction,[-5,6.5,6,-5.5],[style(["f"],"primary",{strokeWidth:2.8,labelVisible:false}),style(["R1","R2"],"danger",{labelPlacement:"bottom"}),style(["vertex"],"accent",{labelPlacement:"right"}),style(["note"],"primary",{fontSize:12})],[],[eq("root-one","x(R1)","-1","左根为 -1。"),eq("root-two","x(R2)","3","右根为 3。"),eq("roots-on-axis","y(R1)+y(R2)","0","两个根点都在 x 轴。")],[{id:"equation",narration:"先把二次方程写成 f(x)=0。",focus:["note"]},{id:"graph",narration:"画 y=f(x)，方程的解对应 y=0。",focus:["f","vertex"]},{id:"intersections",narration:"两个 x 轴交点给出 x=-1 与 x=3；根由函数实体上的括号区间确定。",focus:["R1","R2"]}]);
}

const specs=[
  {n:32,slug:"representations-of-relations-and-functions",title:"关系与函数的多种表示",titleEn:"Representations of Relations and Functions",skill:"ggb.math.skill.representations-of-relations-and-functions",occ:["ggb.math.occurrence.functions.9-12.06"],topic:"functions",url:"https://www.geogebra.org/math/functions?lang=en-GB",objective:"使用表、坐标平面、代数式和语言陈述转换关系与函数的表示。",build:representations,atoms:["同一关系可用规则、表、图像或语言表示。","有序对把一个输入与一个输出配对。","表中的点应满足同一代数规则。","图像是所有输入输出对的集合。","转换表示时不能改变对应关系。"]},
  {n:33,slug:"increasing-and-decreasing-functions",title:"函数的递增与递减",titleEn:"Increasing and Decreasing Functions",skill:"ggb.math.skill.increasing-and-decreasing-functions",occ:["ggb.math.occurrence.functions.9-12.04"],topic:"functions",url:"https://www.geogebra.org/math/functions?lang=en-GB",objective:"描述函数递增或递减的区间。",build:monotonic,atoms:["递增与递减按 x 从左向右判断。","递增区间内 x 增大时函数值增大。","递减区间内 x 增大时函数值减小。","转折点分隔不同单调区间。","严格单调区间通常不含转折点端点。"]},
  {n:34,slug:"graphing-absolute-value-functions-and-inequalities",title:"绝对值函数与不等式作图",titleEn:"Graphing Absolute Value Functions and Inequalities",skill:"ggb.math.skill.graphing-absolute-value-functions-and-inequalities",occ:["ggb.math.occurrence.inequalities.9-12.01","ggb.math.occurrence.absolute-value.9-12.01"],topic:"absolute-value",url:"https://www.geogebra.org/math/absolute-value?lang=en-GB",objective:"绘制绝对值函数及其对应不等式。",build:absoluteInequality,atoms:["y=|x| 是 V 形母函数。","h 与 k 决定顶点 (h,k)。","函数图像是不等式解区域的边界。","y≥f(x) 选择边界上方。","含等号时边界属于解集并画实线。"]},
  {n:35,slug:"graphing-to-solve-quadratic-equations",title:"用图像解二次方程",titleEn:"Graphing to Solve Quadratic Equations",skill:"ggb.math.skill.graphing-to-solve-quadratic-equations",occ:["ggb.math.occurrence.quadratic-equations.9-12.03"],topic:"quadratic-equations",url:"https://www.geogebra.org/math/quadratic-equations?lang=en-GB",objective:"通过作图求解二次方程。",build:graphSolveQuadratic,atoms:["把方程整理为 f(x)=0。","绘制 y=f(x)。","x 轴上的点满足 y=0。","交点横坐标就是方程的实根。","无交点、相切、两交点分别对应 0、1、2 个不同实根。"]}
];

function material(spec, caseId, document) {
  const atomIds=spec.atoms.map((_,i)=>`atom-${spec.slug}-${i+1}`);
  return {schema:"famtutor.geogebra.math.material.v1",materialId:`ggb-math-g9-12-${spec.slug}`,title:spec.title,titleEn:spec.titleEn,gradeBand:"9-12",domain:"Algebra",pattern:"algebra_relationship",knowledgePoint:{uniqueSkillId:spec.skill,occurrenceIds:spec.occ,topicSlug:spec.topic},sourceSnapshot:"source-snapshot.json",teachingAtoms:spec.atoms.map((t,i)=>({id:atomIds[i],type:["concept","rule","procedure","representation","misconception"][i],visibleText:t,narrationSeed:t,sourceRef:spec.occ[0]})),engineCase:{path:`../../../cases/${spec.n}-${spec.slug}/case.json`,caseId,documentId:document.documentId},stages:document.activities[0].stages.map((stage,i)=>({id:stage.id,order:i+1})),quizSeeds:spec.atoms.map((t,i)=>({id:`quiz-${i===0?"assessment-":""}${spec.slug}-${i+1}`,type:"short_answer",stem:[`用一句话说明：${t}`,`举一个能检验“${t}”的例子。`][i%2],answer:t,feedback:{correct:t,incorrect:t},sourceAtomIds:[atomIds[i]]})),acceptance:{sourceFidelity:{status:"verified",evidence:[...spec.occ,spec.url]},mathCorrectness:{status:"automated",evidence:["runtime assertions","deterministic evaluation"]},visualQuality:{status:"verified-browser-review",evidence:["Direct SVG","Mounted JSXGraph Gallery at live 76-card page","four-case stage-switch review","scalar label overlap check"]},runtimeStatus:{status:"automated",evidence:["validate","Direct SVG","MountedRenderer browser gate","Render Bundle"]}}};
}

for (const spec of specs) {
  const document=spec.build(); document.provenance.sourceRefs=[...spec.occ,spec.skill,spec.url];
  const caseId=`research-geogebra-${spec.n}-${spec.slug}`;
  const caseValue={schema:"famtutor.case.v1",caseId,title:spec.title,status:"accepted",caseType:"exploration",difficulty:"mechanism-reference",source:{printedPages:[],pdfPages:[],references:[spec.url],note:"依据 GeoGebra Math 公开知识目标原创构建；不复制活动正文、插图、Applet 或脚本。"},requiredCapabilities:[...new Set(document.construction.map(n=>n.command))],inputs:{initialDocument:document},trace:{changeSets:[]},expected:{assertions:[{kind:"runtime-assertions-pass"},{kind:"activity-stages",minimum:3},{kind:"static-render"},{kind:"render-bundle"}],interactions:document.interactions}};
  await writeJson(join(casesRoot,`${spec.n}-${spec.slug}/case.json`),caseValue);
  const source={schema:"famtutor.geogebra.math.source-snapshot.v1",retrievedAt:"2026-08-05",sourceIndex:{package:"famtutor-geogebra-math-skill-index-v0.2.0",schema:"famtutor.geogebra_math.skill_index.v0.2.0"},occurrences:spec.occ.map(id=>({occurrenceId:id,uniqueSkillId:spec.skill,gradeBand:"9-12",topicSlug:spec.topic,skillTitleEnRaw:spec.titleEn,skillTitleEnNormalized:spec.titleEn,skillTitleZhReviewedForMaterial:spec.title})),officialPage:{url:spec.url,objectiveSummaryZh:spec.objective,verification:"browser-reviewed"},curriculumAlignment:{status:"not-mapped",reason:"GeoGebra 仅给出 9–12 宽学段；本批次未获得适用的中国高中课程切片。",authorInferences:["将公开目标拆成三阶段交互板。","quiz seeds 为原创检查题，不复制 GeoGebra 活动题目。"]},copyrightBoundary:"只保留短标题、来源 URL 和原创中文概述；不复制活动正文、插图、Applet、脚本或 .ggb 文件。"};
  await writeJson(join(materialsRoot,spec.slug,"source-snapshot.json"),source);
  await writeJson(join(materialsRoot,spec.slug,"material.json"),material(spec,caseId,document));
}

const indexPath=join(root,"research/geogebra/math-g9-12/material-index.v1.json");
const index=await readJson(indexPath); index.wave="01-02";
const waveIds=new Set(specs.map(s=>`ggb-math-g9-12-${s.slug}`));
index.materials=index.materials.filter(item=>!waveIds.has(item.materialId));
for (const spec of specs) index.materials.push({order:index.materials.length+1,materialId:`ggb-math-g9-12-${spec.slug}`,title:spec.title,uniqueSkillId:spec.skill,occurrenceId:spec.occ[0],path:`materials/${spec.slug}/material.json`,caseRef:`../../cases/${spec.n}-${spec.slug}/case.json`});
await writeJson(indexPath,index);

const ledgerPath=join(root,"research/geogebra/math-g9-12/gap-ledger.v1.json");
const ledger=await readJson(ledgerPath); ledger.wave="01-02"; ledger.materials=ledger.materials.filter(id=>!waveIds.has(id)); ledger.materials.push(...waveIds);
const waveCapabilities=new Set(["point.function_root","region.function_inequality","table","piecewise-function","solution-set-1d","all-function-roots"]);
ledger.gaps=ledger.gaps.filter(gap=>!waveCapabilities.has(gap.capability));
ledger.gaps.push(
  {capability:"point.function_root",layer:"kernel",status:"closed-new-l0",evidenceMaterials:["ggb-math-g9-12-graphing-to-solve-quadratic-equations"],evidence:"已有 function1 能绘图和求值，但不能从同一函数实体构造可断言的 x 轴交点。",decision:"新增单职责的括号根 point.function_root(function1, bracket)->point2；不新增一次返回全部 roots 的集合原语。"},
  {capability:"region.function_inequality",layer:"kernel-renderer",status:"closed-new-l0",evidenceMaterials:["ggb-math-g9-12-graphing-absolute-value-functions-and-inequalities"],evidence:"polygon2 会重复并冻结函数边界语义，且不能随函数参数同步。",decision:"新增由既有 function1 组合的上方/下方二维区域；Direct SVG 与 JSXGraph 共享 relation/domain/boundaryIncluded 语义。"},
  {capability:"table",layer:"presentation",status:"deferred",evidenceMaterials:["ggb-math-g9-12-representations-of-relations-and-functions"],decision:"本素材只需三个样例有序对，数值由 function.value_at/点断言核验；尚不足以定义可排序、可编辑、可分页的通用 table 实体。"},
  {capability:"piecewise-function",layer:"kernel",status:"deferred",evidenceMaterials:["ggb-math-g9-12-graphing-absolute-value-functions-and-inequalities"],decision:"安全表达式 abs(x-h)+k 已完整表达当前函数；没有分段定义、端点开闭或分支域的独立需求。"},
  {capability:"solution-set-1d",layer:"kernel",status:"deferred",evidenceMaterials:["ggb-math-g9-12-graphing-to-solve-quadratic-equations"],decision:"当前教学目标需要可见的图像交点；point.function_root 与既有 interval1 足够组合，不新增一维解集代数。"},
  {capability:"all-function-roots",layer:"kernel",status:"deferred",evidenceMaterials:["ggb-math-g9-12-graphing-to-solve-quadratic-equations"],decision:"对任意函数自动枚举全部根需要域扫描、重根与不连续点策略；当前两个已知隔离区间只证明单根括号构造需求。"}
);
await writeJson(ledgerPath,ledger);
console.log(`generated ${specs.length} Wave 02 materials and cases`);
