import { evaluateMathDocument, mountMathRenderer, validateMathDocument } from "../dist/index.js";

const select = document.querySelector("#example");
const host = document.querySelector("#board");
const report = document.querySelector("#report");
const validationBadge = document.querySelector("#validation");
const revisionBadge = document.querySelector("#revision");
const strategyBadge = document.querySelector("#strategy");
const eventLog = document.querySelector("#events");
const btnAgent = document.querySelector("#btn-agent");
const btnIllegal = document.querySelector("#btn-illegal");
const documentControls = document.querySelector("#document-controls");

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
  renderDocumentControls();
}

function renderDocumentControls() {
  const doc = renderer?.getDocument();
  const controls = doc?.controls ?? [];
  documentControls.replaceChildren();
  documentControls.hidden = controls.length === 0;
  if (controls.length === 0) return;

  const runtime = evaluateMathDocument(doc);
  const title = document.createElement("h2");
  title.textContent = "案例控件";
  documentControls.append(title);

  for (const control of controls) {
    const row = document.createElement("label");
    row.className = "document-control";
    if (control.description) row.title = control.description;

    const input = document.createElement("input");
    input.type = control.kind === "checkbox" ? "checkbox" : "button";
    if (control.kind === "checkbox") {
      input.checked = runtime.entities.get(control.action.target)?.value === true;
    } else {
      input.value = control.label;
    }
    const text = document.createElement("span");
    text.textContent = control.label;
    if (control.kind === "button") text.hidden = true;

    input.addEventListener(control.kind === "checkbox" ? "change" : "click", async () => {
      input.disabled = true;
      const result = await renderer.dispatch({ type: "control.invoke", target: control.id, payload: {} });
      validationBadge.textContent = result.ok ? validateMathDocument(result.document).status : "invalid";
      syncBadges(result);
    });
    row.append(input, text);
    documentControls.append(row);
  }
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
  const is3D = documentModel.views.some(view => view.kind === "graphics3d");
  btnAgent.disabled = is3D;
  btnIllegal.disabled = false;
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
