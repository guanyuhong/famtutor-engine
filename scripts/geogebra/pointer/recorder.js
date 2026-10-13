/* Test-only observer. No construction mathematics, input mutation or expected data. */
window.installPointerRecorder = (api, spec, engine) => {
  const trace={rawDOM:[],publicEvents:[],engineEvents:[],callbackErrors:[]};
  let seq=0; window.pointerStep='initial';
  function number(x){return typeof x==='number'&&!Number.isFinite(x)?{$number:Number.isNaN(x)?'NaN':x>0?'Infinity':'-Infinity'}:x;}
  function outcome(fn){try{const value=fn();return value===undefined?{type:'undefined'}:{type:typeof value,value:number(value)};}catch(e){return {type:'exception',message:String(e)};}}
  function state(){return {names:api.getAllObjectNames(),objects:Object.fromEntries(spec.labels.map(n=>[n,{
    exists:api.exists(n),type:api.getObjectType(n),defined:api.isDefined(n),independent:api.isIndependent(n),
    ...(spec.pointLabels.includes(n)?{x:outcome(()=>api.getXcoord(n)),y:outcome(()=>api.getYcoord(n)),z:outcome(()=>api.getZcoord(n))}:{}),
    value:outcome(()=>api.getValue(n))
  }]))};}
  function stamp(){return {seq:++seq,step:window.pointerStep,time:performance.now()};}
  const listeners=[];
  for(const kind of ['Add','Update','Remove','Clear']){
    const f=(...args)=>{const row={...stamp(),kind:kind.toLowerCase(),args};try{row.state=state();}catch(e){row.error=String(e);trace.callbackErrors.push(row.error);}trace.publicEvents.push(row);};
    api['register'+kind+'Listener'](f);listeners.push(()=>api['unregister'+kind+'Listener'](f));
  }
  if(typeof api.registerClientListener==='function') {
    const f=e=>trace.engineEvents.push({...stamp(),channel:'geogebra-client',event:JSON.parse(JSON.stringify(e))});
    api.registerClientListener(f);listeners.push(()=>api.unregisterClientListener(f));
  }
  for(const type of ['pointerover','pointerenter','pointerdown','pointermove','pointerup','pointerout','pointerleave','pointercancel','gotpointercapture','lostpointercapture','mouseover','mouseenter','mousedown','mousemove','mouseup','mouseout','mouseleave','click','dblclick']){
    const f=e=>trace.rawDOM.push({...stamp(),type:e.type,trusted:e.isTrusted,target:{tag:e.target?.tagName,id:e.target?.id??'',class:typeof e.target?.className==='string'?e.target.className:''},pointerId:e.pointerId??null,pointerType:e.pointerType??null,button:e.button,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY,pressure:e.pressure??null,detail:e.detail,coalesced:typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents().map(p=>({clientX:p.clientX,clientY:p.clientY,timeStamp:p.timeStamp})):[]});
    document.addEventListener(type,f,true);listeners.push(()=>document.removeEventListener(type,f,true));
  }
  window.pointerRecord={trace,state,engineEvent:e=>trace.engineEvents.push({...stamp(),channel:'famtutor-runtime',event:JSON.parse(JSON.stringify(e))}),stop:()=>listeners.forEach(f=>f()),tag:outcome};
};
