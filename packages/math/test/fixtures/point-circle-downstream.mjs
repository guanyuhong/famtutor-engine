export function pointCircleDocument() {
 const d={schema:'famtutor.math.document.v1',documentId:'point-circle-downstream',revision:1,seed:19,
 metadata:{title:'Point-circle downstream regression',locale:'en',purpose:'demonstration'},entities:[],construction:[],interactions:[{target:'O',permissions:['select','drag']},{target:'Q',permissions:['select','drag']},{target:'r',permissions:['set_value']},{target:'k',permissions:['set_value']}],
 views:[{id:'main',kind:'graphics2d',visible:true,renderer:'direct-svg',boundingBox:[-15,15,15,-15]}]};
 const add=(id,type,command,inputs=[],params={})=>{
  d.entities.push({id,type,label:id,role:command==='point.free'||command==='scalar.constant'?'free':'derived',visible:type!=='transform2'});
  d.construction.push({id:'op-'+id,command,inputs:inputs.map(ref=>({ref})),params,outputs:[id]});
 };
 add('O','point2','point.free',[],{coords:[3,4]}); add('Q','point2','point.free',[],{coords:[0,0]});
 add('r','scalar','scalar.constant',[],{value:2});add('k','scalar','scalar.constant',[],{value:2});
 add('v','vector2','vector.components',[],{components:[2,-1]});
 add('c','circle2','circle.center_radius',['O','r'],{allowPointCircle:true});
 add('inv','circle2','circle.center_radius',['Q'],{radius:2});
 add('translation','transform2','transform.translate',['v']);
 add('dilation','transform2','transform.dilate',['Q'],{factor:'k'});
 add('ct','circle2','transform.apply',['c','translation']);add('cd','circle2','transform.apply',['c','dilation']);
 add('ci','circle2','circle.invert_in_circle',['c','inv']);
 for(const name of ['ct','cd','ci'])add('O'+name,'point2','point.circle_center',[name]);
 add('P','point2','point.on_path',['ct'],{initial:[7,3],pathParameter:0});
 return d;
}
