import test from 'node:test';
import assert from 'node:assert/strict';
import {differences,compare,TOLERANCE} from './native-api/compare.mjs';
import {tag,programs,runProgram,invoke} from './native-api/program.mjs';
import {createGeoGebraNativeApi} from '../../packages/math/dist/index.js';
test('API comparator preserves undefined, NaN, number and string distinctions',()=>{
 for(const [a,b] of [[undefined,null],[NaN,undefined],[1,'1'],[false,0]])assert.ok(differences(tag(a),tag(b)).length);
 assert.deepEqual(differences(tag(NaN),tag(NaN)),[]);assert.equal(TOLERANCE,1e-7);
});
test('API comparator rejects missing or extra fields, object names and event reordering',()=>{
 for(const [a,b] of [[{type:'point',z:0},{type:'point'}],[{value:1},{value:1,z:0}],[['A','B'],['B','A']],[[{event:'add'},{event:'update'}],[{event:'update'},{event:'add'}]]])assert.ok(differences(a,b).length);
});
test('API comparator rejects program, SHA, version and capture mismatches',()=>{
 const good={status:'CAPTURED',programSha256:'p',sourceSha:'s',runtimeVersion:'5.4.920.0',cases:[{id:'a',steps:[]}]};
 for(const patch of [{sourceSha:null},{programSha256:'wrong'},{runtimeVersion:'wrong'},{status:'FAILED'},{cases:[]}])assert.throws(()=>compare(good,{...good,...patch}));
});
test('all shared API programs actually execute natively',()=>{
 for(const p of programs){const result=runProgram(createGeoGebraNativeApi(),p);assert.equal(result.status,'CAPTURED');assert.equal(result.steps.length,p.steps.length);}
});

test('exception observation distinguishes a throw from void, NaN and zero',()=>{
 const diagnostics=[],a={getXcoord(){throw Error('Class$S83: IllegalArgument');}};
 assert.deepEqual(invoke(a,'getXcoord',['n'],diagnostics),{type:'throw',message:'IllegalArgument'});
 assert.equal(diagnostics[0].raw,'Class$S83: IllegalArgument');
 for(const value of [undefined,NaN,0])assert.ok(differences(invoke(a,'getXcoord',['n']),tag(value)).length);
 assert.deepEqual(invoke({f(){throw Error('Other error');}},'f'),{type:'throw',message:'Other error'});
});

test('identically missing cases or failing executions cannot pass the comparison gate',()=>{
 const base={status:'CAPTURED',sourceSha:'a'.repeat(40),programSha256:'b'.repeat(64),runtimeVersion:'5.4.920.0',cases:programs.map(p=>runProgram(createGeoGebraNativeApi(),p))};
 assert.equal(compare(base,structuredClone(base)).failed,0);
 for(const mutation of [x=>x.cases.pop(),x=>x.cases[0].status='FAILED',x=>x.cases[0].steps.pop(),x=>delete x.cases[0].steps[0].state,x=>x.cases[0].steps[0].call=['getValue','wrong']]){
  const bad=structuredClone(base);mutation(bad);assert.throws(()=>compare(bad,structuredClone(bad)));
 }
});
