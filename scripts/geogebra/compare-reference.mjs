#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { importGeoGebraXml, evaluateMathDocument, renderDirectSvg, validateMathDocument, pathPointDragPatch } from '../../packages/math/dist/index.js';

export async function compareReference(data) {
  if(!Array.isArray(data?.cases)||!data.cases.length)throw new Error('Reference cases must be nonempty');
  if(new Set(data.cases.map(c=>c.id)).size!==data.cases.length)throw new Error('Duplicate reference case ID');
  const report={schema:'famtutor.geogebra.comparison.v1',runtimeVersion:data.runtimeVersion,captureWorkflowRun:data.captureWorkflowRun,cases:[],passed:0,failed:0};
  for(const item of data.cases) {
    const errors=[];let observations=0,states=0;
    if(item.status!=='CAPTURED'||!item.expected||!Object.keys(item.expected).length)throw new Error(`Incomplete reference capture: ${item.id}`);
    if(createHash('sha256').update(item.xml).digest('hex')!==item.xmlSha256)throw new Error(`XML fingerprint mismatch: ${item.id}`);
    const imported=importGeoGebraXml(item.xml,{documentId:item.id,title:item.id});
    const document=imported.document;
    if(imported.status!=='ready'||!document) errors.push({step:'import',diagnostics:imported.diagnostics});
    else {
      const validation=validateMathDocument(document);if(validation.status==='invalid')errors.push({step:'validate',issues:validation.issues});
      const check=(expected,phase)=>{
        states++;const evaluated=evaluateMathDocument(document);
        for(const [label,ref] of Object.entries(expected)) {
          observations++;const entity=evaluated.entities.get(imported.labels[label]);
          if(!entity||entity.defined!==ref.defined) {errors.push({label,phase,expectedDefined:ref.defined,actualDefined:entity?.defined});continue;}
          if(!ref.defined)continue;
          const value=entity.value;
          const numeric=(key,actual)=>{const expected=ref[key];if(expected===undefined)return;if(typeof expected!=='number'||!Number.isFinite(expected)){errors.push({label,phase,key,error:'Invalid captured numeric observation'});return;}if(typeof actual!=='number'||!Number.isFinite(actual)||Math.abs(actual-expected)>1e-7*(1+Math.abs(expected)))errors.push({label,phase,key,expected,actual});};
          if(['point','vector'].includes(ref.type)){numeric('x',value?.x);numeric('y',value?.y);}
          else if(ref.type==='segment')numeric('value',Math.hypot(value.to.x-value.from.x,value.to.y-value.from.y));
          else if(ref.type==='polygon') {const points=value.vertices;let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-a.y*b.x;}numeric('value',Math.abs(area)/2);}
          else numeric('value',typeof value==='boolean'?Number(value):value?.kind==='angle'?value.radians:value);
        }
      };
      check(item.expected,'initial');
      for(const [index,update] of item.updated.entries()) {
        const action=update.setCoords??update.setValue,id=imported.labels[action.label];
        const node=document.construction.find(n=>n.outputs.includes(id));
        if(!node||!(update.setCoords?['point.free','point.on_path']:['scalar.constant','scalar.slider']).includes(node.command)){errors.push({step:'update',id,error:'not an editable source primitive'});continue;}
        if(update.setCoords) {
          if(node.command==='point.on_path')Object.assign(node.params,pathPointDragPatch(document,id,action.coords));
          else node.params.coords=action.coords;
        } else node.params.value=action.value;
        document.revision++;check(update.expected,`update-${index+1}`);
      }
      const rendered=renderDirectSvg(document);if(!rendered.svg.includes('<svg'))errors.push({step:'render'});
    }
    const status=errors.length?'FAILED':'PASSED';report[errors.length?'failed':'passed']++;
    report.cases.push({id:item.id,status,states,observations,errors,importWarnings:imported.diagnostics.filter(d=>d.severity==='warning')});
  }
  report.status=report.failed?'FAILED':'PASSED';return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const file=process.argv[2];
  const data=file?JSON.parse(await fs.readFile(file,'utf8')):(await import('../../packages/math/test/geogebra-fixtures/reference-capture.v1.mjs')).default;
  const report=await compareReference(data);
  console.log(JSON.stringify(report,null,2));
  // Strict differential gate. Known differences are not silently skipped.
  if(report.failed)process.exitCode=1;
}
