/** Accept a free-point input in the existing document without remounting a
 * captured board. Math comes exclusively from the existing validator/evaluator.
 * Pending/undefined topology transitions are intentionally not accepted here. */
import type { MathDocument } from "../types.js";
import { evaluateMathDocument } from "../kernel/evaluate.js";
import { buildConstructionGraph } from "../kernel/dag.js";
import { validateMathDocumentStructure, validateMathDocument } from "../protocol/validate.js";
import { MathEngineError } from "../errors.js";
import { deepClone } from "../util.js";

export function acceptPointerInput(document: MathDocument, target: string, coords: readonly number[]): boolean {
  const entity = document.entities.find(e => e.id === target);
  const node = document.construction.find(n => n.outputs.includes(target));
  const permissions = document.interactions?.find(i => i.target === target);
  if (entity?.type !== "point2" || node?.command !== "point.free"
    || !(permissions ? permissions.permissions.includes("drag") : entity.role === "free")) {
    throw new MathEngineError("INTERACTION_NOT_ALLOWED", "Continuous pointer input requires an editable free point.");
  }
  if (coords.length !== 2 || !coords.every(Number.isFinite)) throw new MathEngineError("INVALID_COORDINATES", "Pointer coordinates must be finite.");
  const previous = node.params?.coords;
  if (Array.isArray(previous) && previous[0] === coords[0] && previous[1] === coords[1]) return false;
  const candidate = deepClone(document);
  const changed = candidate.construction.find(n => n.id === node.id)!;
  changed.params = { ...changed.params, coords: [coords[0]!, coords[1]!] };
  candidate.revision++;
  const structure = validateMathDocumentStructure(candidate);
  if (structure.status === "invalid") throw new MathEngineError("POINTER_STATE_NOT_ACCEPTED", JSON.stringify(structure.issues));
  const graph = buildConstructionGraph(candidate);
  const affected = new Set([node.id]);
  for (const id of graph.order) if ((graph.nodeDependencies.get(id) ?? []).some(parent => affected.has(parent))) affected.add(id);
  const before = evaluateMathDocument(document), after = evaluateMathDocument(candidate);
  const allowedUndefined = new Set<string>(), allowedIssues = new Set<string>();
  const domainCodes = new Set(["INVALID_RADIUS", "DEGENERATE_LINE", "DEGENERATE_RAY", "DEGENERATE_TRANSFORM"]);
  // An unchanged, unrelated domain-undefined branch cannot veto this edit.
  // Type/programming/structure errors, global assertions, and any undefined
  // object in the affected closure still reject atomically. No geometry is
  // reconstructed from prior values; only existing diagnostics are compared.
  for (const id of graph.order) {
    if (affected.has(id)) continue;
    const outputs = graph.outputsByNode.get(id) ?? [];
    const admitted = outputs.length > 0 && outputs.every(output => {
      const prior = before.entities.get(output), current = after.entities.get(output);
      return prior && current && !prior.defined && !current.defined
        && JSON.stringify(prior.issue) === JSON.stringify(current.issue)
        && (domainCodes.has(current.issue?.code ?? "") || current.issue?.code === "UNDEFINED_DEPENDENCY"
          && current.dependencies.some(parent => allowedUndefined.has(parent)));
    });
    if (admitted) for (const output of outputs) {
      allowedUndefined.add(output);
      allowedIssues.add(JSON.stringify(after.entities.get(output)!.issue));
    }
  }
  const validation = validateMathDocument(candidate);
  if (validation.undefinedEntities.some(id => !allowedUndefined.has(id))
    || validation.issues.some(issue => issue.severity === "error" && !allowedIssues.has(JSON.stringify(issue)))) {
    throw new MathEngineError("POINTER_STATE_NOT_ACCEPTED", JSON.stringify(validation.issues));
  }
  // Retain document/node identity used by existing renderer resolvers. Only an
  // independently checked source input and revision change, never derived values.
  node.params = changed.params;
  document.revision = candidate.revision;
  return true;
}
