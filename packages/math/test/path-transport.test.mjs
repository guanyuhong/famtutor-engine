import test from 'node:test';
import assert from 'node:assert/strict';
import {point,vector,lineFromPointDirection,segment,ray,circle,pathParameterAt,pointAtPathParameter,pathPointDragPatch,importGeoGebraXml,evaluateMathDocument,applySimulationFinalState,renderDirectSvg,createMathRenderBundle,validateMathRenderBundle} from '../dist/index.js';
import {compareReference} from '../../../scripts/geogebra/compare-reference.mjs';
import oldReference from './geogebra-fixtures/reference-capture.v1.mjs';
import transport from './geogebra-fixtures/path-reference.v1.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*(1+Math.abs(b)),`${a} != ${b}`);
const nearPoint=(p,q)=>{near(p.x,q.x);near(p.y,q.y)};
const imported=index=>{const r=importGeoGebraXml(transport.cases[index].xml);assert.equal(r.status,'ready',JSON.stringify(r.diagnostics));return r};
const nodeOf=(r,label)=>r.document.construction.find(n=>n.outputs.includes(r.labels[label]));
const value=(r,label)=>evaluateMathDocument(r.document).entities.get(r.labels[label]).value;

test('original real GeoGebra eight-case differential has no residual path mismatch',async()=>{
 const result=await compareReference(oldReference);assert.equal(result.failed,0,JSON.stringify(result.cases.filter(c=>c.errors.length)));assert.equal(result.passed,8);
});
for(const fixture of transport.cases) test(`captured GeoGebra path transport: ${fixture.id}`,async()=>{
 const result=await compareReference({...transport,cases:[fixture]});assert.equal(result.failed,0,JSON.stringify(result));assert.equal(result.cases[0].states,5);
});
test('intrinsic line coordinates use the declared oriented frame scale',()=>{
 const l=lineFromPointDirection(point(1,2),vector(3,4));nearPoint(pointAtPathParameter(l,2,5),point(7,10));near(pathParameterAt(point(7,10),l,5),2);
});
test('segment and ray parameters clamp to their own bounds',()=>{
 const s=segment(point(1,2),point(5,2)),r=ray(point(1,2),point(5,2));
 near(pathParameterAt(point(-9,8),s),0);near(pathParameterAt(point(9,8),s),1);near(pathParameterAt(point(9,8),r),2);
 nearPoint(pointAtPathParameter(r,-3),point(1,2));nearPoint(pointAtPathParameter(s,9),point(5,2));
});
test('invalid parameters and unsupported path kinds fail closed',()=>{
 const l=lineFromPointDirection(point(0,0),vector(1,0));
 for(const t of [NaN,Infinity,-Infinity])assert.throws(()=>pointAtPathParameter(l,t));
 for(const s of [0,-1,NaN,Infinity])assert.throws(()=>pointAtPathParameter(l,1,s));
 assert.throws(()=>pathParameterAt(point(1,2),point(0,0)),/support/);
});
test('retained parameter survives canonical JSON round-trip and parent motion',()=>{
 const r=imported(4),before=nodeOf(r,'P').params.pathParameter;
 r.document=JSON.parse(JSON.stringify(r.document));nodeOf(r,'A').params.coords=[-2,1];
 near(nodeOf(r,'P').params.pathParameter,before);nearPoint(value(r,'P'),transport.cases[4].updated[0].expected.P);
 assert.ok(renderDirectSvg(r.document).report.renderedEntities.includes(r.labels.P));
});
test('dragging updates intrinsic state, simulation persists it and next parent motion transports it',()=>{
 const r=imported(0);const old=nodeOf(r,'P').params.pathParameter;
 const patch=pathPointDragPatch(r.document,r.labels.P,[4,8]);assert.notEqual(patch.pathParameter,old);
 const result=applySimulationFinalState(r.document,{type:'drag',target:r.labels.P,path:[[3,2],[4,8]]});
 r.document=result;near(nodeOf(r,'P').params.pathParameter,.75);nodeOf(r,'B').params.coords=[9,6];nearPoint(value(r,'P'),point(7,5));
});
test('parameterless legacy path documents retain reprojection behavior',()=>{
 const r=imported(4);delete nodeOf(r,'P').params.pathParameter;delete nodeOf(r,'P').params.pathScale;
 const initial=nodeOf(r,'P').params.initial;nodeOf(r,'A').params.coords=[-2,1];
 assert.deepEqual(pathPointDragPatch(r.document,r.labels.P,[2,3]),{initial:[2,3]});assert.deepEqual(nodeOf(r,'P').params.initial,initial);
 assert.ok(Number.isFinite(value(r,'P').x));
});
test('zero circle is explicit, negative radius undefined, retained angle restores',()=>{
 assert.throws(()=>circle(point(0,0),0),/positive/);assert.equal(circle(point(0,0),0,true).radius,0);assert.throws(()=>circle(point(0,0),-1,true));
 const r=imported(8),parameter=nodeOf(r,'P').params.pathParameter;nodeOf(r,'r').params.value=0;
 nearPoint(value(r,'P'),point(0,0));Object.assign(nodeOf(r,'P').params,pathPointDragPatch(r.document,r.labels.P,[3,5]));near(nodeOf(r,'P').params.pathParameter,parameter);
 nodeOf(r,'r').params.value=-1;assert.equal(evaluateMathDocument(r.document).entities.get(r.labels.P).defined,false);
 assert.throws(()=>pathPointDragPatch(r.document,r.labels.P,[1,2]),/undefined/);
 nodeOf(r,'r').params.value=2;nearPoint(value(r,'P'),transport.cases[8].updated[3].expected.P);
});
test('intrinsic paths round-trip deterministically over 1000 varied frames',()=>{
 let seed=711;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
 for(let i=0;i<1000;i++){
  const origin=point(rnd()*100-50,rnd()*100-50),angle=rnd()*6.2,scale=.1+rnd()*20,t=rnd()*10-5;
  const line=lineFromPointDirection(origin,vector(Math.cos(angle),Math.sin(angle)));
  near(pathParameterAt(pointAtPathParameter(line,t,scale),line,scale),t);
 }
});

test('parameter state survives the existing RenderBundle pipeline',async()=>{
 const r=imported(4);nodeOf(r,'A').params.coords=[-2,1];
 const result=await createMathRenderBundle(r.document);assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal((await validateMathRenderBundle(result.bundle)).ok,true);
 const restored=result.bundle.document.content;nearPoint(evaluateMathDocument(restored).entities.get(r.labels.P).value,value(r,'P'));
});

test('reference gate rejects empty, duplicate, failed or corrupted captures',async()=>{
 await assert.rejects(()=>compareReference({cases:[]}));
 const c=transport.cases[0];await assert.rejects(()=>compareReference({...transport,cases:[c,c]}));
 await assert.rejects(()=>compareReference({...transport,cases:[{...c,status:'BLOCKED'}]}));
 await assert.rejects(()=>compareReference({...transport,cases:[{...c,xml:c.xml+' '}]}));
});
