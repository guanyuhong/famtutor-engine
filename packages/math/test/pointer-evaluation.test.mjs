import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeoGebraNativeApi,evaluateMathDocument} from '../dist/index.js';

test('evaluation observer exposes actual node completion in original DAG order',()=>{
 const api=createGeoGebraNativeApi();assert.equal(api.evalCommand('A=(1,2)\nB=(6,5)\nM=Midpoint(A,B)\ns=Segment(A,B)'),true);
 const document=api.getDocument(),seen=[];
 const result=evaluateMathDocument(document,{},(node,outputs)=>seen.push({node:node.id,labels:outputs.map(e=>e.entity.label),values:outputs.map(e=>e.value)}));
 assert.deepEqual(seen.map(s=>s.labels[0]),['A','B','M','s']);
 assert.deepEqual(seen.map(s=>s.node),result.order);
 assert.equal(seen[2].values[0].x,3.5);
 assert.deepEqual(result,evaluateMathDocument(document));
});
test('observer includes undefined outputs and dependent undefined without inventing values',()=>{
 const api=createGeoGebraNativeApi();api.evalCommand('O=(1,2)\nr=3\nc=Circle(O,r)\nH=Center(c)');api.setValue('r',-1);
 const events=[];const d=api.getDocument(),out=evaluateMathDocument(d,{},(_node,outputs)=>events.push(...outputs));
 for(const name of ['c','H']){const e=events.find(e=>e.entity.label===name);assert.ok(e,name);assert.equal(e.defined,false);assert.equal(e.value,undefined);}
 assert.deepEqual(out,evaluateMathDocument(d));
});

const {acceptPointerInput}=await import('../dist/render/pointer-input.js');
function fixture(){const api=createGeoGebraNativeApi();api.evalCommand('A=(1,2)\nB=(6,5)\nM=Midpoint(A,B)\ns=Segment(A,B)');return api.getDocument();}
function id(d,n){return d.entities.find(e=>e.label===n).id;}
test('continuous pointer updates the existing source node and recomputes dependents without remount',()=>{
 const d=fixture(),node=d.construction[0],before=d.revision;assert.equal(acceptPointerInput(d,id(d,'A'),[3,3]),true);
 assert.equal(d.construction[0],node);assert.equal(d.revision,before+1);
 const e=evaluateMathDocument(d);assert.equal(e.entities.get(id(d,'M')).value.x,4.5);assert.equal(e.entities.get(id(d,'M')).value.y,4);
 assert.equal(acceptPointerInput(d,id(d,'A'),[3,3]),false);assert.equal(d.revision,before+1);
 assert.equal(acceptPointerInput(d,id(d,'A'),[1,2]),true);assert.equal(evaluateMathDocument(d).entities.get(id(d,'M')).value.x,3.5);
});
test('pointer permission, type, nonfinite and topology failures leave canonical state unchanged',()=>{
 for(const [name,coords] of [['M',[2,3]],['s',[2,3]],['A',[NaN,3]],['A',[2]],['A',[6,5]]]){
  const d=fixture(),before=JSON.stringify(d);assert.throws(()=>acceptPointerInput(d,id(d,name),coords));assert.equal(JSON.stringify(d),before);
 }
 const d=fixture();d.interactions.find(i=>i.target===id(d,'A')).permissions=['select'];const before=JSON.stringify(d);assert.throws(()=>acceptPointerInput(d,id(d,'A'),[2,3]));assert.equal(JSON.stringify(d),before);
});
test('observer does not supply geometry: pending results are absent until original node computation',()=>{
 const d=fixture(),names=[];evaluateMathDocument(d,{},(_node,outputs)=>names.push(...outputs.map(e=>e.entity.label)));
 assert.deepEqual(names,['A','B','M','s']);assert.deepEqual(d,fixture());
});
test('observer snapshots cannot mutate live geometry or source node definitions',()=>{
 const d=fixture(),before=JSON.stringify(d),expected=evaluateMathDocument(d);
 const observed=evaluateMathDocument(d,{},(node,outputs)=>{if(node.command==='point.free'){node.params.coords=[999,999];outputs[0].value.x=999;outputs[0].entity.label='mutated';}});
 assert.equal(JSON.stringify(d),before);assert.deepEqual(observed,expected);
});
test('pending line and segment coordinate projections use that producer’s committed input state',()=>{
 const api=createGeoGebraNativeApi();api.evalCommand('A=(1,2)\nB=(6,5)\ns=Segment(A,B)\nl=Line(A,B)');
 const d=api.getDocument(),old=evaluateMathDocument(d).entities,id=n=>d.entities.find(e=>e.label===n).id;
 api.setCoords('A',3,3);const current=evaluateMathDocument(api.getDocument()).entities;
 api.notificationPriorState=old;api.notificationState=new Map(old);api.notificationCompleted=new Set([id('A')]);api.notificationState.set(id('A'),current.get(id('A')));
 for(const n of ['s','l'])assert.deepEqual([api.getXcoord(n),api.getYcoord(n),api.getZcoord(n)],[-3,5,-7]);
 for(const n of ['s','l']){api.notificationState.set(id(n),current.get(id(n)));api.notificationCompleted.add(id(n));assert.deepEqual([api.getXcoord(n),api.getYcoord(n),api.getZcoord(n)],[-2,3,-3]);}
 api.notificationState=undefined;api.notificationPriorState=undefined;api.notificationCompleted=undefined;
 assert.deepEqual([api.getXcoord('l'),api.getYcoord('l'),api.getZcoord('l')],[-2,3,-3]);
});
test('warning-only assertions do not prevent a valid pointer input',()=>{
 const d=fixture();d.assertions=[{id:'diagnostic-only',predicate:'expression_equal',arguments:[{expr:'1'},{expr:'2'}],severity:'warning'}];
 const before=d.revision;assert.equal(acceptPointerInput(d,id(d,'A'),[3,3]),true);assert.equal(d.revision,before+1);
});
test('error assertions remain atomic pointer failures',()=>{
 const d=fixture();d.assertions=[{id:'hard-error',predicate:'expression_equal',arguments:[{expr:'1'},{expr:'2'}],severity:'error'}];
 const before=JSON.stringify(d);assert.throws(()=>acceptPointerInput(d,id(d,'A'),[3,3]));assert.equal(JSON.stringify(d),before);
});
