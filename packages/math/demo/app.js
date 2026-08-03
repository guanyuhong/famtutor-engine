import { mountJsxGraph, validateMathDocument } from "../dist/index.js";

const select = document.querySelector("#example");
const host = document.querySelector("#board");
const report = document.querySelector("#report");
const validationBadge = document.querySelector("#validation");
let handle;

async function loadExample(name) {
  handle?.destroy();
  const documentModel = await fetch(`../examples/${name}`).then(response => {
    if (!response.ok) throw new Error(`Failed to load ${name}: ${response.status}`);
    return response.json();
  });
  const validation = validateMathDocument(documentModel);
  validationBadge.textContent = validation.status;
  handle = mountJsxGraph(host, documentModel, {
    onEvent(event) {
      report.textContent = JSON.stringify({ validation, render: handle.report(), lastEvent: event }, null, 2);
    }
  });
  await handle.ready;
  report.textContent = JSON.stringify({ validation, render: handle.report() }, null, 2);
}

select.addEventListener("change", () => loadExample(select.value).catch(showError));
function showError(error) {
  validationBadge.textContent = "error";
  report.textContent = error?.stack ?? String(error);
}
loadExample(select.value).catch(showError);
