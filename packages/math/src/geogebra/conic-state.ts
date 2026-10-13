/** Source-compatible conic state transitions over the ORIGINAL MathDocument.
 * Not a geometry evaluator. Defined geometry is always recomputed by the kernel.
 * See fixed upstream AlgoRadius / GeoQuadricND / GeoConicND sources in docs.
 */
import type { ConstructionNode, JsonValue, MathDocument } from '../types.js';
import { evaluateMathDocument } from '../kernel/evaluate.js';
import { buildConstructionGraph } from '../kernel/dag.js';
import { readConicAxisState, type ConicAxisState } from '../kernel/conic-state.js';
import { isCircle } from '../kernel/geometry.js';
import { pathPointDragPatch } from '../kernel/path-state.js';
import { MathEngineError } from '../errors.js';

const empty = (): ConicAxisState => ({classification:'empty',halfAxis:null});
function refs(node: ConstructionNode): string[] {
  return (node.inputs??[]).filter((x): x is {ref:string} => 'ref' in x).map(x=>x.ref);
}
export function synchronizeGeoGebraConicState(document: MathDocument): void {
  const graph=buildConstructionGraph(document), evaluation=evaluateMathDocument(document);
  for(const nodeId of graph.order) {
    const node=graph.nodeById.get(nodeId)!, id=node.outputs[0]!;
    const entity=evaluation.entities.get(id);
    if(entity?.entity.type!=='circle2') continue;
    let state=readConicAxisState(node)??empty();
    if(entity.defined&&isCircle(entity.value)) {
      state={classification:entity.value.radius===0?'point':'circle',halfAxis:entity.value.radius};
    } else if(node.command==='transform.apply'||node.command==='circle.invert_in_circle') {
      const sourceId=refs(node)[0]!, sourceNode=graph.nodeById.get(graph.producerByEntity.get(sourceId)!);
      const sourceState=readConicAxisState(sourceNode)??empty();
      // Transform algorithms copy conic axes before attempting the transform.
      // A singular inversion of a *defined* circle does not preserve a circle.
      state=node.command==='circle.invert_in_circle'&&evaluation.entities.get(sourceId)?.defined
        ? empty() : sourceState;
    } else if(node.command!=='circle.center_radius') {
      state=empty();
    }
    // circle.center_radius with an invalid new input retains its existing axes;
    // the geometric output remains undefined and is NEVER reconstructed here.
    node.params={...node.params,conicAxisState:state as unknown as JsonValue};
  }
}

export function setGeoGebraInput(document: MathDocument, target:string, change:{coords:[number,number]}|{value:number}): void {
  const node=document.construction.find(n=>n.outputs.includes(target));
  if(!node) throw new MathEngineError('OBJECT_MISSING',target);
  if('coords' in change) {
    if(!['point.free','point.on_path'].includes(node.command)||!Array.isArray(change.coords)||change.coords.length!==2||!change.coords.every(Number.isFinite))
      throw new MathEngineError('INPUT_NOT_EDITABLE','Expected an editable finite 2D point.');
  } else if(!['scalar.constant','scalar.slider'].includes(node.command)||!Number.isFinite(change.value)) {
    throw new MathEngineError('INPUT_NOT_EDITABLE','Expected an editable finite scalar.');
  }
  synchronizeGeoGebraConicState(document);
  if('coords' in change) {
    if(node.command==='point.on_path') node.params={...node.params,...pathPointDragPatch(document,target,change.coords)};
    else node.params={...node.params,coords:[...change.coords]};
  } else node.params={...node.params,value:change.value};
  document.revision++;
  synchronizeGeoGebraConicState(document);
}
