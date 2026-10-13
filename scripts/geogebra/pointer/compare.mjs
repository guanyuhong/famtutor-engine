/** Strict declared pointer contract. Raw records are retained; never deduplicate events. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export const TOLERANCE=1e-7;
export function differences(a,b,path='$',out=[]) {
  if(typeof a!==typeof b){out.push({path,code:'TYPE',native:a,reference:b});return out;}
  if(typeof a==='number'){if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>TOLERANCE*(1+Math.abs(b)))out.push({path,code:'NUMBER',native:a,reference:b});return out;}
  if(a===null||b===null||typeof a!=='object'){if(a!==b)out.push({path,code:'VALUE',native:a,reference:b});return out;}
  if(Array.isArray(a)!==Array.isArray(b)){out.push({path,code:'CONTAINER'});return out;}
  const ak=Object.keys(a),bk=Object.keys(b);if(ak.length!==bk.length||ak.some(k=>!Object.hasOwn(b,k)))out.push({path,code:'KEYS',native:ak,reference:bk});
  for(const k of ak)if(Object.hasOwn(b,k))differences(a[k],b[k],path+'.'+k,out);
  return out;
}
export function nativeCoherence(trace) {
 const errors=[];
 for(const s of trace.samples??[]){
  if(!s.native){errors.push({path:s.step,code:'NATIVE_SURFACES_MISSING'});continue;}
  differences(s.native.document,s.native.mountedDocument,s.step+'.documents',errors);
  for(const n of trace.spec.pointLabels){const row=s.native.objects[n],publicState=s.state.objects[n];
   for(const k of ['x','y'])for(const [surface,v] of [['evaluator',row.evaluated.value?.[k]],['mountedEvaluator',row.mounted.value?.[k]],['renderer',row.rendererValue?.[k]],['shape',row.native?.[k]]])differences(publicState[k].value,v,s.step+'.'+n+'.'+surface+'.'+k,errors);
   for(const surface of ['evaluated','mounted'])differences(publicState.defined,row[surface].defined,s.step+'.'+n+'.'+surface+'.defined',errors);
  }
 }
 return errors;
}
export function compare(native,reference){
 const errors=[];
 for(const trace of [native,reference]){
  if(trace.status!=='CAPTURED')errors.push({code:'CAPTURE_INCOMPLETE',engine:trace.engine,status:trace.status});
  if(!/^[0-9a-f]{40}$/.test(trace.sourceSha??'')||trace.trackedDirty)errors.push({code:'SOURCE_IDENTITY_INVALID',engine:trace.engine});
  if(!Array.isArray(trace.samples)||trace.samples.length!==trace.spec.actions.length+1)errors.push({code:'SAMPLES_MISSING',engine:trace.engine});
  for(const action of trace.spec.actions){const kind={down:'pointerdown',move:'pointermove',up:'pointerup'}[action.type];const events=trace.rawDOM.filter(e=>e.step===action.id&&e.type===kind);if(events.length!==1||!events[0].trusted)errors.push({code:'POINTER_DELIVERY_INVALID',engine:trace.engine,step:action.id,count:events.length});}
  if(trace.pageErrors?.length||trace.callbackErrors?.length)errors.push({code:'BROWSER_CALLBACK_ERRORS',engine:trace.engine,errors:[...(trace.pageErrors??[]),...(trace.callbackErrors??[])]});
 }
 for(const key of ['sourceSha','sourceTree','caseSha256','recorderSha256','spec','constructionReturn'])differences(native[key],reference[key],key,errors);
 if(reference.runtimeVersion!==reference.spec.requiredRuntime||reference.selectedCodebase!==reference.spec.codebase)errors.push({code:'REFERENCE_PIN_MISMATCH'});
 for(let i=0;i<Math.max(native.samples.length,reference.samples.length);i++){
  const a=native.samples[i],b=reference.samples[i];if(!a||!b){errors.push({code:'STEP_MISSING',index:i});continue;}
  differences(a.step,b.step,'steps.'+i+'.id',errors);differences(a.state,b.state,'steps.'+a.step+'.state',errors);
  // Counts and order are exact. Diagnostic timestamps / DOM target IDs are platform metadata.
  const projection=(t,step)=>t.publicEvents.filter(e=>e.step===step).map(e=>({kind:e.kind,args:e.args,state:e.state,...(e.error?{error:e.error}:{})}));
  differences(projection(native,a.step),projection(reference,b.step),'steps.'+a.step+'.publicEvents',errors);
 }
 const coherence=nativeCoherence(native);errors.push(...coherence);
 return {schema:'famtutor.pointer.comparison.v1',status:errors.length?'FAILED':'PASSED',sourceSha:native.sourceSha,caseSha256:native.caseSha256,tolerance:TOLERANCE,checkedSamples:native.samples.length,publicEventCounts:{native:native.publicEvents.length,reference:reference.publicEvents.length},rawDOMCounts:{native:native.rawDOM.length,reference:reference.rawDOM.length},nativeCoherenceErrors:coherence.length,errors,
 scope:'Every delivered down/move/up boundary and full ordered public add/update/remove/clear callback trace including callback-time observations; no final-only claim',
 platformMetadata:'Raw DOM/capture/mouse timestamps, canvas/SVG target identities, pixel transforms, and extra engine-specific runtime/client channels retained separately, not asserted identical',
 gaps:['Client event API compatibility is NOT_IMPLEMENTED; reference client channel is retained unfiltered.','Touch, pen, coalescing at high input rate, constrained paths, mid-drag undefined/recovery and cross-format persistence are NOT_RUN.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [a,b,o]=process.argv.slice(2);const result=compare(JSON.parse(fs.readFileSync(a)),JSON.parse(fs.readFileSync(b)));fs.writeFileSync(o,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,errors:result.errors.slice(0,6)}));if(result.errors.length)process.exitCode=1;
}
