import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeoGebraNativeApi, evaluateMathDocument} from '../dist/index.js';
import {acceptPointerInput} from '../dist/render/pointer-input.js';
const program='A=(1,2)\nB=(6,5)\nM=Midpoint(A,B)\ns=Segment(A,B)\nO=(-6,-5)\nr=3\nc=Circle(O,r)\nH=Center(c)\nq=Radius(c)';
const fixture=()=>{const a=createGeoGebraNativeApi();assert.equal(a.evalCommand(program),true);a.setValue('r',-1);return a.getDocument();};
const id=(d,n)=>d.entities.find(e=>e.label===n).id;
test('an unrelated legitimate undefined conic does not block a valid free-point drag',()=>{
 const d=fixture(),before=evaluateMathDocument(d),conicState=structuredClone(d.construction.find(n=>n.outputs.includes(id(d,'c'))));
 assert.equal(acceptPointerInput(d,id(d,'A'),[3,3]),true);
 const after=evaluateMathDocument(d);
 assert.equal(after.entities.get(id(d,'M')).value.x,4.5);
 assert.equal(after.entities.get(id(d,'M')).value.y,4);
 for(const name of ['c','H']){assert.equal(after.entities.get(id(d,name)).defined,false);assert.equal(after.entities.get(id(d,name)).value,undefined);}
 assert.equal(after.entities.get(id(d,'q')).value,3);
 assert.deepEqual(d.construction.find(n=>n.outputs.includes(id(d,'c'))),conicState);
 for(const name of ['O','r','c','H','q'])assert.deepEqual(after.entities.get(id(d,name)),before.entities.get(id(d,name)));
});
test('an affected new degeneration remains an atomic failure even with unrelated undefined objects',()=>{
 const d=fixture(),before=JSON.stringify(d);assert.throws(()=>acceptPointerInput(d,id(d,'A'),[6,5]));assert.equal(JSON.stringify(d),before);
});
test('unrelated undefined does not hide failed global host assertions',()=>{
 const d=fixture();d.assertions=[{id:'host-rule',predicate:'expression_equal',arguments:[{expr:'1'},{expr:'2'}],severity:'error'}];
 const before=JSON.stringify(d);assert.throws(()=>acceptPointerInput(d,id(d,'A'),[3,3]));assert.equal(JSON.stringify(d),before);
});
test('an existing undefined object in the edited dependency closure still fails atomically',()=>{
 const a=createGeoGebraNativeApi();a.evalCommand('A=(1,2)\nr=-1\nc=Circle(A,r)');const d=a.getDocument(),before=JSON.stringify(d);
 assert.throws(()=>acceptPointerInput(d,id(d,'A'),[3,3]));assert.equal(JSON.stringify(d),before);
});
test('an unrelated unsupported command is not accepted as harmless undefined geometry',()=>{
 const d=fixture();d.construction.find(n=>n.outputs.includes(id(d,'c'))).command='not.implemented';const before=JSON.stringify(d);
 assert.throws(()=>acceptPointerInput(d,id(d,'A'),[3,3]));assert.equal(JSON.stringify(d),before);
});
test('allowed unrelated undefined state survives multiple moves and return without cached geometry',()=>{
 const d=fixture();for(const coords of [[3,3],[4,4],[2,2],[1,2]]){
  assert.equal(acceptPointerInput(d,id(d,'A'),coords),true);const e=evaluateMathDocument(d);
  assert.deepEqual([e.entities.get(id(d,'A')).value.x,e.entities.get(id(d,'A')).value.y],coords);
  assert.equal(e.entities.get(id(d,'c')).value,undefined);assert.equal(e.entities.get(id(d,'H')).value,undefined);
  assert.equal(e.entities.get(id(d,'q')).value,3);
 }
});
