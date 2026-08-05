#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const CURRICULUM_CLUSTER_SCHEMA = "famtutor.geogebra.curriculum-mechanism-clusters.v1";

const FAMILY_RULES = Object.freeze([
  ["circle", /(?:【[^】]*圆[^】]*】|阿氏圆|阿波罗尼斯圆|弓形|圆周|切线|直径|半径|弦)/i],
  ["triangle", /三角形|三角板|全等|角平分线|中线|垂心|内角|外角|飞镖模型|八字模型|手拉手模型/i],
  ["quadrilateral", /四边形|平行四边形|矩形|菱形|正方形|梯形/i],
  ["function", /函数|抛物线|图象/i],
  ["symmetry-transform", /轴对称|中心对称|平移|旋转|翻折|折叠/i],
  ["inequality", /不等式|不等关系/i],
  ["algebra", /整式|因式分解|二次根式|方程/i]
]);

const IMPORTANT_TOPIC = /定义|内角和|外角定理|三角形的高|三角形的中线|三角形的角平分线|边边边|边角边|角边角|角角边|没有边边角|阿氏圆|弓形面积最小/i;

function countControls(controls = {}) {
  return Object.fromEntries(["sliders", "checkboxes", "buttons", "inputs"].map(key => [key, controls[key]?.length ?? 0]));
}

function commandNames(brief) {
  return Object.keys(brief.evidence?.structure?.commands?.byName ?? {});
}

export function classifyGeometryFamilies(title) {
  const families = FAMILY_RULES.filter(([, pattern]) => pattern.test(title)).map(([family]) => family);
  return families.length ? families : ["general-math"];
}

export function mechanismsForBrief(brief) {
  const structure = brief.evidence?.structure ?? {};
  const controls = countControls(structure.controls);
  const commands = commandNames(brief);
  const tags = new Set(structure.capabilityTags ?? []);
  const mechanisms = [];
  if ((structure.conditionalVisibility?.length ?? 0) > 0) mechanisms.push("conditional-visibility");
  if (controls.checkboxes > 0) mechanisms.push("checkbox-control");
  if (controls.buttons > 0) mechanisms.push("button-action");
  if (controls.sliders > 0) mechanisms.push("slider-control");
  if ((structure.animations?.length ?? 0) > 0 || tags.has("animation")) mechanisms.push("animation");
  if (tags.has("simulation")) mechanisms.push("simulation");
  if (tags.has("transform") || commands.some(name => /Rotate|Translate|Mirror|Reflect|Dilate|Stretch/i.test(name))) mechanisms.push("transform");
  if (tags.has("sequence") || commands.some(name => /Sequence|Zip/i.test(name))) mechanisms.push("sequence");
  if ((structure.macros?.length ?? 0) > 0 || tags.has("custom_tool")) mechanisms.push("imported-macro");
  if ((structure.scriptApiCalls?.length ?? 0) > 0) mechanisms.push("script-action-evidence");
  return [...new Set(mechanisms)].sort();
}

function chapterKey(curriculum = {}) {
  const grade = curriculum.grade ? `grade-${curriculum.grade}${curriculum.term ?? ""}` : "grade-unspecified";
  const chapter = curriculum.chapter ? `chapter-${curriculum.chapter}` : "chapter-unspecified";
  return `${grade}/${chapter}/${curriculum.category ?? "未分类"}`;
}

function capabilityState(brief) {
  const assessment = brief.capabilityAssessment ?? {};
  if ((assessment.gapCommandOccurrences ?? 0) > 0) return "blocked-capability";
  if ((assessment.unknownCommandOccurrences ?? 0) > 0) return "needs-alias-or-semantic-review";
  return "ready-for-original-reproduction";
}

function candidateScore(item) {
  let score = 0;
  if (item.curriculum.kind === "theorem-model") score += 30;
  if (IMPORTANT_TOPIC.test(item.title)) score += 18;
  score += Math.min(20, item.capabilityAssessment.exactCommandOccurrences / 2);
  score += Math.min(12, item.mechanisms.length * 2);
  score += item.visibleTextCount > 0 ? 5 : 0;
  score -= item.capabilityAssessment.gapCommandOccurrences * 14;
  score -= item.capabilityAssessment.unknownCommandOccurrences * 3;
  return Math.round(score * 10) / 10;
}

function representationRole(item) {
  if (item.capabilityState !== "ready-for-original-reproduction") return "boundary";
  if (item.mechanisms.length >= 5 || item.capabilityAssessment.exactCommandOccurrences >= 30) return "typical";
  return "minimal";
}

function compactItem(brief) {
  const title = brief.source.title;
  const families = classifyGeometryFamilies(title);
  const mechanisms = mechanismsForBrief(brief);
  const controls = countControls(brief.evidence?.structure?.controls);
  const assessment = brief.capabilityAssessment;
  const item = {
    materialId: brief.source.profileMaterialId,
    sourceUrl: brief.source.sourceUrl,
    title,
    curriculum: brief.curriculum,
    chapterKey: chapterKey(brief.curriculum),
    families,
    mechanisms,
    controls,
    visibleTextCount: brief.evidence?.visibleText?.strings?.length ?? 0,
    structure: {
      elementCount: brief.evidence?.structure?.elements?.total ?? 0,
      commandCount: brief.evidence?.structure?.commands?.total ?? 0,
      macroCount: brief.evidence?.structure?.macros?.length ?? 0
    },
    capabilityAssessment: {
      exactCommandOccurrences: assessment.exactCommandOccurrences,
      gapCommandOccurrences: assessment.gapCommandOccurrences,
      unknownCommandOccurrences: assessment.unknownCommandOccurrences,
      gaps: assessment.gaps,
      unknown: assessment.unknown
    },
    capabilityState: capabilityState(brief),
    sourceSha256: brief.source.ggbSha256,
    scriptsExecuted: false
  };
  return { ...item, score: candidateScore(item), representationRole: representationRole(item) };
}

function frequency(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

function expandedClusters(items) {
  const clusters = new Map();
  for (const item of items) {
    for (const family of item.families) {
      for (const mechanism of item.mechanisms.length ? item.mechanisms : ["static-construction"]) {
        const key = `${item.chapterKey}|${mechanism}|${family}`;
        const current = clusters.get(key) ?? {
          key,
          chapterKey: item.chapterKey,
          family,
          mechanism,
          count: 0,
          materialIds: []
        };
        current.count += 1;
        current.materialIds.push(item.materialId);
        clusters.set(key, current);
      }
    }
  }
  return [...clusters.values()]
    .map(cluster => ({ ...cluster, materialIds: cluster.materialIds.sort() }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function selectWave(items, family, limit) {
  const candidates = items.filter(item => item.families.includes(family));
  const chosen = [];
  const take = predicate => {
    const candidate = candidates.filter(item => !chosen.includes(item) && predicate(item))
      .sort((a, b) => b.score - a.score || a.materialId.localeCompare(b.materialId))[0];
    if (candidate) chosen.push(candidate);
  };
  take(item => item.representationRole === "minimal");
  take(item => item.representationRole === "typical");
  take(item => item.representationRole === "boundary");
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.materialId.localeCompare(b.materialId))) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  return chosen.slice(0, limit);
}

export function buildCurriculumClusters(briefs, options = {}) {
  const items = briefs.map(compactItem).sort((a, b) => a.materialId.localeCompare(b.materialId));
  const triangleWave = selectWave(items, "triangle", options.triangleLimit ?? 8);
  const circleWave = selectWave(items, "circle", options.circleLimit ?? 4);
  const firstWave = [...triangleWave, ...circleWave].filter((item, index, all) => index === all.findIndex(candidate => candidate.materialId === item.materialId));
  return {
    schema: CURRICULUM_CLUSTER_SCHEMA,
    source: {
      profileUrl: options.profileUrl ?? "https://www.geogebra.org/u/秋风",
      materialCount: items.length,
      rawGgbIncluded: false,
      scriptsExecuted: false
    },
    summary: {
      materials: items.length,
      chapters: frequency(items.map(item => item.chapterKey)),
      mechanisms: frequency(items.flatMap(item => item.mechanisms.length ? item.mechanisms : ["static-construction"])),
      families: frequency(items.flatMap(item => item.families)),
      capabilityStates: frequency(items.map(item => item.capabilityState)),
      triangleMaterials: items.filter(item => item.families.includes("triangle")).length,
      circleMaterials: items.filter(item => item.families.includes("circle")).length
    },
    firstWave: firstWave.map(item => ({
      materialId: item.materialId,
      title: item.title,
      family: item.families.includes("circle") ? "circle" : "triangle",
      representationRole: item.representationRole,
      score: item.score,
      capabilityState: item.capabilityState,
      mechanisms: item.mechanisms,
      gaps: item.capabilityAssessment.gaps,
      unknown: item.capabilityAssessment.unknown
    })),
    clusters: expandedClusters(items),
    materials: items
  };
}

async function loadBriefs(seedDirectory) {
  const index = JSON.parse(await fs.readFile(path.join(seedDirectory, "index.json"), "utf8"));
  return Promise.all(index.items.map(item => fs.readFile(path.join(seedDirectory, item.file), "utf8").then(JSON.parse)));
}

async function main() {
  const [seedDirectory, outputPath] = process.argv.slice(2);
  if (!seedDirectory || !outputPath) {
    process.stdout.write("Usage: node scripts/geogebra/curriculum-cluster.mjs <semantic-brief-seed-directory> <output-json>\n");
    return;
  }
  const catalog = buildCurriculumClusters(await loadBriefs(path.resolve(seedDirectory)));
  const target = path.resolve(outputPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ materials: catalog.summary.materials, clusters: catalog.clusters.length, firstWave: catalog.firstWave.length, output: target }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
