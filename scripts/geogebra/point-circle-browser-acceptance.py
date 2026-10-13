"""Native point-circle behavior in the existing MountedRenderer, no GeoGebra backend.
Chromium set_content only; HTTP/WebKit/device coverage belongs to other gates.
"""
import json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/geogebra-results';OUT.mkdir(parents=True,exist_ok=True)
source=subprocess.run(['node','--input-type=module','-e',"import {pointCircleDocument} from './packages/math/test/fixtures/point-circle-downstream.mjs';console.log(JSON.stringify(pointCircleDocument()));"],cwd=ROOT,capture_output=True,text=True,check=True)
document=json.loads(source.stdout);checks=[]
def require(condition,message):
 if not condition:raise AssertionError(message)
def check(name,fn):
 try:fn();checks.append({'name':name,'status':'PASSED'})
 except Exception as e:checks.append({'name':name,'status':'FAILED','error':str(e)[:1500]})
with sync_playwright() as pw:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 browser=pw.chromium.launch(**opts);page=browser.new_page(viewport={'width':1400,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_default_timeout(5000)
 page.set_content((ROOT/'examples/geogebra/index.html').read_text());page.evaluate('window.__FT_READY__')
 page.evaluate('''async doc=>{await __FT_BENCH__.renderer.destroy();window.r=await __FT_BENCH__.api.mountMathRenderer(document.getElementById('stage'),doc,{jsxgraph:JXG});}''',document)
 def verify_circles():
  got=page.evaluate('''()=>{const api=__FT_BENCH__.api,e=api.evaluateMathDocument(r.getDocument()),b=Object.values(JXG.boards)[0];return ['ct','cd','ci'].map(id=>{const value=e.entities.get(id),shape=b.objectsList.find(o=>o.name===id&&o.elType==='circle');return {id,defined:value.defined,expected:value.value,actual:shape?[shape.center.X(),shape.center.Y(),shape.Radius()]:null};})}''')
  for item in got:
   require(item['defined'] and item['actual'] is not None,str(item));c=item['expected'];want=[c['center']['x'],c['center']['y'],c['radius']]
   require(all(a is not None and abs(a-b)<1e-7*(1+abs(b)) for a,b in zip(item['actual'],want)),str(item))
 def update_radius(value):
  got=page.evaluate('''async value=>{const old=r.getDocument().revision,res=await r.dispatch({type:'scalar.set',target:'r',payload:{value}});return {ok:res.ok,diagnostics:res.diagnostics,old,revision:r.getDocument().revision};}''',value)
  require(got['ok'] and got['revision']>got['old'],str(got));verify_circles()
 check('initial-native-circles',verify_circles)
 for value in [0,3,0,2,0]:check('collapse-recover-radius-'+str(value)+'-step-'+str(len(checks)),lambda value=value:update_radius(value))
 def pointer_parent():
  before=page.evaluate('r.getDocument().revision')
  loc=page.evaluate('''()=>{const b=Object.values(JXG.boards)[0],p=b.objectsList.find(o=>o.name==='O'&&o.elType==='point'),rect=b.containerObj.getBoundingClientRect();return {x:rect.left+p.coords.scrCoords[1],y:rect.top+p.coords.scrCoords[2]};}''')
  page.mouse.move(loc['x'],loc['y']);page.mouse.down();page.mouse.move(loc['x']+42,loc['y']-20,steps=12);page.mouse.up()
  page.wait_for_function('(rev)=>r.getDocument().revision>rev',arg=before);verify_circles()
  moved=page.evaluate("__FT_BENCH__.api.evaluateMathDocument(r.getDocument()).entities.get('O').value")
  require(abs(moved['x']-3)>.1,str(moved))
 check('real-parent-pointer-drag-updates-transformed-point-circles',pointer_parent)
 def round_trip():
  page.evaluate('''async()=>{const snapshot=JSON.parse(JSON.stringify(r.getDocument()));await r.destroy();window.r=await __FT_BENCH__.api.mountMathRenderer(document.getElementById('stage'),snapshot,{jsxgraph:JXG});}''');verify_circles();update_radius(2)
 check('canonical-json-remount-and-recovery',round_trip)
 check('no-browser-errors',lambda:require(not errors,str(errors)))
 page.screenshot(path=str(OUT/'point-circle-browser.png'))
 page.evaluate('r.destroy()');check('all-native-boards-released',lambda:require(page.evaluate('Object.keys(JXG.boards).length')==0,'Board retained'))
 browser.close()
report={'schema':'famtutor.point-circle.browser.v1','environment':'Chromium set_content; existing MathDocument and JSXGraph renderer','passed':sum(c['status']=='PASSED' for c in checks),'failed':sum(c['status']=='FAILED' for c in checks),'checks':checks}
(OUT/'point-circle-browser.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));raise SystemExit(bool(report['failed']))
