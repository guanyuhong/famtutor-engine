#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compareObservation, checkStaticSvg, RELATIVE_TOLERANCE } from './comparison-contract.mjs';
import { importGeoGebraXml, evaluateMathDocument, renderDirectSvg, validateMathDocument, setGeoGebraInput, synchronizeGeoGebraConicState } from '../../packages/math/dist/index.js';

export async function compareReference(data) {
  if(!Array.isArray(data?.cases)||!data.cases.length)throw new Error('Reference cases must be nonempty');
  if(new Set(data.cases.map(c=>c.id)).size!==data.cases.length)throw new Error('Duplicate reference case ID');
  const report={schema:'famtutor.geogebra.comparison.v2',tolerance:RELATIVE_TOLERANCE,validationScope:'typed sampled observations; not complete compatibility',runtimeVersion:data.runtimeVersion,captureWorkflowRun:data.captureWorkflowRun,cases:[],passed:0,failed:0};
  for(const item of data.cases) {
    const errors=[];let observations=0,states=0;
    if(item.status!=='CAPTURED'||!item.expected||!Object.keys(item.expected).length)throw new Error(`Incomplete reference capture: ${item.id}`);
    if(!Array.isArray(item.updated))throw new Error(`Missing update sequence: ${item.id}`);
    if(item.expectedEvents!==undefined)errors.push({code:'EVENT_SEQUENCE_NOT_VERIFIED',step:'events'});
    if(createHash('sha256').update(item.xml).digest('hex')!==item.xmlSha256)throw new Error(`XML fingerprint mismatch: ${item.id}`);
    const imported=importGeoGebraXml(item.xml,{documentId:item.id,title:item.id});
    const document=imported.document;
    if(imported.status!=='ready'||!document) errors.push({step:'import',diagnostics:imported.diagnostics});
    else {
      const validation=validateMathDocument(document);if(validation.status==='invalid')errors.push({step:'validate',issues:validation.issues});
      const check=(expected,phase)=>{
        if(!expected||typeof expected!=='object'||!Object.keys(expected).length){errors.push({phase,code:'EMPTY_EXPECTED_STATE'});return;}
        states++;const evaluated=evaluateMathDocument(document);
        for(const [label,ref] of Object.entries(expected)) {
          observations++;const entity=evaluated.entities.get(imported.labels[label]);
          errors.push(...compareObservation(ref,entity).map(error=>({label,phase,...error})));
        }
        errors.push(...checkStaticSvg(renderDirectSvg(document),document,evaluated).map(error=>({phase,step:'render',...error})));
      };
      synchronizeGeoGebraConicState(document);
      check(item.expected,'initial');
      for(const [index,update] of item.updated.entries()) {
        if(!update||Boolean(update.setCoords)===Boolean(update.setValue)){errors.push({step:'update',index,code:'INVALID_UPDATE'});continue;}
        const action=update.setCoords??update.setValue,id=imported.labels[action.label];
        if(update.setCoords&&(!Array.isArray(action.coords)||action.coords.length!==2||!action.coords.every(Number.isFinite))||update.setValue&&!Number.isFinite(action.value)){errors.push({step:'update',index,code:'INVALID_UPDATE_VALUE'});continue;}
        const node=document.construction.find(n=>n.outputs.includes(id));
        if(!node||!(update.setCoords?['point.free','point.on_path']:['scalar.constant','scalar.slider']).includes(node.command)){errors.push({step:'update',id,error:'not an editable source primitive'});continue;}
        setGeoGebraInput(document,id,update.setCoords?{coords:action.coords}:{value:action.value});
        check(update.expected,`update-${index+1}`);
      }

    }
    const status=errors.length?'FAILED':'PASSED';report[errors.length?'failed':'passed']++;
    report.cases.push({id:item.id,status,states,observations,errors,importWarnings:imported.diagnostics.filter(d=>d.severity==='warning')});
  }
  report.unsupportedOutputProbes=[];
  for(const probe of data.unsupportedOutputProbes??[]) {
    if(createHash('sha256').update(probe.xml).digest('hex')!==probe.xmlSha256)throw new Error(`Gap probe fingerprint mismatch: ${probe.id}`);
    const imported=importGeoGebraXml(probe.xml),rejected=imported.status==='rejected'&&imported.diagnostics.some(d=>d.code===probe.requiredDiagnostic);
    report.unsupportedOutputProbes.push({id:probe.id,compatibilityStatus:'UNIMPLEMENTED',strictRejection:rejected?'PASSED':'FAILED',diagnostics:imported.diagnostics});
    if(!rejected)report.failed++;
  }
  report.status=report.failed?'FAILED':'PASSED';return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const file=process.argv[2];
  const data=file?JSON.parse(await fs.readFile(file,'utf8')):(await import('../../packages/math/test/geogebra-fixtures/review-reference.v2.mjs')).default;
  const report=await compareReference(data);
  console.log(JSON.stringify(report,null,2));
  // Strict differential gate. Known differences are not silently skipped.
  if(report.failed)process.exitCode=1;
}
