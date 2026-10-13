/** Identical source executed with either public API. Contains no engine import. */
export function tag(value) {
  if(value===undefined)return {type:'undefined'};
  if(value===null)return {type:'null'};
  if(typeof value==='number')return {type:'number',value:Number.isNaN(value)?'NaN':value===Infinity?'+Infinity':value===-Infinity?'-Infinity':value};
  if(['string','boolean'].includes(typeof value))return {type:typeof value,value};
  if(Array.isArray(value))return {type:'array',value:value.map(tag)};
  throw Error('Unmeasured public return type: '+typeof value);
}
export const programs=[
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
export function observe(api) {
 const names=api.getAllObjectNames();
 if(!Array.isArray(names)||new Set(names).size!==names.length)throw Error('Invalid object names');
 return {names:tag(names),count:tag(api.getObjectNumber()),objects:names.map(name=>({
  name,exists:tag(api.exists(name)),type:tag(api.getObjectType(name)),defined:tag(api.isDefined(name)),independent:tag(api.isIndependent(name)),
  x:tag(api.getXcoord(name)),y:tag(api.getYcoord(name)),z:tag(api.getZcoord(name)),value:tag(api.getValue(name))
 }))};
}
export function runProgram(api,program) {
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
   else returned=tag(api[call[0]](...call.slice(1)));
   steps.push({call,returned,state:observe(api),events:[...events]});
  }
 }finally{for(const [kind,fn]of Object.entries(listeners))api['unregister'+kind+'Listener'](fn);}
 return {id:program.id,status:'CAPTURED',steps};
}
// The browser loads this same module text; no generated expectations.
globalThis.FT_API_PROGRAM={programs,tag,observe,runProgram};
