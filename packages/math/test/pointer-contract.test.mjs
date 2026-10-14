/** Comparator negative controls use synthetic traces ONLY. They are never a
 * GeoGebra reference fixture or counted as independently captured behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createGeoGebraNativeApi,evaluateMathDocument} from '../dist/index.js';
import {compare} from '../../../scripts/geogebra/pointer/compare.mjs';
const here=new URL('../../../scripts/geogebra/pointer/',import.meta.url);
const bytes=fs.readFileSync(new URL('case.json',here)),spec=JSON.parse(bytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
const copy=x=>JSON.parse(JSON.stringify(x));
const tag=value=>({type:typeof value,value:Number.isNaN(value)?{$number:'NaN'}:value});
function fixture(){
 const api=createGeoGebraNativeApi();api.evalCommand(spec.program);let seq=0;
 const t={unitTestOnly:true,schema:'famtutor.pointer.trace.v1',engine:'famtutor',sourceSha:'a'.repeat(40),sourceTree:'b'.repeat(40),trackedDirty:false,status:'CAPTURED',spec,caseSha256:hash(bytes),recorderSha256:hash(fs.readFileSync(new URL('recorder.js',here))),constructionReturn:true,samples:[],rawDOM:[],publicEvents:[],engineEvents:[],pageErrors:[],callbackErrors:[]};
 const state=()=>({names:api.getAllObjectNames(),objects:Object.fromEntries(spec.labels.map(n=>[n,{exists:api.exists(n),type:api.getObjectType(n),defined:api.isDefined(n),independent:api.isIndependent(n),...(spec.coordinateLabels.includes(n)?{x:tag(api.getXcoord(n)),y:tag(api.getYcoord(n)),z:tag(api.getZcoord(n))}:{}),value:tag(api.getValue(n))}]))});
 const sample=step=>{const d=api.getDocument(),e=evaluateMathDocument(d);t.samples.push({step,state:state(),publicEventCount:t.publicEvents.length,domEventCount:t.rawDOM.length,native:{document:d,mountedDocument:copy(d),objects:Object.fromEntries(spec.labels.map(n=>{const id=d.entities.find(e=>e.label===n).id,r=e.entities.get(id);return [n,{evaluated:r,mounted:r,rendererValue:r.value,native:{x:r.value.x,y:r.value.y}}]}))}});};
 let pressed=false;sample('initial');
 for(const action of spec.actions){
  if(action.type==='down')pressed=true;if(action.type==='up')pressed=false;
  t.rawDOM.push({seq:++seq,time:seq,step:action.id,type:{down:'pointerdown',move:'pointermove',up:'pointerup'}[action.type],trusted:true,pointerType:'mouse',buttons:pressed?1:0});
  if(action.type==='move'&&pressed){api.setCoords('A',...action.world);for(const n of ['A','M','s'])t.publicEvents.push({seq:++seq,time:seq,step:action.id,kind:'update',args:[n],state:state()});}
  sample(action.id);
 }
 const a=copy(t),b=copy(t);b.engine='geogebra';b.runtimeVersion=spec.requiredRuntime;b.selectedCodebase=spec.codebase;for(const s of b.samples)delete s.native;return [a,b];
}
test('synthetic equal complete traces exercise the comparator, not the oracle',()=>{assert.equal(compare(...fixture()).status,'PASSED');});
for(const [name,mutate] of [
 ['missing movement boundary',a=>a.samples.splice(3,1)],
 ['different mid-drag coordinates with identical final state',a=>a.samples[4].state.objects.A.x.value+=1],
 ['missing callback',a=>a.publicEvents.splice(1,1)],
 ['callback reordering',a=>{[a.publicEvents[1],a.publicEvents[2]]=[a.publicEvents[2],a.publicEvents[1]];}],
 ['duplicate callback',a=>a.publicEvents.push(copy(a.publicEvents.at(-1)))],
 ['callback attached to an unknown step',a=>a.publicEvents[1].step='unobserved-step'],
 ['incorrect callback-time dependent state',a=>a.publicEvents[1].state.objects.M.x.value+=1],
 ['untrusted pointer',a=>a.rawDOM[3].trusted=false],
 ['missing press delivery',a=>a.rawDOM.splice(1,1)],
 ['wrong pointer button',a=>a.rawDOM[3].buttons=0],
 ['missing tagged value',a=>delete a.samples[3].state.objects.M.x],
 ['native shape diverges from API',a=>a.samples[4].native.objects.M.native.x+=1],
 ['unknown unmeasured callback field',a=>a.publicEvents[0].unmeasured=123],
 ['missing raw channel',a=>delete a.engineEvents],
 ['failed capture',a=>a.status='PARTIAL'],
 ['dirty source',a=>a.trackedDirty=true]
])test('pointer gate rejects '+name,()=>{const pair=fixture();mutate(pair[0]);assert.equal(compare(...pair).status,'FAILED');});
test('both identically incomplete or stale traces fail closed',()=>{
 for(const mutate of [a=>a.samples=[],a=>a.sourceSha=null,a=>a.caseSha256='0'.repeat(64),a=>a.spec={...a.spec,actions:[]},a=>{for(const s of a.samples)s.state=copy(a.samples[0].state);}]){
  const pair=fixture();pair.forEach(mutate);assert.equal(compare(...pair).status,'FAILED');
 }
});
test('reference runtime selection and observation must match the fixed case',()=>{const pair=fixture();pair[1].runtimeVersion='other';assert.equal(compare(...pair).status,'FAILED');});
