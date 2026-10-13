import test from 'node:test';
import assert from 'node:assert/strict';
import {differences,compare,TOLERANCE} from './native-api/compare.mjs';
import {tag,programs,runProgram} from './native-api/program.mjs';
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
