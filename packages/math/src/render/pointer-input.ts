/** Accept a free-point input in the existing document without remounting a
 * captured board. Math comes exclusively from the existing validator/evaluator.
 * Pending/undefined topology transitions are intentionally not accepted here. */
import type { MathDocument } from "../types.js";
import { validateMathDocument } from "../protocol/validate.js";
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
  const validation = validateMathDocument(candidate);
  if (validation.status === "invalid" || validation.undefinedEntities.length > 0 || validation.issues.some(issue => issue.severity === "error")) throw new MathEngineError("POINTER_STATE_NOT_ACCEPTED", JSON.stringify(validation.issues));
  // Retain document/node identity used by existing renderer resolvers. Only an
  // independently checked source input and revision change, never derived values.
  node.params = changed.params;
  document.revision = candidate.revision;
  return true;
}
