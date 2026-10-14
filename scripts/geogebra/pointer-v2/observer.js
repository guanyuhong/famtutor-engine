/* Same read-only public observer on both engines. No mathematics or input writes. */
window.installPointerV2 = (api, protocol, scenario, engine) => {
  const labels = [...protocol.labels, ...(scenario.unrelatedUndefined ? protocol.unrelatedLabels : [])];
  const log = {rawDOM:[], publicEvents:[], platformEvents:[], samples:[], observations:[], errors:[]};
  let seq=0, step='setup', anchor=null, pending=null;
  const stamp=()=>({seq:++seq,step,perfMs:performance.now(),wallMs:Date.now()});
  const outcome = f => {try {const v=f();return v===undefined?{type:'undefined'}:{type:typeof v,value:typeof v==='number'&&!Number.isFinite(v)?{$number:Number.isNaN(v)?'NaN':v>0?'Infinity':'-Infinity'}:v};}catch(e){return {type:'exception',message:String(e)};}};
  const state=()=>({names:api.getAllObjectNames(),objects:Object.fromEntries(labels.map(n=>[n,{
    exists:api.exists(n),type:api.getObjectType(n),defined:api.isDefined(n),independent:api.isIndependent(n),
    value:outcome(()=>api.getValue(n)),...(protocol.coordinateLabels.includes(n)?{x:outcome(()=>api.getXcoord(n)),y:outcome(()=>api.getYcoord(n)),z:outcome(()=>api.getZcoord(n))}:{})
  }]))});
  function observed(kind) {const start=performance.now();try{return state();}finally{log.observations.push({step,kind,startMs:start,endMs:performance.now()});}}
  for(const name of ['Add','Update','Remove','Clear']) api['register'+name+'Listener']((...args)=>{
    const row={...stamp(),kind:name.toLowerCase(),args};try{row.state=observed('callback');}catch(e){row.error=String(e);log.errors.push(String(e));}log.publicEvents.push(row);
  });
  if(typeof api.registerClientListener==='function')api.registerClientListener(e=>log.platformEvents.push({...stamp(),channel:'reference-client',event:JSON.parse(JSON.stringify(e))}));
  for(const type of ['pointerover','pointerenter','pointerdown','pointermove','pointerup','pointerout','pointerleave','pointercancel','gotpointercapture','lostpointercapture','mouseover','mouseenter','mousedown','mousemove','mouseup','mouseout','mouseleave','click','dblclick'])document.addEventListener(type,e=>{
    if(pending && e.type===({down:'pointerdown',move:'pointermove',up:'pointerup'}[pending.kind])){step=pending.id;pending=null;}
    const row={...stamp(),type:e.type,eventTimeStamp:e.timeStamp,trusted:e.isTrusted,pointerType:e.pointerType??null,pointerId:e.pointerId??null,button:e.button,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY,pressure:e.pressure??null,detail:e.detail,target:{tag:e.target?.tagName,id:e.target?.id??''},coalesced:typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents().map(x=>({x:x.clientX,y:x.clientY,time:x.timeStamp})):[]};
    if(type==='pointerdown')anchor={perfMs:row.perfMs,wallMs:row.wallMs};
    row.sincePressMs=anchor?row.perfMs-anchor.perfMs:null;row.sincePressWallMs=anchor?row.wallMs-anchor.wallMs:null;log.rawDOM.push(row);
  },true);
  window.pointerV2={log,state,setStep:s=>{step=s;},prepare:a=>{pending=a;},
    async wait(action){if(action.quietMs)await new Promise(r=>setTimeout(r,action.quietMs));if(action.at!==undefined){if(!anchor)throw Error('Missing press anchor');let left=anchor.perfMs+action.at-performance.now();while(left>0){await new Promise(r=>setTimeout(r,left));left=anchor.perfMs+action.at-performance.now();}}},
    sample(){const start=performance.now();log.samples.push({step,perfMs:start,wallMs:Date.now(),state:observed('sample'),publicEventCount:log.publicEvents.length,rawDOMCount:log.rawDOM.length,sequenceAfter:seq,endMs:performance.now()});return null;},
    engineEvent:e=>log.platformEvents.push({...stamp(),channel:'native-runtime',event:JSON.parse(JSON.stringify(e))})};
};
