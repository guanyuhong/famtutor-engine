"""Typed PR10 browser/round-trip regressions against independent recorded states.
Chromium set_content only. HTTP lifecycle is separately required by npm run verify.
"""
import json,math,os,pathlib,subprocess
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/geogebra-results';OUT.mkdir(parents=True,exist_ok=True)
source=subprocess.run(['node','--input-type=module','-e',"import r from './packages/math/test/geogebra-fixtures/review-reference.v2.mjs';console.log(JSON.stringify(r));"],cwd=ROOT,capture_output=True,text=True,check=True)
fixtures=[c for c in json.loads(source.stdout)['cases'] if c['id'].startswith('review-')];checks=[]
def require(v,message):
 if not v:raise AssertionError(message)
def near(a,b):require(isinstance(a,(int,float)) and math.isfinite(a) and abs(a-b)<=1e-7*(1+abs(b)),f'{a} != {b}')
def check(name,fn):
 try:fn();checks.append({'name':name,'status':'PASSED'})
 except Exception as exc:checks.append({'name':name,'status':'FAILED','error':str(exc)[:2400]})
with sync_playwright() as pw:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 browser=pw.chromium.launch(**opts);page=browser.new_page(viewport={'width':1400,'height':1000});page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_content((ROOT/'examples/geogebra/index.html').read_text());page.evaluate('window.__FT_READY__')
 def mount(item):
  page.evaluate('''async item=>{await __FT_BENCH__.renderer.destroy();if(window.r)await r.destroy();window.imp=__FT_BENCH__.api.importGeoGebraXml(item.xml);if(imp.status!=='ready')throw Error(JSON.stringify(imp.diagnostics));window.r=await __FT_BENCH__.api.mountMathRenderer(document.getElementById('stage'),imp.document,{jsxgraph:JXG});}''',item)
 def verify(expected):
  actual=page.evaluate('''names=>{const e=__FT_BENCH__.api.evaluateMathDocument(r.getDocument());return Object.fromEntries(names.map(n=>[n,e.entities.get(imp.labels[n])]));}''',list(expected))
  for name,ref in expected.items():
   got=actual[name];require(got['defined']==ref['defined'],'Defined state '+name)
   types={'point':'point2','vector':'vector2','numeric':'scalar','line':'line2','arc':'arc2','sector':'sector2'}
   require(got['entity']['type']==types[ref['type']],'Type '+name)
   if not ref['defined']:continue
   value=got['value']
   if ref['type'] in ['point','vector']:
    near(value['x'],ref['x']);near(value['y'],ref['y'])
   elif ref['type']=='numeric':near(value,ref['value'])
   elif ref['type']=='line':
    a,b,c=ref['coefficients'];scale=math.hypot(a,b)*(1 if a>0 or a==0 and b>0 else -1);s=math.hypot(value['a'],value['b'])*(1 if value['a']>0 or value['a']==0 and value['b']>0 else -1)
    for k,v in zip(['a','b','c'],[a,b,c]):near(value[k]/s,v/scale)
   else:
    arc=value.get('arc',value);angle=(arc['endAngle']-arc['startAngle'])%(2*math.pi)
    measure=arc['radius']*angle if ref['type']=='arc' else arc['radius']**2*angle/2
    near(measure,ref['value'])
  require(page.locator('#stage svg').count()==1,'Missing renderer SVG')
 for fixture in fixtures:
  def captured_states(item=fixture):
   mount(item);verify(item['expected'])
   for u in item['updated']:
    got=page.evaluate('''async u=>{const a=u.setCoords||u.setValue;return await r.dispatch(u.setCoords?{type:'point.set',target:imp.labels[a.label],payload:{coords:a.coords}}:{type:'scalar.set',target:imp.labels[a.label],payload:{value:a.value}});}''',u)
    require(got['ok'],json.dumps(got));verify(u['expected'])
   page.evaluate('''async()=>{const model=JSON.parse(JSON.stringify(r.getDocument()));await r.destroy();window.r=await __FT_BENCH__.api.mountMathRenderer(document.getElementById('stage'),model,{jsxgraph:JXG});}''')
   verify(item['updated'][-1]['expected']);require(page.evaluate('Object.keys(JXG.boards).length')==1,'Leaked board on remount')
  check(fixture['id']+'-typed-reference-states-and-remount',captured_states)
 def typed_arrow():
  mount(fixtures[0]);kind=page.evaluate("Object.values(JXG.boards)[0].objectsList.find(o=>o.name==='v')?.elType");require(kind=='arrow','Vector is '+str(kind))
  result=page.evaluate("async()=>await r.dispatch({type:'point.set',target:imp.labels.v,payload:{coords:[7,8]}})");require(not result['ok'],'Vector accepted a point drag')
  verify(fixtures[0]['expected'])
 check('vector-native-arrow-and-no-false-point-drag',typed_arrow)
 for fixture,label in [(fixtures[0],'A'),(fixtures[3],'B')]:
  def drag(item=fixture,name=label):
   mount(item);pos=page.evaluate('''n=>{const b=Object.values(JXG.boards)[0],p=b.objectsList.find(o=>o.name===n&&o.elType==='point'),q=b.containerObj.getBoundingClientRect();return {x:q.left+p.coords.scrCoords[1],y:q.top+p.coords.scrCoords[2]};}''',name)
   before=page.evaluate('r.getDocument().revision');page.mouse.move(pos['x'],pos['y']);page.mouse.down();page.mouse.move(pos['x']+35,pos['y']+40,steps=12);page.mouse.up();page.wait_for_function('r.getDocument().revision>'+str(before))
   got=page.evaluate('''name=>{const b=Object.values(JXG.boards)[0],p=b.objectsList.find(o=>o.name===name&&o.elType==='point'),e=__FT_BENCH__.api.evaluateMathDocument(r.getDocument()).entities;return {source:e.get(imp.labels[name]).value,pointer:[p.X(),p.Y()],end:e.get(imp.labels.B).value,vector:imp.labels.v?e.get(imp.labels.v).value:null,start:e.get(imp.labels.A).value,arc:imp.labels.a?e.get(imp.labels.a).value:null};}''',name)
   near(got['source']['x'],got['pointer'][0]);near(got['source']['y'],got['pointer'][1])
   if got['vector']:
    near(got['end']['x'],got['start']['x']+got['vector']['x']);near(got['end']['y'],got['start']['y']+got['vector']['y'])
   else:
    arc=got['arc'];near(arc['radius'],2);near(math.sin(arc['endAngle']),got['source']['y']/math.hypot(got['source']['x'],got['source']['y']))
  check(fixture['id']+'-actual-pointer-writeback',drag)
 check('no-page-errors',lambda:require(not errors,json.dumps(errors)))
 page.screenshot(path=str(OUT/'review-browser.png'));page.evaluate('r.destroy()')
 check('all-boards-released',lambda:require(page.evaluate('Object.keys(JXG.boards).length')==0,'Leaked boards'))
 browser.close()
report={'schema':'famtutor.geogebra.review-browser.v1','environment':'Chromium set_content; no HTTP/WebKit/physical device certification','passed':sum(c['status']=='PASSED' for c in checks),'failed':sum(c['status']=='FAILED' for c in checks),'checks':checks}
(OUT/'review-browser.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));raise SystemExit(bool(report['failed']))
