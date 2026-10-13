#!/usr/bin/env node
/** Offline .ggb -> original MathDocument compiler. Never evaluate source scripts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readZipEntries } from './inspector.mjs';
import { importGeoGebraXml, renderDirectSvg } from '../../packages/math/dist/index.js';

export function importGeoGebraArchive(bytes, options = {}) {
  const entries=readZipEntries(bytes,{maxArchiveBytes:16*1024*1024,maxXmlBytes:4*1024*1024,maxEntryBytes:8*1024*1024,maxExpandedBytes:24*1024*1024});
  const xml=entries.get('geogebra.xml');if(!xml)throw new Error('Archive has no geogebra.xml');
  const result=importGeoGebraXml(xml.toString('utf8'),options);
  const hazards=[];
  for(const [name,data] of entries) {
    if(name==='geogebra_macro.xml')hazards.push({code:'MACRO_ARCHIVE_UNSUPPORTED',severity:'error',message:'Custom tools are not interpreted.'});
    if(/(?:geogebra(?:_javascript)?\.js|\.ggbscript)$/i.test(name)) {
      const text=data.toString('utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').trim();
      if(text&&!/^function\s+ggbOnInit\s*\(\s*\)\s*\{\s*\}\s*;?$/.test(text))hazards.push({code:'ARCHIVE_SCRIPT_BLOCKED',severity:'error',message:`${name} is present. Source scripts are never executed.`});
    }
  }
  result.diagnostics.push(...hazards);
  if(hazards.length){result.status=options.allowPartial&&result.document?'partial':'rejected';if(result.status==='rejected')delete result.document;}
  return {...result,archive:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,entries:entries.size,scriptsExecuted:false}};
}
async function main() {
  const args=process.argv.slice(2),file=args[0];
  if(!file||file==='--help'){console.log('node scripts/geogebra/import.mjs <local.ggb|local.xml> [--output directory] [--allow-partial]\nNo network downloads. Strict errors produce no document. Exit codes: 0 compiled, 2 partial preview, 1 rejected.');return;}
  const i=args.indexOf('--output');if(i>=0&&!args[i+1])throw new Error('--output requires a directory');
  const out=i>=0?args[i+1]:'artifacts/geogebra-import';
  const bytes=await fs.readFile(file);if(bytes.length>16*1024*1024)throw new Error('Input exceeds 16 MiB');
  const options={allowPartial:args.includes('--allow-partial'),title:path.basename(file),documentId:'ggb-import'};
  const result=bytes.subarray(0,2).toString()==='PK'?importGeoGebraArchive(bytes,options):importGeoGebraXml(bytes.toString('utf8'),options);
  await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'import-report.json'),JSON.stringify({...result,document:undefined},null,2));
  if(result.document) {
    await fs.writeFile(path.join(out,'document.json'),JSON.stringify(result.document,null,2));
    const rendered=renderDirectSvg(result.document);await fs.writeFile(path.join(out,'preview.svg'),rendered.svg);
    await fs.writeFile(path.join(out,'render-report.json'),JSON.stringify(rendered.report,null,2));
  } else {
    for(const name of ['document.json','preview.svg','render-report.json'])await fs.rm(path.join(out,name),{force:true});
  }
  console.log(JSON.stringify({status:result.status,output:out,source:result.source,diagnostics:result.diagnostics},null,2));
  process.exitCode=result.status==='rejected'?1:result.status==='partial'?2:0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
