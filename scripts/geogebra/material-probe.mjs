#!/usr/bin/env node
/** Local, bounded original-material probe. Does not download, run or redistribute source scripts. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readZipEntries} from './inspector.mjs';
import {importGeoGebraArchive} from './import.mjs';
import {parseGgbXml} from '../../packages/math/dist/geogebra/xml.js';
import {evaluateMathDocument,pathPointDragPatch,renderDirectSvg} from '../../packages/math/dist/index.js';
const [mode,file]=process.argv.slice(2);
const observed=(document,labels)=>{
 const values=evaluateMathDocument(document).entities, out={};
 for(const [label,id] of Object.entries(labels)) {
  const e=values.get(id);if(!e)continue;
  const v=e.value,r={defined:e.defined,kind:e.entity.type};
  if(e.defined){
   if(e.entity.type==='point2'||e.entity.type==='vector2'){r.x=v.x;r.y=v.y;}
   else if(e.entity.type==='scalar')r.value=v;
   else if(e.entity.type==='boolean')r.value=Number(v);
   else if(e.entity.type==='angle')r.value=v.radians;
   else if(e.entity.type==='segment2')r.value=Math.hypot(v.to.x-v.from.x,v.to.y-v.from.y);
   else if(e.entity.type==='polygon2'){let a=0;v.vertices.forEach((p,i)=>{const q=v.vertices[(i+1)%v.vertices.length];a+=p.x*q.y-p.y*q.x});r.value=Math.abs(a)/2;}
  }
  if(['point2','vector2','scalar','boolean','angle','segment2','polygon2'].includes(e.entity.type))out[label]=r;
 }
 return out;
};
if(mode==='prepare') {
 const bytes=await fs.readFile(file),entries=readZipEntries(bytes,{maxArchiveBytes:16*1024*1024,maxXmlBytes:4*1024*1024,maxEntryBytes:8*1024*1024,maxExpandedBytes:24*1024*1024});
 const raw=entries.get('geogebra.xml');if(!raw)throw Error('Missing construction XML');
 const strict=importGeoGebraArchive(bytes),partial=importGeoGebraArchive(bytes,{allowPartial:true});
 const root=parseGgbXml(raw.toString('utf8'));let scriptsRemoved=0;
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const prohibited=/\b(?:Execute|RunClickScript|RunUpdateScript|OpenURL|ReadText|PlaySound|StartAnimation|ParseToFunction|ParseToNumber|Random|RandomBetween|RandomUniform|RandomNormal)\s*[\[(]/i;
 const serial=node=>{
  if(['javascript','ggbscript','script','macro'].includes(node.name)){scriptsRemoved++;return '';}
  if(node.name==='command'&&/^(Execute|RunClickScript|RunUpdateScript|OpenURL|ReadText|PlaySound|StartAnimation|Random.*)$/i.test(node.attributes.name||''))throw Error('Unsafe or stochastic construction excluded from reference execution');
  if(node.name==='expression'&&prohibited.test(node.attributes.exp||''))throw Error('Unsafe or stochastic expression excluded');
  const attrs={...node.attributes};if(node.name==='animation')attrs.playing='false';
  return '<'+node.name+Object.entries(attrs).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+'>'+escape(node.text)+node.children.map(serial).join('')+'</'+node.name+'>';
 };
 const construction=root.children.find(x=>x.name==='construction');if(!construction)throw Error('No construction');
 const sanitizedXml='<geogebra format="'+escape(root.attributes.format||'5.0')+'">'+serial(construction)+'</geogebra>';
 const document=partial.document,labels=partial.labels,initial=document?observed(document,labels):{};
 const changes=[];
 if(document)for(const [label,id] of Object.entries(labels)){
  const n=document.construction.find(x=>x.outputs.includes(id)),v=initial[label];
  if(n?.command==='point.free'&&v?.defined&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&changes.length<2)changes.push({setCoords:{label,coords:[v.x+.25,v.y+.125]}});
 }
 console.log(JSON.stringify({strictStatus:strict.status,partialStatus:partial.status,source:partial.source,archive:partial.archive,diagnostics:partial.diagnostics,xmlSha256:createHash('sha256').update(raw).digest('hex'),scriptsRemoved,referenceMode:'script-free-math-only',wholeMaterialCompatible:false,document,labels,initial,changes,sanitizedXml}));
} else if(mode==='state') {
 const request=JSON.parse(await fs.readFile(file,'utf8')),{document,labels,action}=request;
 if(action){const a=action.setCoords??action.setValue,id=labels[a.label],node=document.construction.find(n=>n.outputs.includes(id));
  if(!node)throw Error('No source node');
  if(action.setCoords){if(node.command==='point.on_path')Object.assign(node.params,pathPointDragPatch(document,id,a.coords));else if(node.command==='point.free')node.params.coords=a.coords;else throw Error('Not editable');}
  else if(['scalar.constant','scalar.slider'].includes(node.command))node.params.value=a.value;else throw Error('Not editable');
  document.revision++;
 }
 const render=renderDirectSvg(document);
 console.log(JSON.stringify({document,observed:observed(document,labels),render:{rendered:render.report.renderedEntities.length,skipped:render.report.skippedEntities.length}}));
} else throw Error('Use prepare <local.ggb> or state <request.json>');
