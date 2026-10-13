/** Identical source executed with either public API. Contains no engine import. */
export function tag(value) {
  if(value===undefined)return {type:'undefined'};
  if(value===null)return {type:'null'};
  if(typeof value==='number')return {type:'number',value:Number.isNaN(value)?'NaN':value===Infinity?'+Infinity':value===-Infinity?'-Infinity':value};
  if(['string','boolean'].includes(typeof value))return {type:typeof value,value};
  if(Array.isArray(value))return {type:'array',value:value.map(tag)};
  throw Error('Unmeasured public return type: '+typeof value);
}
// Preserve exceptions as outcomes, not missing observations. Only GeoGebra's
// unstable Java-to-JS class prefix is removed; the semantic error is retained.
// Raw exception text is separately retained in each engine's diagnostics.
export function invoke(api,method,args=[],diagnostics=[]) {
 try{return tag(api[method](...args));}
 catch(error){
  const raw=String(error?.message??error);diagnostics.push({method,args,raw});
  return {type:'throw',message:raw.replace(/^Class\$[A-Za-z0-9_]+:\s*/, '')};
 }
}
export const programs=[
 {id:'api-undefined-snapshot-continuation',nativeSnapshotAfter:1,steps:[
  ['evalCommandGetLabels','O=(1,2)\nr=3\nc=Circle(O,r)\nH=Center(c)\nq=Radius(c)'],
  ['setValue','r',-1],['setCoords','O',5,6],['setValue','r',4]
 ]},
 {id:'api-lexical-numbers',steps:[['evalCommand','n=1e3\nm=2e4\nq=1e-3\np=1e+3\ns=1E3\nA=(1E-3,-2E2)']]},
 {id:'api-point-dependencies',steps:[
  ['evalCommandGetLabels','A=(1,2)\nB=(4,6)\nM=Midpoint(A,B)\ns=Segment(A,B)\nl=Line(A,B)'],
  ['setCoords','A',-2,3],['setCoords','A',1,2],['getObjectName',2],['getAllObjectNames','point'],
  ['exists','missing'],['isDefined','missing'],['getObjectType','missing'],['getValue','missing'],['getXcoord','missing']
 ]},
 {id:'api-scalar-vector',steps:[
  ['evalCommand','a=2\nA=(3,4)\nv=(1,2)\nB=Translate(A,v)\nC=(a,-a^2)\nflag=true\nn=1e3'],
  ['setCoords','v',-2,1],['setValue','a',3],['setValue','flag',0],['setValue','flag',1],['setValue','a',2],['setCoords','v',1,2]
 ]},
 {id:'api-conic-defined-state',steps:[
  ['evalCommandGetLabels','O=(1,2)\nr=2\nc=Circle(O,r)\nR=Radius(c)\nC=Center(c)'],
  ['setValue','r',0],['setValue','r',-1],['setCoords','O',3,4],['setValue','r',3],['setValue','r',2]
 ]},
 {id:'api-delete-clear',steps:[
  ['evalCommand','A=(1,2)\nB=(4,6)\nM=Midpoint(A,B)'],['deleteObject','A'],['newConstruction'],['evalCommand','P=(2,3)'],['setCoords','P',3,4]
 ]},
 {id:'api-defined-state-roundtrip',steps:[
  ['evalCommand','A=(1,2)\nB=(4,6)\nM=Midpoint(A,B)\nv=(1,2)\nD=Translate(A,v)'],
  ['setCoords','A',-2,3],['$save'],['setCoords','A',6,7],['$restore'],['setCoords','A',2,4]
 ]}
];
export function observe(api,diagnostics=[]) {
 const names=api.getAllObjectNames();
 if(!Array.isArray(names)||new Set(names).size!==names.length)throw Error('Invalid object names');
 return {names:tag(names),count:tag(api.getObjectNumber()),objects:names.map(name=>({
  name,exists:invoke(api,'exists',[name],diagnostics),type:invoke(api,'getObjectType',[name],diagnostics),defined:invoke(api,'isDefined',[name],diagnostics),independent:invoke(api,'isIndependent',[name],diagnostics),
  x:invoke(api,'getXcoord',[name],diagnostics),y:invoke(api,'getYcoord',[name],diagnostics),z:invoke(api,'getZcoord',[name],diagnostics),value:invoke(api,'getValue',[name],diagnostics)
 }))};
}
export function runProgram(api,program,diagnostics=[],afterCall=()=>{}) {
 api.newConstruction();
 let events=[],saved;const listeners={};
 for(const kind of ['Add','Update','Remove','Clear']){
  const fn=(...args)=>events.push({event:kind.toLowerCase(),args:args.map(tag)});listeners[kind]=fn;api['register'+kind+'Listener'](fn);
 }
 const steps=[];
 try {
  for(const call of program.steps){
   events=[];let returned;
   if(call[0]==='$save'){
    saved=api.getXML();if(typeof saved!=='string'||!saved.includes('<geogebra'))throw Error('State export is not XML');
    // Serialization text is representation-specific; only its public return TYPE
    // and the restored observable state are in this semantic roundtrip gate.
    returned={type:'string',scope:'opaque-state-semantic-roundtrip'};
   }else if(call[0]==='$restore')returned=tag(api.setXML(saved));
   else returned=invoke(api,call[0],call.slice(1),diagnostics);
   afterCall(steps.length);
   steps.push({call,returned,state:observe(api,diagnostics),events:[...events]});
  }
 }finally{for(const [kind,fn]of Object.entries(listeners))api['unregister'+kind+'Listener'](fn);}
 return {id:program.id,status:'CAPTURED',steps};
}
// The browser loads this same module text; no generated expectations.
globalThis.FT_API_PROGRAM={programs,tag,observe,runProgram};
