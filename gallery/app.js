import { MathDomainRuntime, mountMathRenderer } from "/packages/math/dist/index.js";

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
  "/corpus/books/zjedu-math-8a-2013/cases/10-midpoint-area/case.json"
];

const runtime = new MathDomainRuntime();
const gallery = document.querySelector("#gallery");
const template = document.querySelector("#case-card-template");
const errorPanel = document.querySelector("#error-panel");
const rendererByCase = new Map();
const replayedDocumentByCase = new Map();

function caseNumber(caseId) {
  return caseId.match(/-(\d{2})-/)?.[1] ?? "??";
}

function sourceLabel(caseSpec) {
  const printed = caseSpec.source.printedPages.join("–");
  const pdf = caseSpec.source.pdfPages.join("–");
  return `印刷页 ${printed} · PDF ${pdf}`;
}

function interactionLabel(caseSpec) {
  const interactions = caseSpec.expected.interactions ?? [];
  if (interactions.length === 0) return "观察案例 · 无需操作";
  const dragCount = interactions.filter(item => item.permission === "drag").length;
  const scalarCount = interactions.filter(item => item.permission === "set_value").length;
  const parts = [];
  if (dragCount) parts.push(`可拖动 ${dragCount} 个对象`);
  if (scalarCount) parts.push(`可调整 ${scalarCount} 个滑块`);
  return parts.join(" · ") || `${interactions.length} 个可交互对象`;
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

async function mountCase(caseSpec, card, documentValue) {
  const previous = rendererByCase.get(caseSpec.caseId);
  if (previous) await previous.destroy();
  const host = card.querySelector(".case-board");
  const renderer = await mountMathRenderer(host, structuredClone(documentValue));
  rendererByCase.set(caseSpec.caseId, renderer);
  card.querySelector(".loading-mask").hidden = true;
  card.dataset.mounted = "true";
}

function createCard(caseSpec) {
  const card = template.content.firstElementChild.cloneNode(true);
  const number = caseNumber(caseSpec.caseId);
  card.dataset.caseId = caseSpec.caseId;
  card.dataset.status = caseSpec.status;
  card.dataset.caseType = caseSpec.caseType;
  card.querySelector(".case-id").textContent = `CASE ${number} · ${caseSpec.caseType}`;
  card.querySelector(".case-title").textContent = caseSpec.title;

  const chip = card.querySelector(".status-chip");
  chip.textContent = caseSpec.status === "accepted" ? "ACCEPTED" : "EXPECTED UNSUPPORTED";
  chip.classList.add(caseSpec.status === "accepted" ? "is-accepted" : "is-unsupported");

  card.querySelector(".case-meta").textContent = `${sourceLabel(caseSpec)} · ${caseSpec.difficulty}`;
  card.querySelector(".interaction-hint").textContent = interactionLabel(caseSpec);
  card.querySelector(".capabilities").textContent = caseSpec.requiredCapabilities.join(" · ");

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
    applyFilter
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
