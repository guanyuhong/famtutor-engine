import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeoGebraNativeApi} from '../dist/index.js';
test('native snapshot rejects accessors without running supplied code',()=>{
 const api=createGeoGebraNativeApi();api.evalCommand('A=(1,2)');const before=api.getSnapshot(),snapshot=api.getSnapshot();let executed=false;
 Object.defineProperty(snapshot,'payload',{enumerable:true,get(){executed=true;return 'bad';}});
 assert.throws(()=>api.restoreSnapshot(snapshot),/accessors/);assert.equal(executed,false);assert.deepEqual(api.getSnapshot(),before);
});
