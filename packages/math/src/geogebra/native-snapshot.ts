/** Native canonical persistence, NOT GeoGebra XML or an Apps API method.
 * Stores construction inputs and legitimate conic axes, never evaluated outputs.
 */
import type { MathDocument } from '../types.js';
import { validateMathDocumentStructure } from '../protocol/validate.js';
import { readConicAxisState } from '../kernel/conic-state.js';

export interface NativeApiDefinition { id:string; expression?:string; command?:string; args?:string[] }
export interface NativeApiSnapshot {
  schema:'famtutor.geogebra-native.snapshot.v1';
  document:MathDocument;
  definitions:Array<[string,NativeApiDefinition]>;
  serial:number;
}
const primitives = new Set([
  'scalar.constant','boolean.constant','function.explicit','function.value_at',
  'point.free','point.from_expressions','vector.components','vector.between_points',
  'point.midpoint','line.through_points','segment.through_points','transform.translate',
  'transform.apply','circle.center_radius','point.circle_center','measurement.circle_radius'
]);
const commands = new Set(['Midpoint','Vector','Line','Segment','Translate','Circle','Center','Radius']);
function jsonData(value:unknown,depth=0,budget={nodes:0}):void {
  if(depth>64||++budget.nodes>100000)throw Error('Snapshot resource limit');
  if(value===null||typeof value==='boolean'||typeof value==='string')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(typeof value!=='object')throw Error('Snapshot must contain finite JSON data only');
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==(Array.isArray(value)?Array.prototype:Object.prototype))
    throw Error('Snapshot must contain plain arrays and records');
  for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if(descriptor.get||descriptor.set)throw Error('Snapshot accessors are not data');
    const item=descriptor.value;
    if(['__proto__','prototype','constructor'].includes(key))throw Error('Unsafe snapshot key');
    jsonData(item,depth+1,budget);
  }
}
export function validateNativeApiSnapshot(value:unknown):NativeApiSnapshot {
  jsonData(value);
  const encoded=JSON.stringify(value);
  if(encoded.length>2000000)throw Error('Snapshot size limit');
  const snapshot=JSON.parse(encoded) as NativeApiSnapshot;
  if(!snapshot||snapshot.schema!=='famtutor.geogebra-native.snapshot.v1'||
     !Array.isArray(snapshot.definitions)||!Number.isSafeInteger(snapshot.serial)||snapshot.serial<0)
    throw Error('Invalid native API snapshot');
  const report=validateMathDocumentStructure(snapshot.document);
  if(report.status==='invalid')throw Error('Invalid snapshot document: '+JSON.stringify(report.issues));
  const document=snapshot.document;
  if(document.entities.length>2000||document.views.some(v=>v.kind!=='graphics2d')||
    document.construction.some(n=>!primitives.has(n.command)||n.outputs.length!==1))
    throw Error('Snapshot outside native API slice');
  const ids=new Map(document.entities.map(e=>[e.id,e]));
  const labels=new Set<string>(), publicIds=new Set<string>();
  for(const entry of snapshot.definitions) {
    if(!Array.isArray(entry)||entry.length!==2)throw Error('Invalid snapshot definition');
    const [label,definition]=entry;
    if(typeof label!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(label)||labels.has(label)||
      !definition||typeof definition!=='object'||!ids.has(definition.id)||publicIds.has(definition.id)||ids.get(definition.id)!.label!==label)
      throw Error('Invalid snapshot label binding');
    if(definition.command!==undefined) {
      if(!commands.has(definition.command)||definition.expression!==undefined||!Array.isArray(definition.args)||
        !definition.args.every(s=>typeof s==='string'&&s.length<=4096))throw Error('Invalid snapshot command definition');
    } else if(typeof definition.expression!=='string'||definition.expression.length>4096||definition.args!==undefined)
      throw Error('Invalid snapshot expression definition');
    labels.add(label);publicIds.add(definition.id);
  }
  for(const entity of document.entities) {
    const match=/^api([1-9][0-9]*)$/.exec(entity.id);
    if(!match||Number(match[1])>snapshot.serial||entity.label&&!publicIds.has(entity.id))throw Error('Snapshot identity mismatch');
  }
  for(const node of document.construction) {
    if(node.id!=='node'+node.outputs[0]!.slice(3))throw Error('Snapshot node identity mismatch');
    const axis=node.params?.conicAxisState;
    if(axis!==undefined) {
      if(ids.get(node.outputs[0]!)?.type!=='circle2'||!axis||typeof axis!=='object'||Array.isArray(axis)||
        Object.keys(axis).some(k=>!['classification','halfAxis'].includes(k))||!readConicAxisState(node)||
        axis.classification==='empty'&&axis.halfAxis!==null)throw Error('Invalid retained conic state');
    }
  }
  return snapshot;
}
