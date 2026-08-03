import { mountMathRenderer, validateMathDocument } from "../dist/index.js";

const select = document.querySelector("#example");
const host = document.querySelector("#board");
const report = document.querySelector("#report");
const validationBadge = document.querySelector("#validation");
const revisionBadge = document.querySelector("#revision");
const strategyBadge = document.querySelector("#strategy");
const eventLog = document.querySelector("#events");
const btnAgent = document.querySelector("#btn-agent");
const btnIllegal = document.querySelector("#btn-illegal");

let renderer;
let events = [];

function pushEvent(event) {
  events = [event, ...events].slice(0, 40);
  eventLog.textContent = events.map(item =>
    `${item.sequence.toString().padStart(3, " ")}  ${item.type}${item.target ? ` → ${item.target}` : ""}`
  ).join("\n");
}

function syncBadges(update) {
  const doc = renderer.getDocument();
  revisionBadge.textContent = `rev ${doc.revision}`;
  if (update?.strategy) strategyBadge.textContent = update.strategy;
  report.textContent = JSON.stringify({
    validation: validateMathDocument(doc),
    state: renderer.getState(),
    lastUpdate: update ?? null,
    entities: doc.entities.map(entity => entity.id)
  }, null, 2);
}

async function loadExample(name) {
  await renderer?.destroy();
  events = [];
  eventLog.textContent = "";
  const documentModel = await fetch(`../examples/${name}`).then(response => {
    if (!response.ok) throw new Error(`Failed to load ${name}: ${response.status}`);
    return response.json();
  });
  const validation = validateMathDocument(documentModel);
  validationBadge.textContent = validation.status;
  renderer = await mountMathRenderer(host, documentModel);
  renderer.subscribe(pushEvent);
  strategyBadge.textContent = "rebuild";
  syncBadges();
}

async function simulateAgentSteps() {
  if (!renderer) return;
  const doc = renderer.getDocument();
  const id = `AgentPt${doc.revision}`;
  const update = await renderer.applyChangeSet({
    schema: "famtutor.engine.change-set.v1",
    changeSetId: `demo-agent-${Date.now().toString(36)}`,
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: doc.documentId,
      revision: doc.revision
    },
    operations: [{
      op: "construct",
      command: "point.free",
      outputs: [id],
      params: { coords: [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4] }
    }, {
      op: "construct",
      command: "segment.through_points",
      outputs: [`Seg${doc.revision}`],
      inputs: { a: "A", b: id }
    }],
    metadata: {
      timestamp: new Date().toISOString(),
      origin: "demo-agent"
    }
  });
  syncBadges(update);
}

async function simulateIllegal() {
  if (!renderer) return;
  const doc = renderer.getDocument();
  const update = await renderer.applyChangeSet({
    schema: "famtutor.engine.change-set.v1",
    changeSetId: `demo-illegal-${Date.now().toString(36)}`,
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: doc.documentId,
      revision: doc.revision
    },
    operations: [{
      op: "construct",
      command: "not.a.command",
      outputs: ["Bad"],
      params: { coords: [0, 0] }
    }]
  });
  syncBadges(update);
}

select.addEventListener("change", () => loadExample(select.value).catch(showError));
btnAgent.addEventListener("click", () => simulateAgentSteps().catch(showError));
btnIllegal.addEventListener("click", () => simulateIllegal().catch(showError));

function showError(error) {
  validationBadge.textContent = "error";
  report.textContent = error?.stack ?? String(error);
}

loadExample(select.value).catch(showError);
