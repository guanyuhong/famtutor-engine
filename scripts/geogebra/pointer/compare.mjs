/** Strict declared pointer contract. Raw records are retained; never deduplicate events. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const caseBytes=fs.readFileSync(new URL('./case.json',import.meta.url));
const EXPECTED_CASE=JSON.parse(caseBytes);
const CASE_HASH=createHash('sha256').update(caseBytes).digest('hex');
const RECORDER_HASH=createHash('sha256').update(fs.readFileSync(new URL('./recorder.js',import.meta.url))).digest('hex');
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
function validateTrace(trace,engine,errors) {
 const fail=(code,detail={})=>errors.push({code,engine,...detail});
 if(trace?.engine!==engine||trace?.status!=='CAPTURED')fail('CAPTURE_INCOMPLETE');
 // Passive timing experiments change cadence and are not original-protocol evidence.
 if(trace?.timingProbe && (trace.timingProbe.postSampleHoldMs!==0 || trace.timingProbe.originalProtocolEligible!==true))fail('DIAGNOSTIC_TIMING_NOT_ACCEPTED');
 if(trace?.lateObservations?.length)fail('EXTRA_OBSERVATION_PROFILE_NOT_ACCEPTED');
 if(!/^[0-9a-f]{40}$/.test(trace?.sourceSha??'')||!/^[0-9a-f]{40}$/.test(trace?.sourceTree??'')||trace.trackedDirty!==false)fail('SOURCE_IDENTITY_INVALID');
 if(trace.caseSha256!==CASE_HASH||trace.recorderSha256!==RECORDER_HASH)fail('TEST_SOURCE_DRIFT');
 differences(trace.spec,EXPECTED_CASE,engine+'.spec',errors);
 const steps=['initial',...EXPECTED_CASE.actions.map(a=>a.id)],rank=new Map(steps.map((s,i)=>[s,i]));
 if(!Array.isArray(trace.samples)||trace.samples.length!==steps.length)fail('SAMPLES_MISSING');
 for(const key of ['rawDOM','publicEvents','engineEvents','pageErrors','callbackErrors'])if(!Array.isArray(trace[key]))fail('TRACE_CHANNEL_MISSING',{key});
 if(errors.some(e=>e.engine===engine&&['TRACE_CHANNEL_MISSING','SAMPLES_MISSING'].includes(e.code)))return;
 const allSeq=[];
 for(const channel of ['rawDOM','publicEvents','engineEvents']) {
  let previous=0,previousStep=-1;
  for(const event of trace[channel]){
   if(!Number.isSafeInteger(event.seq)||event.seq<=previous||!Number.isFinite(event.time))fail('RAW_ORDER_INVALID',{channel});
   if(!rank.has(event.step)||rank.get(event.step)<previousStep)fail('EVENT_STEP_INVALID',{channel,step:event.step});
   previous=event.seq;previousStep=rank.get(event.step);allSeq.push(event.seq);
   if(channel==='publicEvents'){
    if(!['add','update','remove','clear'].includes(event.kind)||!Array.isArray(event.args)||event.error)fail('PUBLIC_EVENT_INVALID');
    for(const k of Object.keys(event))if(!['seq','step','time','kind','args','state','error'].includes(k))fail('UNCOMPARED_EVENT_FIELD',{key:k});
    validateState(event.state,event.step+'.callback',fail);
   }
  }
 }
 if(new Set(allSeq).size!==allSeq.length)fail('DUPLICATE_RAW_SEQUENCE');
 for(let i=0;i<steps.length;i++){
  const sample=trace.samples[i];if(!sample){fail('STEP_MISSING',{index:i});continue;}
  if(sample.step!==steps[i])fail('STEP_ORDER_INVALID',{index:i});
  validateState(sample.state,sample.step,fail);
  const publicCount=trace.publicEvents.filter(e=>rank.get(e.step)<=i).length;
  if(sample.publicEventCount!==publicCount)fail('PUBLIC_EVENT_COUNT_INVALID',{step:sample.step});
  if(!Number.isSafeInteger(sample.domEventCount)||sample.domEventCount<0||sample.domEventCount>trace.rawDOM.length)fail('DOM_COUNT_INVALID');
 }
 let pressed=false;
 for(const action of EXPECTED_CASE.actions){
  const kind={down:'pointerdown',move:'pointermove',up:'pointerup'}[action.type];
  if(action.type==='down')pressed=true;if(action.type==='up')pressed=false;
  const delivered=trace.rawDOM.filter(e=>e.step===action.id&&e.type===kind);
  if(delivered.length!==1||!delivered[0].trusted||delivered[0].pointerType!=='mouse'||delivered[0].buttons!==(pressed?1:0))fail('POINTER_DELIVERY_INVALID',{step:action.id});
 }
 if(trace.pageErrors.length||trace.callbackErrors.length)fail('BROWSER_CALLBACK_ERRORS');
 // Even two identical no-op traces cannot certify dragging. Both gestures must
 // change a public point during movement, and the complete round trip returns.
 const target=EXPECTED_CASE.target,at=s=>[s.state.objects[target].x,s.state.objects[target].y];
 if(trace.samples.every(s=>s.state?.objects?.[target]?.x)){
  for(const prefix of ['out-','back-']){
   const rows=trace.samples.filter(s=>s.step.startsWith(prefix));
   if(rows.length<2||rows.every(s=>JSON.stringify(at(s))===JSON.stringify(at(rows[0]))))fail('NO_MID_DRAG_MOVEMENT',{prefix});
  }
  differences(at(trace.samples[0]),at(trace.samples.at(-1)),engine+'.roundtrip',errors);
 }
}
function validateState(state,step,fail){
 if(!state||!Array.isArray(state.names)||!state.objects){fail('STATE_MISSING',{step});return;}
 if(JSON.stringify(state.names)!==JSON.stringify(EXPECTED_CASE.labels)||JSON.stringify(Object.keys(state.objects))!==JSON.stringify(EXPECTED_CASE.labels))fail('OBJECT_SET_MISMATCH',{step});
 for(const name of EXPECTED_CASE.labels){
  const o=state.objects[name],point=EXPECTED_CASE.pointLabels.includes(name);
  if(!o||typeof o.exists!=='boolean'||typeof o.defined!=='boolean'||typeof o.independent!=='boolean'||o.type!==(point?'point':'segment')||!o.exists) {fail('OBJECT_OBSERVATION_INVALID',{step,name});continue;}
  for(const field of ['value',...(EXPECTED_CASE.coordinateLabels.includes(name)?['x','y','z']:[])]){
   const r=o[field];if(!r||typeof r.type!=='string'||(r.type!=='undefined'&&r.type!=='exception'&&!Object.hasOwn(r,'value')))fail('TAGGED_FIELD_MISSING',{step,name,field});
   else if(r.type==='number'&&!(Number.isFinite(r.value)||(r.value&&['NaN','Infinity','-Infinity'].includes(r.value.$number))))fail('INVALID_NUMBER_TAG',{step,name,field});
  }
 }
}
const publicProjection=trace=>trace.publicEvents.map(e=>({step:e.step,kind:e.kind,args:e.args,state:e.state,...(e.error?{error:e.error}:{})}));
export function compare(native,reference){
 const errors=[];validateTrace(native,'famtutor',errors);validateTrace(reference,'geogebra',errors);
 for(const key of ['sourceSha','sourceTree','caseSha256','recorderSha256','spec','constructionReturn'])differences(native[key],reference[key],key,errors);
 if(native.constructionReturn!==true||reference.constructionReturn!==true)errors.push({code:'CONSTRUCTION_REJECTED'});
 if(reference.runtimeVersion!==EXPECTED_CASE.requiredRuntime||reference.selectedCodebase!==EXPECTED_CASE.codebase)errors.push({code:'REFERENCE_PIN_MISMATCH'});
 const ns=native.samples??[],rs=reference.samples??[];
 for(let i=0;i<Math.max(ns.length,rs.length);i++){
  const a=ns[i],b=rs[i];if(!a||!b){errors.push({code:'STEP_MISSING',index:i});continue;}
  differences(a.step,b.step,'steps.'+i+'.id',errors);differences(a.state,b.state,'steps.'+a.step+'.state',errors);
 }
 // Full global callback sequence is compared, not a subset of known steps.
 if(Array.isArray(native.publicEvents)&&Array.isArray(reference.publicEvents))differences(publicProjection(native),publicProjection(reference),'publicEvents',errors);
 let coherence=[];try{coherence=nativeCoherence(native);}catch(e){coherence=[{code:'NATIVE_SURFACES_MALFORMED',message:String(e)}];}errors.push(...coherence);
 return {schema:'famtutor.pointer.comparison.v1',status:errors.length?'FAILED':'PASSED',sourceSha:native.sourceSha,sourceTree:native.sourceTree,caseSha256:native.caseSha256,recorderSha256:native.recorderSha256,runtimeVersion:reference.runtimeVersion,tolerance:TOLERANCE,checkedSamples:ns.length,publicEventCounts:{native:native.publicEvents?.length,reference:reference.publicEvents?.length},rawDOMCounts:{native:native.rawDOM?.length,reference:reference.rawDOM?.length},nativeCoherenceErrors:coherence.length,errors,
 scope:'Every delivered down/move/up boundary and full ordered public add/update/remove/clear callback trace including callback-time observations; calibrated integer-pixel mouse case; no final-only claim',
 platformMetadata:'Raw DOM/capture/mouse timestamps, canvas/SVG target identities, pixel transforms, and extra engine-specific runtime/client channels retained separately, not asserted identical',
 gaps:['Client event API compatibility is NOT_IMPLEMENTED; reference client channel is retained unfiltered.','Right-click-disabled mode remains FAILED in earlier captures; fractional-pixel quantization, touch, pen, high input rate/coalescing, constrained paths, mid-drag undefined/recovery and cross-format persistence are NOT_RUN in the accepted default-mode slice.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [a,b,o]=process.argv.slice(2);const result=compare(JSON.parse(fs.readFileSync(a)),JSON.parse(fs.readFileSync(b)));fs.writeFileSync(o,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,errors:result.errors.slice(0,6)}));if(result.errors.length)process.exitCode=1;
}
