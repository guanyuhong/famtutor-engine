import {pointCircleDocument} from './fixtures/point-circle-downstream.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 point, vector, circle, applyTransform, translateTransform, dilateTransform,
 rotateTransform, reflectTransform, lineFromPoints, invertCircleInCircle,
 evaluateMathDocument, validateMathDocument, renderDirectSvg
} from '../dist/index.js';

const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*(1+Math.abs(b)),`${a} != ${b}`);
const checkCircle=(c,x,y,r)=>{assert.equal(c.kind,'circle2');near(c.center.x,x);near(c.center.y,y);near(c.radius,r);};

for (const [name,transform,expected] of [
 ['translation',translateTransform(vector(2,-1)),[5,3,0]],
 ['positive dilation',dilateTransform(point(0,0),2),[6,8,0]],
 ['negative dilation',dilateTransform(point(0,0),-2),[-6,-8,0]],
 ['zero dilation of an admitted point circle',dilateTransform(point(1,1),0),[1,1,0]],
 ['rotation',rotateTransform(point(0,0),Math.PI/2),[-4,3,0]],
 ['reflection',reflectTransform(lineFromPoints(point(0,0),point(1,0))),[3,-4,0]]
]) test(`P1: admitted point circle survives ${name}`,()=>checkCircle(applyTransform(circle(point(3,4),0,true),transform),...expected));

test('P1: point-circle inversion preserves type, finite center and involution',()=>{
 const inversion=circle(point(0,0),2), c=circle(point(3,4),0,true);
 const image=invertCircleInCircle(c,inversion);checkCircle(image,12/25,16/25,0);
 checkCircle(invertCircleInCircle(image,inversion),3,4,0);
});
test('P1: singular inversions and inadmissible source radii are not admitted',()=>{
 assert.throws(()=>circle(point(0,0),0),e=>e.code==='INVALID_RADIUS');
 assert.throws(()=>circle(point(0,0),-1,true),e=>e.code==='INVALID_RADIUS');
 assert.throws(()=>invertCircleInCircle(circle(point(0,0),0,true),circle(point(0,0),2)),e=>e.code==='INVERSION_OUTPUT_NOT_CIRCLE');
 assert.throws(()=>invertCircleInCircle(circle(point(3,4),0,true),circle(point(0,0),0,true)),e=>e.code==='INVALID_RADIUS');
});


const set=(d,id,params)=>{Object.assign(d.construction.find(n=>n.outputs.includes(id)).params,params);d.revision++;};
test('P1: canonical dependency graph propagates radius collapse, undefined and recovery',()=>{
 const d=pointCircleDocument();assert.equal(validateMathDocument(d).status,'valid');
 for(const radius of [2,0,-1,0,3,0,2]) {
  set(d,'r',{value:radius});const e=evaluateMathDocument(d);
  for(const id of ['c','ct','cd','ci','Oct','Ocd','Oci','P'])assert.equal(e.entities.get(id).defined,radius>=0,`${id} radius=${radius}`);
  if(radius>=0) {
   checkCircle(e.entities.get('ct').value,5,3,radius);checkCircle(e.entities.get('cd').value,6,8,2*radius);
   const den=25-radius**2;checkCircle(e.entities.get('ci').value,12/den,16/den,4*radius/Math.abs(den));
   near(e.entities.get('P').value.x,5+radius);near(e.entities.get('P').value.y,3);
   const rendered=renderDirectSvg(d);for(const id of ['ct','cd','ci'])assert.ok(rendered.report.renderedEntities.includes(id));
   assert.doesNotMatch(rendered.svg,/="[^"]*(?:NaN|Infinity)[^"]*"/);
  }
 }
});
test('P1: collapsed circles follow moved parents and recover after JSON round trip',()=>{
 let d=pointCircleDocument();set(d,'r',{value:0});set(d,'O',{coords:[6,8]});set(d,'k',{value:-2});
 d=JSON.parse(JSON.stringify(d));let e=evaluateMathDocument(d);
 checkCircle(e.entities.get('ct').value,8,7,0);checkCircle(e.entities.get('cd').value,-12,-16,0);checkCircle(e.entities.get('ci').value,.24,.32,0);
 set(d,'O',{coords:[0,0]});e=evaluateMathDocument(d);assert.equal(e.entities.get('ci').defined,false);assert.equal(e.entities.get('Oci').defined,false);
 set(d,'O',{coords:[3,4]});set(d,'r',{value:2});e=evaluateMathDocument(d);checkCircle(e.entities.get('ct').value,5,3,2);checkCircle(e.entities.get('cd').value,-6,-8,4);
 assert.equal(e.entities.get('ci').defined,true);assert.equal(e.entities.get('Oci').defined,true);
});
