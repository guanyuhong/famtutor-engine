"""Real Chromium pointer and MountedRenderer acceptance of intrinsic paths.
Uses the built offline page (set_content); not HTTP, WebKit, or physical-device certification.
"""
import json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/geogebra-results';OUT.mkdir(parents=True,exist_ok=True)
source=subprocess.run(['node','--input-type=module','-e',"import x from './packages/math/test/geogebra-fixtures/path-reference.v1.mjs';console.log(JSON.stringify(x));"],cwd=ROOT,capture_output=True,text=True,check=True)
fixtures=json.loads(source.stdout)['cases'];checks=[]
def require(condition,message):
 if not condition:raise AssertionError(message)
def check(name,fn):
 try:fn();checks.append({'name':name,'status':'PASSED'})
 except Exception as e:checks.append({'name':name,'status':'FAILED','error':str(e)[:1500]})
with sync_playwright() as pw:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 browser=pw.chromium.launch(**opts);page=browser.new_page(viewport={'width':1400,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'examples/geogebra/index.html').read_text());page.evaluate('window.__FT_READY__')
 def mount(item):
  page.evaluate('''async item=>{await __FT_BENCH__.renderer.destroy();if(window.r)await r.destroy();window.imp=__FT_BENCH__.api.importGeoGebraXml(item.xml);if(imp.status!=='ready')throw Error(JSON.stringify(imp.diagnostics));window.r=await __FT_BENCH__.api.mountMathRenderer(document.getElementById('stage'),imp.document,{jsxgraph:JXG});}''',item)
 def pointer_location(name):
  return page.evaluate('''name=>{const b=Object.values(JXG.boards)[0],p=b.objectsList.find(o=>o.name===name&&['point','glider'].includes(o.elType)),r=b.containerObj.getBoundingClientRect();return {x:r.left+p.coords.scrCoords[1],y:r.top+p.coords.scrCoords[2]}}''',name)
 for item in fixtures:
  def dispatch_states(item=item):
   mount(item)
   for update in item['updated']:
    got=page.evaluate('''async u=>{const a=u.setCoords||u.setValue,before=r.getDocument().revision;const action=u.setCoords?{type:'point.set',target:imp.labels[a.label],payload:{coords:a.coords}}:{type:'scalar.set',target:imp.labels[a.label],payload:{value:a.value}};const res=await r.dispatch(action);const p=Object.values(JXG.boards)[0].objectsList.find(o=>o.name==='P');return {ok:res.ok,diagnostics:res.diagnostics,before,after:r.getDocument().revision,point:[p?.X(),p?.Y()]};}''',update)
    # Existing atomic edit policy rejects invalid negative radii (rather than accepting a partial model).
    if update.get('setValue',{}).get('value')==-1:
     require(not got['ok'] and got['before']==got['after'],'Invalid radius must be rejected atomically');continue
    require(got['ok'],str(got));p=update['expected']['P'];require(p['defined'],'Unexpected fixture scope')
    require(all(v is not None for v in got['point']),'Missing rendered point')
    require(abs(got['point'][0]-p['x'])<1e-7 and abs(got['point'][1]-p['y'])<1e-7,str(got)+' != '+str(p))
  check(item['id']+'-captured-states-dispatch-and-render',dispatch_states)
  def pointer_parent(item=item):
   mount(item);name='A' if 'A' in item['expected'] else 'O';pos=pointer_location(name)
   page.mouse.move(pos['x'],pos['y']);page.mouse.down()
   for step in range(1,9):
    page.mouse.move(pos['x']+step*6,pos['y']-step*2)
    got=page.evaluate('''name=>{const b=Object.values(JXG.boards)[0],p=b.objectsList.find(o=>o.name==='P'),s=b.objectsList.find(o=>o.name===name&&o.elType==='point');const e=__FT_BENCH__.api.evaluateMathDocument(r.getDocument(),{points:{[imp.labels[name]]:[s.X(),s.Y()]}}).entities.get(imp.labels.P);return {actual:[p.X(),p.Y()],expected:e.value};}''',name)
    require(abs(got['actual'][0]-got['expected']['x'])<1e-7 and abs(got['actual'][1]-got['expected']['y'])<1e-7,str(got))
   page.mouse.up();page.wait_for_function('r.getDocument().revision>1')
   require(page.evaluate('Object.keys(JXG.boards).length')==1,'Board leaked')
  check(item['id']+'-real-parent-drag-eight-intermediate-frames',pointer_parent)
 def direct_path_drag():
  mount(fixtures[4]);before=page.evaluate("r.getDocument().construction.find(n=>n.outputs.includes(imp.labels.P)).params.pathParameter")
  p=pointer_location('P');page.mouse.move(p['x'],p['y']);page.mouse.down();page.mouse.move(p['x'],p['y']-55,steps=10);page.mouse.up();page.wait_for_function('r.getDocument().revision>1')
  after=page.evaluate("r.getDocument().construction.find(n=>n.outputs.includes(imp.labels.P)).params.pathParameter");require(abs(after-before)>.01,'Path drag did not persist parameter')
  got=page.evaluate("""async()=>{await r.dispatch({type:'point.set',target:imp.labels.A,payload:{coords:[-1,2]}});const p=Object.values(JXG.boards)[0].objectsList.find(o=>o.name==='P');const v=__FT_BENCH__.api.evaluateMathDocument(r.getDocument()).entities.get(imp.labels.P).value;return {actual:[p.X(),p.Y()],expected:v}}""")
  require(abs(got['actual'][0]-got['expected']['x'])<1e-7 and abs(got['actual'][1]-got['expected']['y'])<1e-7,str(got))
 check('direct-path-pointer-drag-persists-before-next-parent-edit',direct_path_drag)
 check('no-browser-errors',lambda:require(not errors,str(errors)))
 page.evaluate('r.destroy()');check('all-boards-released',lambda:require(page.evaluate('Object.keys(JXG.boards).length')==0,'Board retained'))
 browser.close()
report={'schema':'famtutor.path.browser-acceptance.v1','environment':'Chromium set_content; original JSXGraph backend','passed':sum(c['status']=='PASSED' for c in checks),'failed':sum(c['status']=='FAILED' for c in checks),'checks':checks}
(OUT/'path-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(bool(report['failed']))
