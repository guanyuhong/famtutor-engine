import { performance } from "node:perf_hooks";
import { evaluateMathDocument, renderDirectSvg, validateMathDocument } from "../dist/index.js";

const count = Number(process.env.BENCHMARK_NODES ?? 1200);
const entities = [
  { id: "A", type: "point2", role: "free" },
  { id: "B", type: "point2", role: "free" }
];
const construction = [
  { id: "op-A", command: "point.free", params: { coords: [-5, 0] }, outputs: ["A"] },
  { id: "op-B", command: "point.free", params: { coords: [5, 0] }, outputs: ["B"] }
];
let previous = "A";
for (let index = 0; index < count; index += 1) {
  const id = `M${index}`;
  entities.push({ id, type: "point2", role: "derived" });
  construction.push({ id: `op-${id}`, command: "point.midpoint", inputs: [{ ref: previous }, { ref: "B" }], outputs: [id] });
  previous = id;
}
const document = {
  schema: "famtutor.math.document.v1",
  documentId: "benchmark-chain",
  revision: 1,
  seed: 1,
  metadata: { title: "Benchmark chain", locale: "en", purpose: "authoring" },
  entities,
  construction,
  views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-6, 2, 6, -2], axes: false, grid: false }]
};

const started = performance.now();
const validation = validateMathDocument(document);
const validated = performance.now();
if (validation.status !== "valid") throw new Error(JSON.stringify(validation.issues.slice(0, 5)));
const evaluation = evaluateMathDocument(document);
const evaluated = performance.now();
if (evaluation.entities.size !== count + 2 || evaluation.issues.length !== 0) throw new Error("Benchmark evaluation incomplete");
const rendered = renderDirectSvg(document, { width: 1200, height: 400 });
const finished = performance.now();
if (!rendered.svg.startsWith("<svg")) throw new Error("Benchmark render failed");

const result = {
  nodes: construction.length,
  entities: entities.length,
  validationMs: Number((validated - started).toFixed(2)),
  evaluationMs: Number((evaluated - validated).toFixed(2)),
  directSvgMs: Number((finished - evaluated).toFixed(2)),
  totalMs: Number((finished - started).toFixed(2)),
  svgBytes: Buffer.byteLength(rendered.svg),
  renderedEntities: rendered.report.renderedEntities.length
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.totalMs > 10_000) throw new Error(`Benchmark exceeded safety ceiling: ${result.totalMs}ms`);
