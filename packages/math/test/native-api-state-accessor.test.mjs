import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeoGebraNativeApi} from '../dist/index.js';
test('native snapshot rejects accessors without running supplied code',()=>{
 const api=createGeoGebraNativeApi();api.evalCommand('A=(1,2)');const before=api.getSnapshot(),snapshot=api.getSnapshot();let executed=false;
 Object.defineProperty(snapshot,'payload',{enumerable:true,get(){executed=true;return 'bad';}});
 assert.throws(()=>api.restoreSnapshot(snapshot),/accessors/);assert.equal(executed,false);assert.deepEqual(api.getSnapshot(),before);
});
test('native snapshot rejects custom array prototypes before inherited toJSON can execute',()=>{
 const api=createGeoGebraNativeApi();api.evalCommand('A=(1,2)');const before=api.getSnapshot(),snapshot=api.getSnapshot();let executed=false;
 const prototype=Object.create(Array.prototype);
 prototype.toJSON=function(){executed=true;return Array.from(this);};
 Object.setPrototypeOf(snapshot.definitions,prototype);
 assert.throws(()=>api.restoreSnapshot(snapshot),/plain arrays/);
 assert.equal(executed,false);assert.deepEqual(api.getSnapshot(),before);
});
test('a fresh API can save and restore its empty construction before any command',()=>{
 const api=createGeoGebraNativeApi(),snapshot=api.getSnapshot();
 assert.ok(snapshot.document.revision>=1);api.restoreSnapshot(snapshot);
 assert.deepEqual(api.getAllObjectNames(),[]);assert.equal(api.evalCommand('A=(1,2)'),true);
 assert.equal(api.getXcoord('A'),1);
});
