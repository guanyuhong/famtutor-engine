import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {programs} from './program.mjs';
export const TOLERANCE=1e-7;
export function differences(expected,actual,at='$',out=[]) {
 if(typeof expected==='number') {
  if(!Number.isFinite(expected)||typeof actual!=='number'||!Number.isFinite(actual)||Math.abs(actual-expected)>TOLERANCE*(1+Math.abs(expected)))out.push({path:at,expected,actual});return out;
 }
 if(expected===null||typeof expected!=='object'){if(expected!==actual)out.push({path:at,expected,actual});return out;}
 if(actual===null||typeof actual!=='object'||Array.isArray(expected)!==Array.isArray(actual)){out.push({path:at,code:'TYPE_MISMATCH',expected,actual});return out;}
 const ek=Object.keys(expected),ak=Object.keys(actual);
 if(ek.length!==ak.length||ek.some(k=>!Object.hasOwn(actual,k))||ak.some(k=>!Object.hasOwn(expected,k)))out.push({path:at,code:'FIELD_SET_MISMATCH',expected:ek,actual:ak});
 for(const k of ek)differences(expected[k],actual[k],at+'.'+k,out);return out;
}
export function compare(native,reference) {
 if(native.status!=='CAPTURED'||reference.status!=='CAPTURED')throw Error('Incomplete engine execution');
 if(!native.programSha256||native.programSha256!==reference.programSha256)throw Error('Different program sources');
 if(!native.sourceSha||native.sourceSha!==reference.sourceSha)throw Error('Different or unrecorded source SHA');
 if(reference.runtimeVersion!=='5.4.920.0')throw Error('Unpinned oracle runtime');
 if(!/^[0-9a-f]{40}$/.test(native.sourceSha)||!/^[0-9a-f]{64}$/.test(native.programSha256))throw Error('Malformed source identity');
 for(const report of [native,reference]) {
  if(report.cases?.length!==programs.length)throw Error('Missing cases');
  for(const [i,program] of programs.entries()) {
   const c=report.cases[i];if(c?.status!=='CAPTURED'||c.id!==program.id||c.steps?.length!==program.steps.length)throw Error('Incomplete case execution');
   for(const [j,call] of program.steps.entries())if(differences(call,c.steps[j]?.call).length||!c.steps[j].state||!Array.isArray(c.steps[j].events))throw Error('Missing operation/state/event evidence');
  }
 }
 if(new Set(native.cases.map(c=>c.id)).size!==native.cases.length||new Set(reference.cases.map(c=>c.id)).size!==reference.cases.length)throw Error('Duplicate cases');
 const cases=reference.cases.map((r,i)=>{const n=native.cases[i],errors=differences(r,n);return {id:r.id,status:errors.length?'FAILED':'PASSED',steps:r.steps?.length??0,errors};});
 return {schema:'famtutor.native-api.comparison.v1',sourceSha:native.sourceSha,programSha256:native.programSha256,runtimeVersion:reference.runtimeVersion,tolerance:TOLERANCE,
  scope:'Exact typed API trace, ordered events and supported own-engine semantic state roundtrip; not full API coverage',passed:cases.filter(c=>c.status==='PASSED').length,failed:cases.filter(c=>c.status==='FAILED').length,cases};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [nf,rf,out]=process.argv.slice(2);const report=compare(JSON.parse(await fs.readFile(nf)),JSON.parse(await fs.readFile(rf)));
 const text=JSON.stringify(report,null,2);if(out)await fs.writeFile(out,text);else console.log(text);if(report.failed)process.exitCode=1;
}
