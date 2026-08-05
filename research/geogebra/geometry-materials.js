const CATALOG_URL = "./geometry-material-catalog.v1.json";

const FAMILY_LABELS = {
  "angle-trigonometry": "角与三角",
  area: "面积",
  circle: "圆",
  conic: "圆锥曲线",
  construction: "几何作图",
  curve: "曲线",
  "general-geometry": "通用几何",
  locus: "轨迹",
  "solid-3d": "空间几何",
  triangle: "三角形",
  transform: "几何变换",
  vector: "向量"
};

const PRIORITY_LABELS = {
  A: "A · 优先检查",
  B: "B · 家族补充",
  "review-source-quality": "来源质量复核",
  "deferred-specialized-renderer": "等待专用渲染器"
};

const STATE_LABELS = {
  "ready-for-ggb-inspection": "可进入 GGB 检查",
  "inspect-then-resolve-dependencies": "检查后处理依赖",
  "needs-specialized-renderer-review": "需专用渲染器评估",
  "ggb-inspected-needs-semantic-review": "GGB 已检查 · 等待语义归纳"
};

let catalog;
let mode = "materials";

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function chips(values, className = "chip") {
  const fragment = document.createDocumentFragment();
  for (const value of values) fragment.append(text("span", value, className));
  return fragment;
}

function familyLabel(family) {
  return FAMILY_LABELS[family] ?? family;
}

function materialSearchText(material) {
  return [material.materialId, ...material.titles, ...material.families, ...material.reuse.books.map(book => book.title)].join(" ").toLocaleLowerCase();
}

function leadSearchText(lead) {
  return [lead.title, ...lead.families, ...lead.books].join(" ").toLocaleLowerCase();
}

function showMaterial(material) {
  const content = document.querySelector("#dialog-content");
  content.replaceChildren();
  content.append(text("p", material.materialId, "dialog-id"));
  content.append(text("h2", material.titles.join(" / ")));
  content.append(text("p", STATE_LABELS[material.extractionState] ?? material.extractionState, "dialog-state"));

  const definition = document.createElement("dl");
  const fields = [
    ["几何家族", material.families.map(familyLabel).join("、")],
    ["优先级", PRIORITY_LABELS[material.inspectionPriority] ?? material.inspectionPriority],
    ["能力依赖", material.dependencies.join("、") || "无已知新增依赖"],
    ["跨 Book", `${material.reuse.bookCount} 本：${material.reuse.books.map(book => book.title).join("、")}`],
    ["证据", material.evidence.confidence],
    ["已知命令", material.inspection ? Object.keys(material.inspection.commandNames).join("、") : (material.evidence.commands.join("、") || "等待 .ggb 检查")],
    ["检查统计", material.inspection ? `${material.inspection.elementCount} 个元素；${material.inspection.commandCount} 个命令；${material.inspection.gapCommandCount} 个 gap；${material.inspection.unknownCommandCount} 个 unknown` : "尚未检查本地 .ggb"],
    ["Custom tools", material.inspection?.macroNames?.join("、") || material.evidence.customTools.join("、") || "无已知记录"],
    ["待补能力", material.inspection?.gapCapabilities?.map(gap => `${gap.requiredCapability} × ${gap.count}`).join("；") || "无"]
  ];
  for (const [term, description] of fields) {
    definition.append(text("dt", term));
    definition.append(text("dd", description));
  }
  content.append(definition);
  const link = document.createElement("a");
  link.href = material.sourceUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.className = "source-link";
  link.textContent = "打开 GeoGebra 来源 ↗";
  content.append(link);
  document.querySelector("#material-dialog").showModal();
}

function materialCard(material) {
  const article = document.createElement("article");
  article.className = "material-card";
  article.dataset.search = materialSearchText(material);
  article.dataset.priority = material.inspectionPriority;
  article.dataset.families = material.families.join(" ");

  const head = document.createElement("header");
  const identity = document.createElement("div");
  identity.append(text("p", material.materialId, "material-id"));
  identity.append(text("h2", material.titles.join(" / ")));
  head.append(identity);
  head.append(text("span", PRIORITY_LABELS[material.inspectionPriority] ?? material.inspectionPriority, `priority priority-${material.inspectionPriority}`));
  article.append(head);

  const tags = document.createElement("div");
  tags.className = "chips";
  tags.append(chips(material.families.map(familyLabel)));
  if (catalog.firstWave.includes(material.materialId)) tags.append(text("span", "FIRST WAVE", "chip first-wave"));
  if (material.inspection) tags.append(text("span", "GGB INSPECTED", "chip inspected"));
  article.append(tags);

  article.append(text("p", STATE_LABELS[material.extractionState] ?? material.extractionState, "state"));
  const metrics = document.createElement("div");
  metrics.className = "metrics";
  metrics.append(text("span", `${material.reuse.bookCount} Books`));
  metrics.append(text("span", material.dependencies.length ? `${material.dependencies.length} dependencies` : "现有二维能力候选"));
  article.append(metrics);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "inspect-button";
  button.textContent = "查看研究记录";
  button.addEventListener("click", () => showMaterial(material));
  article.append(button);
  return article;
}

function leadCard(lead) {
  const article = document.createElement("article");
  article.className = "material-card lead-card";
  article.dataset.search = leadSearchText(lead);
  article.dataset.families = lead.families.join(" ");
  article.append(text("p", "MATERIAL ID UNKNOWN", "material-id"));
  article.append(text("h2", lead.title));
  const tags = document.createElement("div");
  tags.className = "chips";
  tags.append(chips(lead.families.map(familyLabel)));
  article.append(tags);
  article.append(text("p", `来源 Book：${lead.books.join("、")}`, "state"));
  return article;
}

function render() {
  const root = document.querySelector("#catalog");
  root.replaceChildren();
  const items = mode === "materials" ? catalog.materials : catalog.unresolvedTitles;
  for (const item of items) root.append(mode === "materials" ? materialCard(item) : leadCard(item));
  document.querySelector("#priority-field").hidden = mode !== "materials";
  applyFilters();
}

function applyFilters() {
  const query = document.querySelector("#search").value.trim().toLocaleLowerCase();
  const family = document.querySelector("#family-filter").value;
  const priority = document.querySelector("#priority-filter").value;
  let visible = 0;
  for (const card of document.querySelectorAll(".material-card")) {
    const matches = (!query || card.dataset.search.includes(query))
      && (family === "all" || card.dataset.families.split(" ").includes(family))
      && (mode !== "materials" || priority === "all" || card.dataset.priority === priority);
    card.hidden = !matches;
    if (matches) visible += 1;
  }
  const total = mode === "materials" ? catalog.materials.length : catalog.unresolvedTitles.length;
  document.querySelector("#visible-count").textContent = `显示 ${visible} / ${total}`;
}

function populateFilters() {
  const familySelect = document.querySelector("#family-filter");
  for (const family of Object.keys(catalog.summary.familyCounts)) {
    const option = document.createElement("option");
    option.value = family;
    option.textContent = `${familyLabel(family)} · ${catalog.summary.familyCounts[family]}`;
    familySelect.append(option);
  }
  const prioritySelect = document.querySelector("#priority-filter");
  for (const priority of Object.keys(catalog.summary.priorityCounts)) {
    const option = document.createElement("option");
    option.value = priority;
    option.textContent = `${PRIORITY_LABELS[priority] ?? priority} · ${catalog.summary.priorityCounts[priority]}`;
    prioritySelect.append(option);
  }
}

async function initialize() {
  const response = await fetch(CATALOG_URL);
  if (!response.ok) throw new Error(`目录加载失败：HTTP ${response.status}`);
  catalog = await response.json();
  document.querySelector("#material-count").textContent = catalog.summary.uniqueMaterialIds;
  document.querySelector("#priority-count").textContent = catalog.summary.priorityCounts.A;
  document.querySelector("#unresolved-count").textContent = catalog.summary.unresolvedTitles;
  document.querySelector("#inspected-count").textContent = catalog.summary.inspectedMaterials;
  populateFilters();
  render();

  document.querySelector("#search").addEventListener("input", applyFilters);
  document.querySelector("#family-filter").addEventListener("change", applyFilters);
  document.querySelector("#priority-filter").addEventListener("change", applyFilters);
  for (const tab of document.querySelectorAll(".mode-tab")) {
    tab.addEventListener("click", () => {
      mode = tab.dataset.mode;
      for (const candidate of document.querySelectorAll(".mode-tab")) {
        const active = candidate === tab;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-selected", String(active));
      }
      render();
    });
  }
}

initialize().catch(error => {
  const panel = document.querySelector("#error-panel");
  panel.hidden = false;
  panel.textContent = error.message;
});
