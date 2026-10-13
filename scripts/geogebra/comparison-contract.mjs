/** Fail-closed observations. This is a test oracle contract, not engine code. */
import {arcLength,sectorArea,clipLineToBoundingBox,clipRayToBoundingBox} from '../../packages/math/dist/kernel/geometry.js';
import {isEntityVisible} from '../../packages/math/dist/render/visibility.js';
export const RELATIVE_TOLERANCE=1e-7; // unchanged from the original strict benchmark
const types={point:['point2'],vector:['vector2'],point3d:['point3'],vector3d:['vector3'],numeric:['scalar'],boolean:['boolean'],angle:['angle'],segment:['segment2'],segment3d:['segment3'],polygon:['polygon2'],triangle:['polygon2'],quadrilateral:['polygon2'],polygon3d:['polygon3'],line:['line2'],ray:['ray2'],circle:['circle2'],arc:['arc2'],sector:['sector2'],conicpart:['arc2','sector2'],text:['text']};
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function compareObservation(ref,actual) {
  const errors=[];
  const fail=(code,detail={})=>errors.push({code,...detail});
  if(!ref||typeof ref!=='object'||!has(ref,'type')||typeof ref.type!=='string'||!has(ref,'defined')||typeof ref.defined!=='boolean')return [{code:'MALFORMED_OBSERVATION'}];
  if(!types[ref.type])return [{code:'OBSERVATION_TYPE_UNSUPPORTED',type:ref.type}];
  const fields=new Set(['type','defined',...(['point','vector','point3d','vector3d'].includes(ref.type)?['x','y','z']:ref.type==='line'?['coefficients']:ref.type==='text'?['text']:ref.type==='conicpart'?['part','value']:['value'])]);
  for(const k of Object.keys(ref))if(!fields.has(k))fail('UNCOMPARED_REFERENCE_FIELD',{key:k});
  if(!actual)return [{code:'OBJECT_MISSING'}];
  const actualType=actual.entity?.type;
  if(!types[ref.type].includes(actualType))fail('OBJECT_TYPE_MISMATCH',{expected:ref.type,actual:actualType});
  if(typeof actual.defined!=='boolean'||actual.defined!==ref.defined)fail('DEFINED_STATE_MISMATCH',{expected:ref.defined,actual:actual.defined});
  if(!ref.defined||!actual.defined||errors.length)return errors;
  const value=actual.value;
  const numeric=(key,expected,observed)=>{
    if(typeof expected!=='number'||!Number.isFinite(expected)){fail('REFERENCE_FIELD_MISSING_OR_INVALID',{key});return;}
    if(typeof observed!=='number'||!Number.isFinite(observed)){fail('ACTUAL_FIELD_MISSING_OR_INVALID',{key});return;}
    if(Math.abs(observed-expected)>RELATIVE_TOLERANCE*(1+Math.abs(expected)))fail('NUMERIC_MISMATCH',{key,expected,actual:observed});
  };
  if(actualType!=='scalar'&&actualType!=='boolean'&&value?.kind!==actualType){fail('RUNTIME_KIND_MISMATCH',{expected:actualType,actual:value?.kind});return errors;}
  if(['point','vector','point3d','vector3d'].includes(ref.type)) {
    for(const k of (ref.type.endsWith('3d')?['x','y','z']:['x','y']))numeric(k,ref[k],value?.[k]);
    // Even an unexpected z observation is never silently dropped.
    if(!ref.type.endsWith('3d')&&has(ref,'z'))numeric('z',ref.z,value?.z??0);
  } else if(ref.type==='line') {
    if(!Array.isArray(ref.coefficients)||ref.coefficients.length!==3)fail('REFERENCE_FIELD_MISSING_OR_INVALID',{key:'coefficients'});
    else {
      const normalized=c=>{if(!c.every(Number.isFinite)||Math.hypot(c[0],c[1])===0)return null;const scale=Math.hypot(c[0],c[1])*(c[0]<0||(c[0]===0&&c[1]<0)?-1:1);return c.map(x=>x/scale);};
      const e=normalized(ref.coefficients),a=normalized([value.a,value.b,value.c]);
      if(!e||!a)fail('INVALID_LINE_COEFFICIENTS');else e.forEach((v,i)=>numeric('coefficient-'+i,v,a[i]));
    }
  } else if(ref.type==='text') {
    if(typeof ref.text!=='string')fail('REFERENCE_FIELD_MISSING_OR_INVALID',{key:'text'});
    else if(value.text!==ref.text)fail('TEXT_MISMATCH',{expected:ref.text,actual:value.text});
  } else {
    let measure;
    if(ref.type==='segment'||ref.type==='segment3d')measure=Math.hypot(value.to.x-value.from.x,value.to.y-value.from.y,...(ref.type==='segment3d'?[value.to.z-value.from.z]:[]));
    else if(['polygon','triangle','quadrilateral'].includes(ref.type)) {const v=value.vertices;if(ref.type==='triangle'&&v.length!==3||ref.type==='quadrilateral'&&v.length!==4)fail('POLYGON_ARITY_MISMATCH');measure=Math.abs(v.reduce((s,p,i)=>{const q=v[(i+1)%v.length];return s+p.x*q.y-p.y*q.x;},0))/2;}
    else if(ref.type==='conicpart') {
      if(!['arc','sector'].includes(ref.part))fail('REFERENCE_FIELD_MISSING_OR_INVALID',{key:'part'});
      else if(actualType!==(ref.part==='arc'?'arc2':'sector2'))fail('CONIC_PART_TYPE_MISMATCH',{expected:ref.part,actual:actualType});
      else measure=ref.part==='arc'?arcLength(value):sectorArea(value);
    } else if(ref.type==='arc')measure=arcLength(value);
    else if(ref.type==='sector')measure=sectorArea(value);
    else if(ref.type==='angle')measure=value.radians;
    else if(ref.type==='boolean') {if(typeof value!=='boolean')fail('RUNTIME_KIND_MISMATCH');measure=Number(value);}
    else if(ref.type==='numeric')measure=value;
    else {fail('OBSERVATION_PROJECTION_UNSUPPORTED',{type:ref.type});return errors;}
    numeric('value',ref.value,measure);
  }
  return errors;
}
export function checkStaticSvg(rendered,document,evaluation) {
  const errors=[],svg=rendered?.svg;
  if(typeof svg!=='string'||!/^<svg\b/.test(svg)||!/<\/svg>\s*$/.test(svg))return [{code:'SVG_MISSING_OR_MALFORMED'}];
  if(/\b(?:x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|viewBox|points|d)="[^"]*(?:NaN|Infinity)[^"]*"/.test(svg))errors.push({code:'SVG_NONFINITE_GEOMETRY'});
  const view=document.views.find(v=>v.id===rendered.report?.viewId);
  if(!view)return [...errors,{code:'SVG_VIEW_MISSING'}];
  const nonVisual=new Set(['scalar','boolean','transform2']);
  for(const entity of document.entities) {
    const runtime=evaluation.entities.get(entity.id);
    if(!runtime?.defined||nonVisual.has(entity.type)||!isEntityVisible(entity,id=>evaluation.entities.get(id)?.value)||view.entityIds&&!view.entityIds.includes(entity.id))continue;
    if(view.kind==='graphics2d'&&((entity.type==='line2'&&!clipLineToBoundingBox(runtime.value,view.boundingBox))||(entity.type==='ray2'&&!clipRayToBoundingBox(runtime.value,view.boundingBox))))continue;
    // Membership in the report AND a corresponding geometric node are required.
    const encoded=entity.id.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const tags=entity.type==='point2'?['circle']:entity.type==='polygon2'?['polygon']:['line2','ray2','segment2','vector2'].includes(entity.type)?['line']:entity.type==='text'?['text']:['path','polyline','circle','ellipse','polygon','line'];
    const escaped=encoded.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const geometry=new RegExp('<(?:'+tags.join('|')+')\\b[^>]*\\bdata-entity-id="'+escaped+'"');
    if(!rendered.report.renderedEntities.includes(entity.id)||!geometry.test(svg))errors.push({code:'SVG_ENTITY_MISSING',id:entity.id,type:entity.type});
  }
  return errors;
}
