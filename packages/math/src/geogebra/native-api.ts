import { validateNativeApiSnapshot, type NativeApiSnapshot } from "./native-snapshot.js";
export type { NativeApiSnapshot } from "./native-snapshot.js";
/** Native Apps API slice. Command text -> original MathDocument -> original kernel.
 * No GeoGebra backend, XML compiler, dynamic JS evaluation or coordinate cache.
 * Only the versioned, explicitly tested signatures are compatibility claims.
 */
import type {ConstructionNode, EntityType, JsonValue, MathDocument, RuntimeEntity} from '../types.js';
import {parseExpression, collectExpressionIdentifiers} from '../expression/parser.js';
import {tokenizeExpression} from '../expression/tokenizer.js';
import type {ExpressionNode} from '../expression/ast.js';
import {evaluateExpressionAst, SAFE_BUILTIN_NAMES} from '../expression/evaluator.js';
import {getCommandDefinition} from '../catalog/commands.js';
import {buildConstructionGraph} from '../kernel/dag.js';
import {evaluateMathDocument} from '../kernel/evaluate.js';
import {isCircle, isPoint, isVector, isSegment, subtractPoints, cross, vector} from '../kernel/geometry.js';
import {mountMathRenderer, type MathMountedRenderer, type MathMountedRendererOptions} from '../render/mounted-renderer.js';
import {synchronizeGeoGebraConicState, setGeoGebraInput} from './conic-state.js';
import {parseGgbXml, child, indexed} from './xml.js';

type Listener=(label?:string)=>void;
type EventKind='add'|'update'|'remove'|'clear';
type Definition={id:string; expression?:string; command?:string; args?:string[]};
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const split=(s:string):string[]=>{
 const out:string[]=[];let start=0,depth=0;
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){out.push(s.slice(start,i).trim());start=i+1;}if(depth<0)throw Error('Unbalanced arguments');}
 if(depth)throw Error('Unbalanced arguments');out.push(s.slice(start).trim());return out;
};
const blank=():MathDocument=>({schema:'famtutor.math.document.v1',documentId:'geogebra-native-api',revision:1,seed:1,
 metadata:{title:'Native Apps API',locale:'en',purpose:'demonstration'},entities:[],construction:[],interactions:[],
 views:[{id:'main',kind:'graphics2d',visible:true,renderer:'direct-svg',boundingBox:[-10,10,10,-10]}]});

export class GeoGebraNativeApi {
 private document=blank();
 private definitions=new Map<string,Definition>();
 private serial=0;
 private callbacks:Record<EventKind,Set<Listener>>={add:new Set(),update:new Set(),remove:new Set(),clear:new Set()};
 private notifying=false;
 private notificationState: ReadonlyMap<string,RuntimeEntity>|undefined;
 private renderer:MathMountedRenderer|undefined;
 private renderTask:Promise<void>=Promise.resolve();
 private renderFailure:unknown;
 private unsubscribe:(()=>void)|undefined;
 readonly diagnostics:Array<{code:string;message:string}>=[];

 private event(kind:EventKind,label?:string):void {
  this.notifying=true;
  try{for(const cb of [...this.callbacks[kind]])try{kind==='clear'?cb():cb(label);}catch(e){this.diagnostics.push({code:'LISTENER_ERROR',message:String(e)});}}
  finally{this.notifying=false;}
 }
 private writable():void {if(this.notifying)throw Error('Reentrant mutation is outside this API slice');}
 private listen(kind:EventKind,listener:Listener,remove=false):void {
  if(typeof listener!=='function')throw Error('Only host function listeners; source callback scripts are not executed');
  if(remove)this.callbacks[kind].delete(listener);else this.callbacks[kind].add(listener);
 }
 registerAddListener(f:Listener):void{this.listen('add',f);} unregisterAddListener(f:Listener):void{this.listen('add',f,true);}
 registerUpdateListener(f:Listener):void{this.listen('update',f);} unregisterUpdateListener(f:Listener):void{this.listen('update',f,true);}
 registerRemoveListener(f:Listener):void{this.listen('remove',f);} unregisterRemoveListener(f:Listener):void{this.listen('remove',f,true);}
 registerClearListener(f:Listener):void{this.listen('clear',f);} unregisterClearListener(f:Listener):void{this.listen('clear',f,true);}

 private id(label:string):string {const d=this.definitions.get(label);if(!d)throw Error('Unknown object '+label);return d.id;}
 private node(id:string):ConstructionNode {const n=this.document.construction.find(n=>n.outputs.includes(id));if(!n)throw Error('Missing producer '+id);return n;}
 private emit(type:EntityType,command:string,inputs:string[]=[],params:Record<string,JsonValue>={}):string {
  if(!getCommandDefinition(command))throw Error('Unknown native primitive '+command);
  if(this.document.entities.length>=2000)throw Error('Construction limit exceeded');
  const id='api'+(++this.serial);
  this.document.entities.push({id,type,role:'auxiliary',visible:false});
  this.document.construction.push({id:'node'+this.serial,command,inputs:inputs.map(ref=>({ref})),params,outputs:[id]});return id;
 }
 private expression(source:string):string {
  if(source.length>4096||source.includes('@'))throw Error('Expression outside the public syntax bounds');
  // Token boundaries distinguish identifiers from scientific-notation numbers.
  // Never rewrite identifiers with a regex over the original source text.
  const tokens=tokenizeExpression(source);if(tokens.length>512)throw Error('Expression token limit exceeded');
  let nesting=0;for(const token of tokens){if(token.type==='leftParen'&&++nesting>64)throw Error('Expression nesting limit exceeded');if(token.type==='rightParen')nesting--;}
  const names=new Set(SAFE_BUILTIN_NAMES);
  const lower=(node:ExpressionNode,depth=0):string=>{
   if(depth>64)throw Error('Expression AST depth limit exceeded');
   const visit=(child:ExpressionNode)=>lower(child,depth+1);
   switch(node.type){
    case 'number':return String(node.value);
    case 'boolean':return String(node.value);
    case 'identifier':{
     if(this.definitions.has(node.name))return this.id(node.name);
     if(['pi','e'].includes(node.name))return node.name;
     throw Error('Unsupported identifier '+node.name);
    }
    case 'unary':return '('+node.operator+visit(node.argument)+')';
    case 'binary':return '('+visit(node.left)+node.operator+visit(node.right)+')';
    case 'call':{
     if(!names.has(node.callee))throw Error('Unsupported function '+node.callee);
     return node.callee+'('+node.arguments.map(visit).join(',')+')';
    }
   }
  };
  // GeoGebra command text treats lower-case e as Euler juxtaposition;
  // the existing kernel also supports scientific literals, so lower only the
  // public lexical layer. Identifier tokens are never rewritten.
  const normalized=tokens.filter(t=>t.type!=='eof').map(t=>{
   if(t.type!=='number')return t.value;
   const m=/^(\d+(?:\.\d*)?|\.\d+)e([+-]?\d+)$/.exec(t.value);
   return m?m[1]+'*e'+(/^[+-]/.test(m[2]!)?m[2]:'*'+m[2]):t.value;
  }).join(' ');
  return lower(parseExpression(normalized));
 }
 private scalar(source:string):string {
  const expression=this.expression(source),ast=parseExpression(expression);
  const dependent=[...collectExpressionIdentifiers(ast)].some(x=>!['pi','e'].includes(x));
  if(!dependent){const value=evaluateExpressionAst(ast,()=>undefined);if(typeof value==='boolean')return this.emit('boolean','boolean.constant',[],{value});if(typeof value!=='number'||!Number.isFinite(value))throw Error('Undefined constant expressions need a dedicated primitive');return this.emit('scalar','scalar.constant',[],{value});}
  const fn=this.emit('function1','function.explicit',[],{expression,domain:[0,1],variable:'x'});
  const zero=this.emit('scalar','scalar.constant',[],{value:0});return this.emit('scalar','function.value_at',[fn,zero]);
 }
 private argument(source:string):string{return this.definitions.has(source)?this.id(source):this.scalar(source);}
 private need(ids:string[],types:EntityType[]):void {
  if(ids.length!==types.length||ids.some((id,i)=>this.document.entities.find(e=>e.id===id)?.type!==types[i]))throw Error('Unsupported command overload');
 }
 private compile(label:string,rhs:string,forcedType?:string):Definition {
  let id:string;const call=/^([A-Z][A-Za-z]*)\((.*)\)$/.exec(rhs);
  if(call){
   const name=call[1]!,args=split(call[2]!),ids=args.map(s=>this.argument(s));
   const binary:Record<string,[EntityType,string]>={Midpoint:['point2','point.midpoint'],Vector:['vector2','vector.between_points'],Line:['line2','line.through_points'],Segment:['segment2','segment.through_points']};
   if(binary[name]){this.need(ids,['point2','point2']);const [type,command]=binary[name]!;id=this.emit(type,command,ids);}
   else if(name==='Translate'){this.need(ids,['point2','vector2']);const transform=this.emit('transform2','transform.translate',[ids[1]!]);id=this.emit('point2','transform.apply',[ids[0]!,transform]);}
   else if(name==='Circle'){this.need(ids,['point2','scalar']);id=this.emit('circle2','circle.center_radius',ids,{allowPointCircle:true});}
   else if(name==='Center'){this.need(ids,['circle2']);id=this.emit('point2','point.circle_center',ids);}
   else if(name==='Radius'){this.need(ids,['circle2']);id=this.emit('scalar','measurement.circle_radius',ids,{undefinedPolicy:'conic-axis-state'});}
   else throw Error('Unsupported command '+name);
   return {id,command:name,args};
  }
  if(rhs.startsWith('(')&&rhs.endsWith(')')&&split(rhs.slice(1,-1)).length===2){
   const parts=split(rhs.slice(1,-1)).map(s=>this.expression(s));
   const constant=parts.every(s=>[...collectExpressionIdentifiers(parseExpression(s))].every(x=>['pi','e'].includes(x)));
   const vector=forcedType==='vector'||(!forcedType&&/^[a-z]/.test(label));
   if(constant){const coords=parts.map(s=>evaluateExpressionAst(parseExpression(s),()=>undefined));if(!coords.every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Invalid coordinates');id=this.emit(vector?'vector2':'point2',vector?'vector.components':'point.free',[],{[vector?'components':'coords']:coords as number[]});}
   else if(vector){const origin=this.emit('point2','point.free',[],{coords:[0,0]}),end=this.emit('point2','point.from_expressions',[],{x:parts[0]!,y:parts[1]!});id=this.emit('vector2','vector.between_points',[origin,end]);}
   else id=this.emit('point2','point.from_expressions',[],{x:parts[0]!,y:parts[1]!});
  }else id=this.scalar(rhs);
  return {id,expression:rhs};
 }
 private add(source:string,forcedType?:string):string {
  const m=/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(source.trim());
  if(!m||['pi','e','true','false','x','y','z'].includes(m[1]!))throw Error('Explicit non-reserved labels are required');
  const label=m[1]!;if(this.definitions.has(label))throw Error('Redefinition is not implemented in this slice');
  const before=clone(this.document),serial=this.serial;
  try {
   const definition=this.compile(label,m[2]!,forcedType);buildConstructionGraph(this.document);
   this.definitions.set(label,definition);const entity=this.document.entities.find(e=>e.id===definition.id)!;entity.label=label;entity.visible=!['scalar','boolean','function1'].includes(entity.type);entity.role=this.isIndependent(label)?'free':'derived';
   if(this.node(definition.id).command==='point.free')this.document.interactions!.push({target:definition.id,permissions:['select','drag']});
   this.document.revision++;synchronizeGeoGebraConicState(this.document);this.event('add',label);return label;
  }catch(e){this.document=before;this.serial=serial;this.definitions.delete(label);throw e;}
 }
 evalCommand(source:string):boolean{return this.evalCommandGetLabels(source)!==null;}
 evalCommandGetLabels(source:string):string|null {
  this.writable();if(typeof source!=='string'||source.length>32768){this.diagnostics.push({code:'COMMAND_LIMIT',message:'Command text exceeds limit'});return null;}
  const lines=source.split(/\n+/).map(s=>s.trim()).filter(Boolean);if(!lines.length||lines.length>128)return null;
  const labels:string[]=[];
  try{for(const line of lines)labels.push(this.add(line));this.render();return labels.join(',');}
  catch(e){this.diagnostics.push({code:'UNSUPPORTED_OR_INVALID_COMMAND',message:String(e)});this.render();return null;}
 }
 exists(label:string):boolean{return this.definitions.has(label);}
 private runtime(label:string){const d=this.definitions.get(label);return d?(this.notificationState??evaluateMathDocument(this.document).entities).get(d.id):undefined;}
 isDefined(label:string):boolean{return this.runtime(label)?.defined===true;}
 isIndependent(label:string):boolean {
  const d=this.definitions.get(label);if(!d)return false;const graph=buildConstructionGraph(this.document),n=graph.producerByEntity.get(d.id)!;
  return !(graph.entityDependenciesByNode.get(n)?.length);
 }
 getObjectType(label:string):string {
  const r=this.runtime(label);if(!r)return '';
  if(r.entity.type==='circle2'){const state=this.node(r.id).params?.conicAxisState as {classification?:string}|undefined;return state?.classification==='point'?'point':state?.classification==='circle'?'circle':'conic';}
  const types:Partial<Record<EntityType,string>>={point2:'point',vector2:'vector',scalar:'numeric',boolean:'boolean',segment2:'segment',line2:'line'};return types[r.entity.type]??'';
 }
 getXcoord(label:string):number{return this.coordinate(label,'x');} getYcoord(label:string):number{return this.coordinate(label,'y');}
 getZcoord(label:string):number{return this.coordinate(label,'z');}
 private coordinate(label:string,key:'x'|'y'|'z'):number {
  const r=this.runtime(label);if(!r)return 0;
  if(['point2','vector2'].includes(r.entity.type))return key==='z'?0:r.defined?(r.value as {x:number;y:number})[key]:NaN;
  if(['line2','segment2'].includes(r.entity.type)) {
   // Public coordinate queries expose the source producer's unnormalized
   // homogeneous coefficients, not our kernel's canonical line normalization.
   // Project current input geometry using existing vector primitives; no cache.
   const node=this.node(r.id),inputs=node.inputs??[];
   if(!['line.through_points','segment.through_points'].includes(node.command)||inputs.length!==2)throw Error('Unsupported coefficient projection');
   const e=evaluateMathDocument(this.document),points=inputs.map(i=>'ref' in i?e.entities.get(i.ref)?.value:undefined);
   if(!isPoint(points[0])||!isPoint(points[1]))return NaN;
   const delta=subtractPoints(points[1],points[0]);
   return key==='x'?-delta.y:key==='y'?delta.x:cross(vector(points[0].x,points[0].y),vector(points[1].x,points[1].y));
  }
  if(r.entity.type==='boolean'&&key!=='z')return 0; // Default checkbox screen position in this slice.
  throw Error('IllegalArgument');
 }
 getValue(label:string):number {const r=this.runtime(label);if(!r)return 0;if(!r.defined)return NaN;const v=r.value;if(typeof v==='number')return v;if(typeof v==='boolean')return Number(v);if(isSegment(v))return Math.hypot(v.to.x-v.from.x,v.to.y-v.from.y);return NaN;}
 getAllObjectNames(type?:string):string[]{return [...this.definitions.keys()].filter(n=>type===undefined||this.getObjectType(n)===type);}
 getObjectNumber():number{return this.definitions.size;} getObjectName(index:number):string{return this.getAllObjectNames()[index]??'';}
 private affected(target:string):string[]{const g=buildConstructionGraph(this.document),start=g.producerByEntity.get(target)!;const found=new Set([start]);for(const id of g.order)if((g.nodeDependencies.get(id)??[]).some(n=>found.has(n)))found.add(id);return g.order.filter(n=>found.has(n)).flatMap(n=>g.outputsByNode.get(n)??[]).flatMap(id=>[...this.definitions].filter(([,d])=>d.id===id).map(([label])=>label));}
 private changed(target:string):void {for(const label of this.affected(target))this.event('update',label);this.render();}
 setCoords(label:string,x:number,y:number,z?:number):void {
  this.writable();if(z!==undefined)throw Error('3D setCoords is not implemented');if(!this.exists(label))return;
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Nonfinite coordinate editing not implemented');
  const node=this.node(this.id(label));
  if(node.command==='point.free')setGeoGebraInput(this.document,this.id(label),{coords:[x,y]});
  else if(node.command==='vector.components'){node.params={...node.params,components:[x,y]};this.document.revision++;}
  else return;this.changed(this.id(label));
 }
 setValue(label:string,value:number):void {
  this.writable();if(!this.exists(label))return;const node=this.node(this.id(label));
  if(node.command==='scalar.constant'){if(!Number.isFinite(value))throw Error('Nonfinite value editing not implemented');setGeoGebraInput(this.document,this.id(label),{value});}
  else if(node.command==='boolean.constant'){node.params={...node.params,value:value===1};this.document.revision++;}
  else return;this.changed(this.id(label));
 }
 deleteObject(label:string):void {
  this.writable();if(!this.exists(label))return;const labels=this.affected(this.id(label)),ids=new Set(labels.map(n=>this.id(n)));
  const g=buildConstructionGraph(this.document),nodes=new Set([...ids].map(id=>g.producerByEntity.get(id)!));
  for(const id of g.order)if((g.nodeDependencies.get(id)??[]).some(n=>nodes.has(n)))nodes.add(id);
  for(const n of nodes)for(const id of g.outputsByNode.get(n)??[])ids.add(id);
  this.document.construction=this.document.construction.filter(n=>!nodes.has(n.id));this.document.entities=this.document.entities.filter(e=>!ids.has(e.id));this.document.interactions=this.document.interactions?.filter(i=>!ids.has(i.target));
  for(const n of [...labels].reverse()){this.definitions.delete(n);this.event('remove',n);}
  // Hidden expression/literal inputs belong to live public constructions only.
  // Mark backwards from every remaining public definition, then collect orphans.
  const remaining=buildConstructionGraph(this.document),liveNodes=new Set<string>();
  const pending=[...this.definitions.values()].map(d=>remaining.producerByEntity.get(d.id)!);
  while(pending.length){const id=pending.pop()!;if(liveNodes.has(id))continue;liveNodes.add(id);pending.push(...(remaining.nodeDependencies.get(id)??[]));}
  const liveEntities=new Set([...liveNodes].flatMap(id=>remaining.outputsByNode.get(id)??[]));
  this.document.construction=this.document.construction.filter(n=>liveNodes.has(n.id));
  this.document.entities=this.document.entities.filter(e=>liveEntities.has(e.id));
  this.document.interactions=this.document.interactions?.filter(i=>liveEntities.has(i.target));
  this.document.revision++;this.render();
 }
 newConstruction():void {this.writable();const rev=this.document.revision;this.document=blank();this.document.revision=rev+1;this.definitions.clear();this.render();}

 /** Native extensions: preserve canonical construction and algebraic history.
  * Call flush() after restoring into a mounted API. No callbacks/code are saved. */
 getSnapshot():NativeApiSnapshot {
  return validateNativeApiSnapshot({schema:"famtutor.geogebra-native.snapshot.v1",
    document:this.document,definitions:[...this.definitions],serial:this.serial});
 }
 restoreSnapshot(value:unknown):void {
  this.writable();
  // Complete validation before changing document, bindings, queue or listeners.
  const snapshot=validateNativeApiSnapshot(value);
  snapshot.document.revision=Math.max(this.document.revision,snapshot.document.revision)+1;
  this.document=snapshot.document;this.definitions=new Map(snapshot.definitions);this.serial=snapshot.serial;
  this.render();
 }
 /** Native extension: immutable canonical document, not a GeoGebra method. */
 getDocument():MathDocument{return clone(this.document);}
 private currentExpression(label:string,d:Definition):string|undefined {const n=this.node(d.id);if(n.command==='point.free')return '('+(n.params?.coords as number[]).join(',')+')';if(n.command==='vector.components')return '('+(n.params?.components as number[]).join(',')+')';if(['scalar.constant','boolean.constant'].includes(n.command))return String(n.params?.value);return d.expression;}
 getXML(label?:string):string {
  if(label===undefined&&[...evaluateMathDocument(this.document).entities.values()].some(e=>!e.defined))
    throw Error("Undefined-state XML export is not supported; use the native getSnapshot() extension.");
  const parts:string[]=[];
  for(const [name,d] of this.definitions){if(label!==undefined&&label!==name)continue;
   const r=this.runtime(name)!,kind=r.entity.type,type=kind==='circle2'?'conic':kind==='scalar'?'numeric':this.getObjectType(name);
   const expr=this.currentExpression(name,d);
   if(label===undefined){if(d.command)parts.push(`<command name="${d.command}"><input ${(d.args??[]).map((a,i)=>`a${i}="${escape(a)}"`).join(' ')}/><output a0="${name}"/></command>`);else parts.push(`<expression label="${name}" exp="${escape(expr!)}" type="${type}"/>`);}
   let body='';const v=r.value;if(r.defined&&(isPoint(v)||isVector(v)))body=`<coords x="${v.x}" y="${v.y}" z="${isVector(v)?0:1}"/>`;else if(r.defined&&(typeof v==='number'||typeof v==='boolean'))body=`<value val="${v}"/>`;
   parts.push(`<element type="${type}" label="${name}">${body}</element>`);
  }
  return label===undefined?`<?xml version="1.0" encoding="utf-8"?><geogebra format="5.0"><construction>${parts.join('')}</construction></geogebra>`:parts.join('');
 }
 setXML(xml:string):void {
  this.writable();const root=parseGgbXml(xml);const rejectScripts=(n:typeof root):void=>{if(/script|macro/i.test(n.name))throw Error('Source scripts/macros are disabled');for(const c of n.children)rejectScripts(c);};rejectScripts(root);
  const construction=child(root,'construction');if(!construction)throw Error('Missing construction');const next=new GeoGebraNativeApi();
  const produced=new Set(construction.children.filter(n=>n.name==='command').flatMap(n=>indexed(child(n,'output'))));
  for(const n of construction.children){
   if(n.name==='expression'&&!produced.has(n.attributes.label!))next.add(n.attributes.label+'='+n.attributes.exp,n.attributes.type);
   else if(n.name==='command'){const out=indexed(child(n,'output'));if(out.length!==1)throw Error('Multiple outputs not supported in this API slice');next.add(out[0]+'='+n.attributes.name+'('+indexed(child(n,'input')).join(',')+')');}
   else if(n.name==='element'&&!next.exists(n.attributes.label!)&&!produced.has(n.attributes.label!)){
    const label=n.attributes.label!,type=n.attributes.type,c=child(n,'coords')?.attributes,v=child(n,'value')?.attributes.val;
    if(['point','vector'].includes(type!)&&c){const divisor=type==='point'?Number(c.z??1):1;if(!divisor)throw Error('Infinite point');next.add(label+'=('+Number(c.x)/divisor+','+Number(c.y)/divisor+')',type);}
    else if(['numeric','boolean'].includes(type!)&&v!==undefined)next.add(label+'='+v);else throw Error('Unsupported state element '+type);
   }else if(!['element','expression','command'].includes(n.name))throw Error('Unsupported construction state '+n.name);
  }
  this.newConstruction();next.document.revision=this.document.revision+1;this.document=next.document;this.definitions=next.definitions;this.serial=next.serial;for(const n of this.definitions.keys())this.event('add',n);this.render();
 }
 private render():void {
  if(!this.renderer)return;const document=this.getDocument(),renderer=this.renderer;
  this.renderTask=this.renderTask.then(async()=>{const result=await renderer.replaceDocument(document);if(!result.ok)throw Error('Native renderer rejected API state: '+JSON.stringify(result.diagnostics));}).catch(e=>{this.renderFailure=e;});
 }
 /** Native extension: renderer lifecycle is asynchronous, public algebra API is synchronous. */
 async flush():Promise<void>{await this.renderTask;if(this.renderFailure){const error=this.renderFailure;this.renderFailure=undefined;throw error;}}
 async mount(host:HTMLElement,options:MathMountedRendererOptions={}):Promise<void>{
  await this.destroy();this.renderer=await mountMathRenderer(host,this.document,{...options,undefinedEntities:"omit",continuousPointer:true,deferPointerActivation:true});
  this.unsubscribe=this.renderer.subscribe(event=>{
   if(event.type==='interaction.updated'&&event.target){
    const state=new Map(evaluateMathDocument(this.document).entities);
    this.document=this.renderer!.getDocument();
    const affected=new Set(this.affected(event.target));
    const names=new Map([...this.definitions].map(([name,d])=>[d.id,name]));
    try {
     // Each notification follows actual completion in the original evaluator.
     // Pending nodes expose their prior committed result only DURING this
     // synchronous callback window. These observations are never math inputs,
     // never persisted, and cannot reconstruct an undefined geometric output.
     evaluateMathDocument(this.document,{},(_node,outputs)=>{
      for(const output of outputs)state.set(output.id,output);
      this.notificationState=state;
      for(const output of outputs){const name=names.get(output.id);if(name&&affected.has(name))this.event('update',name);}
     });
    } finally {this.notificationState=undefined;}
   }else if(event.type==='interaction.committed'&&event.target){
    this.document=this.renderer!.getDocument();synchronizeGeoGebraConicState(this.document);
    if(event.payload?.continuousPointer!==true)for(const n of this.affected(event.target))this.event('update',n);
   }
  });
 }
 async destroy():Promise<void>{await this.flush();this.unsubscribe?.();this.unsubscribe=undefined;if(this.renderer)await this.renderer.destroy();this.renderer=undefined;}
}
export function createGeoGebraNativeApi():GeoGebraNativeApi{return new GeoGebraNativeApi();}
