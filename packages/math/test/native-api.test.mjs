import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeoGebraNativeApi} from '../dist/geogebra/native-api.js';
import {evaluateMathDocument,validateMathDocument} from '../dist/index.js';
const api=()=>createGeoGebraNativeApi();
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*(1+Math.abs(b)),`${a} != ${b}`);

test('native API distinguishes uppercase scientific literals and lowercase Euler products',()=>{
 const a=api();assert.equal(a.evalCommand('n=1e3\nA=(1E-3,-2E2)'),true);near(a.getValue('n'),3*Math.E);near(a.getXcoord('A'),.001);near(a.getYcoord('A'),-200);
});
test('native API public construction creates typed original MathDocument nodes',()=>{
 const a=api();assert.equal(a.evalCommandGetLabels('A=(1,2)\nB=(4,6)\nM=Midpoint(A,B)\ns=Segment(A,B)'), 'A,B,M,s');
 assert.deepEqual(a.getAllObjectNames(),['A','B','M','s']);assert.equal(a.getObjectNumber(),4);assert.equal(a.getObjectName(2),'M');
 assert.equal(a.getObjectType('s'),'segment');near(a.getValue('s'),5);near(a.getXcoord('M'),2.5);near(a.getYcoord('M'),4);
 const d=a.getDocument();assert.equal(d.schema,'famtutor.math.document.v1');assert.equal(validateMathDocument(d).status,'valid');assert.ok(d.construction.some(n=>n.command==='point.midpoint'));
});
test('native API setters recompute canonical dependencies, not saved positions',()=>{
 const a=api();a.evalCommand('a=2\nA=(a,-a^2)\nB=(4,6)\nM=Midpoint(A,B)');a.setValue('a',3);
 near(a.getXcoord('A'),3);near(a.getYcoord('A'),-9);near(a.getYcoord('M'),-1.5);
 assert.equal(a.isIndependent('a'),true);assert.equal(a.isIndependent('M'),false);assert.equal(a.setCoords('B',2,4),undefined);near(a.getXcoord('M'),2.5);
 const d=a.getDocument();const m=d.entities.find(e=>e.label==='M');near(evaluateMathDocument(d).entities.get(m.id).value.y,-2.5);
});
test('native vectors keep vector identity and move translated points',()=>{
 const a=api();a.evalCommand('A=(3,4)\nv=(1,2)\nB=Translate(A,v)');assert.equal(a.getObjectType('v'),'vector');a.setCoords('v',-2,1);near(a.getXcoord('B'),1);near(a.getYcoord('B'),5);
 const d=a.getDocument(),v=d.entities.find(e=>e.label==='v');assert.ok(!d.interactions.some(i=>i.target===v.id));
});
test('native circles keep legitimate axis state without reviving undefined geometry',()=>{
 const a=api();assert.equal(a.evalCommand('O=(1,2)\nr=2\nc=Circle(O,r)\nR=Radius(c)\nC=Center(c)'),true);
 a.setValue('r',0);assert.equal(a.isDefined('c'),true);assert.equal(a.getObjectType('c'),'point');assert.equal(a.getValue('R'),0);
 a.setValue('r',-1);assert.equal(a.isDefined('c'),false);assert.equal(a.isDefined('C'),false);assert.equal(a.getValue('R'),0);
 a.setCoords('O',3,4);a.setValue('r',3);assert.equal(a.getObjectType('c'),'circle');near(a.getXcoord('C'),3);near(a.getValue('R'),3);
});
test('native queries distinguish missing objects, NaN, booleans and void',()=>{
 const a=api();assert.equal(a.exists('missing'),false);assert.equal(a.isDefined('missing'),false);assert.equal(a.getObjectType('missing'),'');assert.equal(a.getValue('missing'),0);
 assert.equal(a.evalCommand('flag=true'),true);assert.equal(a.getValue('flag'),1);assert.equal(a.setValue('flag',2),undefined);assert.equal(a.getValue('flag'),0);
});
test('native update listeners see stable canonical dependent values',()=>{
 const a=api();a.evalCommand('A=(1,2)\nB=(3,4)\nM=Midpoint(A,B)');const events=[];const listener=n=>events.push([n,a.getXcoord('M')]);a.registerUpdateListener(listener);a.setCoords('A',5,6);
 assert.deepEqual(events,[['A',4],['M',4]]);a.unregisterUpdateListener(listener);a.setCoords('A',1,2);assert.equal(events.length,2);
});
test('native rejection rolls back helper nodes and refuses script/member access',()=>{
 const a=api();a.evalCommand('A=(1,2)');const before=a.getDocument();
 for(const source of ['B=Translate(A,3)','B=globalThis.process.exit()','B=@api1','B=constructor(1)','B=(1,2,3)','B=Circle(A)']){
  assert.equal(a.evalCommand(source),false,source);assert.deepEqual(a.getDocument(),before,source);
 }
});
test('native expression resolves identifiers by AST identity, not prefix substitution',()=>{
 const a=api();assert.equal(a.evalCommand('a=2\naa=5\nA=(a+aa,aa-a)'),true);near(a.getXcoord('A'),7);a.setValue('a',4);near(a.getXcoord('A'),9);near(a.getYcoord('A'),1);
});
test('native XML adapter roundtrip preserves the supported defined construction',()=>{
 const a=api();a.evalCommand('A=(1,2)\nB=(4,6)\nM=Midpoint(A,B)\nv=(1,2)\nD=Translate(A,v)');a.setCoords('A',-2,3);const b=api();b.setXML(a.getXML());
 assert.deepEqual(b.getAllObjectNames(),a.getAllObjectNames());for(const n of a.getAllObjectNames()){assert.equal(b.getObjectType(n),a.getObjectType(n));near(b.getXcoord(n),a.getXcoord(n));near(b.getYcoord(n),a.getYcoord(n));}
 b.setCoords('A',2,4);near(b.getXcoord('M'),3);near(b.getYcoord('D'),6);
});
test('native source script rejection is atomic',()=>{
 const a=api();a.evalCommand('A=(1,2)');const before=a.getDocument();assert.throws(()=>a.setXML('<geogebra><construction><javascript val="throw 1"/></construction></geogebra>'));
 assert.deepEqual(a.getDocument(),before);
});
test('native listener exceptions/reentrancy cannot corrupt the construction',()=>{
 const a=api();a.registerAddListener(()=>a.evalCommand('Injected=(9,9)'));assert.equal(a.evalCommand('A=(1,2)'),true);assert.deepEqual(a.getAllObjectNames(),['A']);assert.ok(a.diagnostics.some(d=>d.code==='LISTENER_ERROR'));
});
test('native blank and resource-limited inputs do not mutate state',()=>{
 const a=api();for(const s of ['', ' ', 'A='+'('.repeat(300)+'1'+')'.repeat(300),'A='+ '1+'.repeat(5000)+'1'])assert.equal(a.evalCommand(s),false);assert.equal(a.getObjectNumber(),0);
});

test('real-reference regression: line-like coordinate getters retain source coefficients',()=>{
 const a=api();a.evalCommand('A=(1,2)\nB=(4,6)\ns=Segment(A,B)\nl=Line(A,B)');
 for(const n of ['s','l'])assert.deepEqual([a.getXcoord(n),a.getYcoord(n),a.getZcoord(n)],[-4,3,-2]);
 a.setCoords('A',-2,3);for(const n of ['s','l'])assert.deepEqual([a.getXcoord(n),a.getYcoord(n),a.getZcoord(n)],[-3,6,-24]);
});
test('real-reference regression: construction replacement retains update listeners without clear event',()=>{
 const a=api(),events=[];a.registerUpdateListener(n=>events.push(n));a.registerClearListener(()=>events.push('clear'));
 a.evalCommand('A=(1,2)');const state=a.getXML();a.newConstruction();a.evalCommand('P=(2,3)');a.setCoords('P',3,4);a.setXML(state);a.setCoords('A',2,3);
 assert.deepEqual(events,['P','A']);
});
test('coordinate queries reject scalar object types instead of silently returning zero',()=>{
 const a=api();a.evalCommand('n=2');for(const method of ['getXcoord','getYcoord','getZcoord'])assert.throws(()=>a[method]('n'),/IllegalArgument/);
});

test('deleting objects collects orphaned literal/expression helpers, but keeps live dependencies',()=>{
 const a=api();a.evalCommand('O=(1,2)\nr=3\nkeep=Circle(O,r)');const count=a.getDocument().entities.length;
 for(let i=0;i<120;i++){assert.equal(a.evalCommand('temp=Circle(O,2+r)'),true);a.deleteObject('temp');assert.equal(a.getDocument().entities.length,count);}
 assert.equal(a.isDefined('keep'),true);a.setValue('r',4);assert.equal(a.isDefined('keep'),true);
 a.deleteObject('keep');a.deleteObject('O');a.deleteObject('r');assert.equal(a.getDocument().entities.length,0);assert.equal(a.getDocument().construction.length,0);
});

test('default checkbox exposes screen x/y but rejects algebraic z',()=>{
 const a=api();a.evalCommand('flag=true');assert.equal(a.getXcoord('flag'),0);assert.equal(a.getYcoord('flag'),0);assert.throws(()=>a.getZcoord('flag'),/IllegalArgument/);
});
