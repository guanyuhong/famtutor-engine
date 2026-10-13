import test from 'node:test';
import assert from 'node:assert/strict';
import {pointCircleDocument} from './fixtures/point-circle-downstream.mjs';
import {evaluateMathDocument,setGeoGebraInput,synchronizeGeoGebraConicState,importGeoGebraXml} from '../dist/index.js';
import {readConicAxisState} from '../dist/kernel/conic-state.js';
function doc(){
 const d=pointCircleDocument();
 for(const label of ['c','ct','cd','ci']){
  const id='radius-'+label;d.entities.push({id,type:'scalar',role:'derived',visible:false});
  d.construction.push({id:'measure-'+id,command:'measurement.circle_radius',inputs:[{ref:label}],params:{undefinedPolicy:'conic-axis-state'},outputs:[id]});
 }
 synchronizeGeoGebraConicState(d);return d;
}
for(const initial of [0,2,3])test(`Conic axes retain classification/radius ${initial} without resurrecting geometry`,()=>{
 const d=doc();setGeoGebraInput(d,'r',{value:initial});setGeoGebraInput(d,'r',{value:-1});const result=evaluateMathDocument(d);
 for(const id of ['c','ct','cd','ci']){
  assert.equal(result.entities.get(id).defined,false);assert.equal(result.entities.get(id).value,undefined);
  assert.equal(result.entities.get('radius-'+id).defined,true);assert.equal(result.entities.get('radius-'+id).value,initial);
 }
 const state=d.construction.find(n=>n.outputs.includes('c')).params.conicAxisState;
 assert.deepEqual(Object.keys(state).sort(),['classification','halfAxis']);
});
test('Zero conic dilation is undefined but Radius observes copied source half-axis, not last output',()=>{
 const d=doc();assert.equal(evaluateMathDocument(d).entities.get('radius-cd').value,4);
 setGeoGebraInput(d,'k',{value:0});let result=evaluateMathDocument(d);
 assert.equal(result.entities.get('cd').defined,false);assert.equal(result.entities.get('Ocd').defined,false);
 assert.equal(result.entities.get('radius-cd').value,2);
 setGeoGebraInput(d,'k',{value:-3});result=evaluateMathDocument(d);assert.equal(result.entities.get('cd').defined,true);assert.equal(result.entities.get('radius-cd').value,6);
});
test('Conic axes roundtrip preserves state only; valid geometry recomputes after recovery',()=>{
 let d=doc();setGeoGebraInput(d,'r',{value:3});setGeoGebraInput(d,'r',{value:-1});
 d=JSON.parse(JSON.stringify(d));assert.equal(evaluateMathDocument(d).entities.get('radius-ct').value,3);
 setGeoGebraInput(d,'O',{coords:[9,12]});assert.equal(evaluateMathDocument(d).entities.get('ct').defined,false);
 setGeoGebraInput(d,'r',{value:2});const value=evaluateMathDocument(d).entities.get('ct').value;assert.deepEqual(value.center,{kind:'point2',x:11,y:11});assert.equal(value.radius,2);
});
test('Default native undefined dependency policy is unchanged',()=>{
 const d=doc();for(const n of d.construction)if(n.command==='measurement.circle_radius')delete n.params.undefinedPolicy;
 setGeoGebraInput(d,'r',{value:-1});assert.equal(evaluateMathDocument(d).entities.get('radius-ct').defined,false);
});
test('Malformed/nonfinite conic-axis states cannot supply a radius',()=>{
 for(const state of [{classification:'circle',halfAxis:NaN},{classification:'circle',halfAxis:-1},{classification:'point',halfAxis:3},{classification:'other',halfAxis:0}])assert.equal(readConicAxisState({params:{conicAxisState:state}}),undefined);
});
test('Implicit-polynomial inversion output never silently becomes a cached circle',()=>{
 const xml='<geogebra format="5.0"><construction><element type="point" label="O"><coords x="3" y="4" z="1"/></element><element type="point" label="Q"><coords x="0" y="0" z="1"/></element><command name="Circle"><input a0="O" a1="0"/><output a0="c"/></command><element type="conic" label="c"/><command name="Circle"><input a0="Q" a1="2"/><output a0="inv"/></command><element type="conic" label="inv"/><command name="Mirror"><input a0="c" a1="inv"/><output a0="ci"/></command><element type="implicitpoly" label="ci"/></construction></geogebra>';
 const imported=importGeoGebraXml(xml);assert.equal(imported.status,'rejected');assert.ok(imported.diagnostics.some(x=>x.code==='INVERSION_OUTPUT_TYPE_UNSUPPORTED'));
});
