import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createGeoGebraNativeApi} from '../../../packages/math/dist/index.js';
import {programs,runProgram,observe} from './program.mjs';
const git=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
const file=new URL('./program.mjs',import.meta.url),bytes=await fs.readFile(file);
const report={schema:'famtutor.native-api.trace.v1',engine:'famtutor',sourceSha:git.status===0?git.stdout.trim():null,
 programSha256:createHash('sha256').update(bytes).digest('hex'),status:'CAPTURED',cases:[],exceptionDiagnostics:[]};
report.nativeSnapshotBoundaries=[];
for(const p of programs){const api=createGeoGebraNativeApi();try{report.cases.push(runProgram(api,p,report.exceptionDiagnostics,index=>{
 if(index!==p.nativeSnapshotAfter)return;
 const before=observe(api),saved=JSON.parse(JSON.stringify(api.getSnapshot()));
 api.restoreSnapshot(saved);
 if(JSON.stringify(observe(api))!==JSON.stringify(before))throw Error('Native snapshot changed observable state');
 report.nativeSnapshotBoundaries.push({case:p.id,afterStep:index,status:'PASSED',schema:saved.schema,
  scope:'native canonical roundtrip; compared to uninterrupted reference continuation, NOT XML interchange'});
}));}catch(error){report.status='FAILED';report.cases.push({id:p.id,status:'FAILED',error:String(error)});}finally{await api.destroy();}}
const out=process.argv[2];if(out)await fs.writeFile(out,JSON.stringify(report,null,2));else console.log(JSON.stringify(report,null,2));
if(report.status!=='CAPTURED')process.exitCode=1;
