/** Per-instance JSXGraph adaptation: rendering must use the same intrinsic frame as the domain evaluator.
 * No prototype modification. This requires the pinned JSXGraph glider update hooks; fail closed otherwise.
 */
import { MathEngineError } from "../errors.js";
import type { RuntimeValue } from "../types.js";
import { isCircle, point } from "../kernel/geometry.js";
import { pathParameterAt, pointAtPathParameter } from "../kernel/path-parameter.js";
import type { JxgObject } from "./jsxgraph.js";

interface Glider extends JxgObject {
  X: () => number;
  Y: () => number;
  coords: { setCoordinates(mode: number, coords: number[], round?: boolean): unknown };
  updateGlider: () => unknown;
  updateGliderFromParent: () => unknown;
  needsUpdateFromParent: boolean;
}
export function bindIntrinsicGlider(object: JxgObject, initialParameter: number, path: () => RuntimeValue | undefined, scale: () => number, coordinateMode: number): void {
  const glider=object as Glider;
  if (typeof glider.updateGlider!=="function" || typeof glider.updateGliderFromParent!=="function" || typeof glider.coords?.setCoordinates!=="function") {
    throw new MathEngineError("JSXGRAPH_PATH_HOOK_UNAVAILABLE", "The JSXGraph build has no supported intrinsic glider update hooks.");
  }
  let parameter=initialParameter;
  const update=glider.updateGlider.bind(glider);
  glider.updateGlider=()=>{
    const result=update();
    const target=path(),x=glider.X(),y=glider.Y();
    if (target && Number.isFinite(x) && Number.isFinite(y) && !(isCircle(target)&&target.radius===0)) {
      parameter=pathParameterAt(point(x,y),target,scale());
    }
    return result;
  };
  glider.updateGliderFromParent=()=>{
    // JSXGraph suppresses the first parent notification after a direct move.
    if (!glider.needsUpdateFromParent) {glider.needsUpdateFromParent=true;return;}
    try {
      const target=path();
      if (!target) throw new MathEngineError("UNDEFINED_PATH","The parent path is undefined.");
      const p=pointAtPathParameter(target,parameter,scale());
      glider.coords.setCoordinates(coordinateMode,[p.x,p.y],false);
    } catch {
      // Preserve parameter even when the parent is temporarily undefined.
      glider.coords.setCoordinates(coordinateMode,[NaN,NaN],false);
    }
  };
}
