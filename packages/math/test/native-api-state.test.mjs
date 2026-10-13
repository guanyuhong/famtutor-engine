import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeoGebraNativeApi,evaluateMathDocument,validateMathDocument,validateMathDocumentStructure} from '../dist/index.js';
const create=()=>{const api=createGeoGebraNativeApi();assert.equal(api.evalCommand('O=(1,2)\nr=3\nc=Circle(O,r)\nH=Center(c)\nq=Radius(c)'),true);return api;};
function runtime(api,label){const d=api.getDocument(),id=d.entities.find(e=>e.label===label).id;return evaluateMathDocument(d).entities.get(id);}
test('native canonical snapshot preserves undefined conic axes without a geometric value',()=>{
 const a=create();a.setValue('r',-1);const snapshot=JSON.parse(JSON.stringify(a.getSnapshot()));
 assert.equal(validateMathDocumentStructure(snapshot.document).status,'valid');assert.equal(validateMathDocument(snapshot.document).status,'invalid');
 const b=createGeoGebraNativeApi();b.restoreSnapshot(snapshot);
 assert.equal(b.isDefined('c'),false);assert.equal(b.isDefined('H'),false);assert.equal(b.getValue('q'),3);
 for(const label of ['c','H'])assert.equal(runtime(b,label).value,undefined);
 const n=snapshot.document.construction.find(n=>n.command==='circle.center_radius');
 assert.deepEqual(n.params.conicAxisState,{classification:'circle',halfAxis:3});assert.equal(n.params.coords,undefined);
});
test('native canonical snapshot continues dependencies and events after restore',()=>{
 const a=create();a.setValue('r',-1);const b=createGeoGebraNativeApi();b.restoreSnapshot(a.getSnapshot());
 const events=[];b.registerUpdateListener(n=>events.push(n));b.setCoords('O',5,6);
 assert.equal(b.isDefined('c'),false);assert.equal(b.getValue('q'),3);assert.ok(events.includes('H'));
 b.setValue('r',4);assert.equal(b.isDefined('c'),true);assert.equal(b.getXcoord('H'),5);assert.equal(b.getYcoord('H'),6);assert.equal(b.getValue('q'),4);
 assert.equal(b.evalCommand('P=Midpoint(O,H)'),true);assert.equal(b.getXcoord('P'),5);
 assert.equal(new Set(b.getDocument().entities.map(e=>e.id)).size,b.getDocument().entities.length);
});
test('native snapshot copies data and preserves point-conic classification through undefined roundtrip',()=>{
 const a=create();a.setValue('r',0);a.setValue('r',-1);const snap=a.getSnapshot();
 const b=createGeoGebraNativeApi();b.restoreSnapshot(snap);snap.document.entities.length=0;
 assert.equal(b.getObjectType('c'),'point');assert.equal(b.getValue('q'),0);assert.equal(b.isDefined('c'),false);
 b.setValue('r',2);assert.equal(b.getObjectType('c'),'circle');assert.equal(b.getValue('q'),2);
});
test('native snapshot validation is atomic for malformed graph, state, identity and source payloads',()=>{
 const a=create();a.setValue('r',-1);const before=a.getSnapshot();
 const mutations=[
  s=>s.document.construction[0].command='executeSourceScript',
  s=>s.document.construction.find(n=>n.command==='circle.center_radius').params.conicAxisState={classification:'point',halfAxis:3},
  s=>s.document.construction.find(n=>n.command==='circle.center_radius').params.conicAxisState.coords=[1,2],
  s=>s.definitions[0][1].id='missing',s=>s.definitions.push(s.definitions[0]),s=>s.serial=0,
  s=>s.document.construction[0].params.coords=[NaN,2],s=>s.document.construction[1].inputs=[{ref:'missing'}],
  s=>s.document.construction[0].params.source=()=>42,
 ];
 for(const mutate of mutations){const s=structuredClone(before);mutate(s);assert.throws(()=>a.restoreSnapshot(s));assert.deepEqual(a.getSnapshot(),before);}
 assert.throws(()=>a.restoreSnapshot(JSON.parse('{"__proto__":{}}')));assert.deepEqual(a.getSnapshot(),before);
});
test('lossy undefined-state XML export is rejected instead of silently discarding conic history',()=>{
 const a=create();a.setValue('r',-1);assert.throws(()=>a.getXML(),/getSnapshot/);assert.equal(a.getValue('q'),3);
 a.setValue('r',4);assert.match(a.getXML(),/<geogebra/);
});
