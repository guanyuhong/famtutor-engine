/** Canonical drag persistence shared by simulation, MountedRenderer and compatibility tests. */
import type { JsonValue, MathDocument } from "../types.js";
import { MathEngineError } from "../errors.js";
import { evaluateMathDocument } from "./evaluate.js";
import { evaluateNumericExpression } from "../expression/evaluator.js";
import { pathParameterAt } from "./path-parameter.js";
import { point, isCircle } from "./geometry.js";

export function pathPointDragPatch(document: MathDocument, target: string, coords: [number, number]): Record<string, JsonValue> {
  if (!Array.isArray(coords) || coords.length!==2 || !coords.every(Number.isFinite)) throw new MathEngineError("INVALID_COORDS","Drag requires finite coordinates.");
  const node=document.construction.find(n=>n.outputs.includes(target));
  if (!node || node.command!=="point.on_path") throw new MathEngineError("NOT_PATH_POINT",`'${target}' is not a path point.`);
  const patch:Record<string,JsonValue>={initial:[...coords]};
  // Legacy documents retain world-coordinate reprojection until explicitly parameterized.
  if (node.params?.pathParameter===undefined) return patch;
  const input=node.inputs?.[0];
  if (!input || !("ref" in input)) throw new MathEngineError("UNDEFINED_PATH","Missing path reference.");
  const evaluated=evaluateMathDocument(document),path=evaluated.entities.get(input.ref)?.value;
  if (!path) throw new MathEngineError("UNDEFINED_PATH","Cannot drag a point on an undefined path.");
  // A point circle has no new direction to infer; retain the previous angle across collapse/recovery.
  if (isCircle(path) && path.radius === 0) return patch;
  const raw=node.params.pathScale??1;
  const scale=typeof raw==="number"?raw:typeof raw==="string"?evaluateNumericExpression(raw,id=>evaluated.entities.get(id)?.value):NaN;
  patch.pathParameter=pathParameterAt(point(coords[0],coords[1]),path,scale);
  return patch;
}
