"""Actual pointer writeback through the native public API and existing renderer.
This gate is native-only; reference pointer-event parity is explicitly NOT_RUN.
"""
import json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'artifacts/native-api';OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node','node_modules/typescript/bin/tsc','-p','packages/math/tsconfig.browser-smoke.json'],cwd=ROOT,check=True)
loader="""const defs=new Map(),mods=new Map();window.define=(name,deps,factory)=>defs.set(name,{deps,factory});window.define.amd={};window.ftRequire=function load(name){if(mods.has(name))return mods.get(name);const d=defs.get(name);if(!d)throw Error('Module missing '+name);const e={};mods.set(name,e);const result=d.factory(...d.deps.map(x=>x==='require'?load:x==='exports'?e:load(x)));if(result!==undefined)mods.set(name,result);return mods.get(name);};"""
checks=[]
def require(condition,message):
 if not condition:raise AssertionError(message)
def check(name,fn):
 try:fn();checks.append({'name':name,'status':'PASSED'})
 except Exception as e:checks.append({'name':name,'status':'FAILED','error':str(e)[:2000]})
with sync_playwright() as p:
 options={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**options);page=browser.new_page(viewport={'width':1000,'height':750});page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 css=(ROOT/'packages/math/vendor/jsxgraph/jsxgraph.css').read_text()
 page.set_content('<!doctype html><style>'+css+'#stage{width:900px;height:600px;touch-action:none}</style><div id="stage"></div>')
 page.add_script_tag(content=(ROOT/'packages/math/vendor/jsxgraph/jsxgraphcore.js').read_text());page.add_script_tag(content=loader);page.add_script_tag(content=(ROOT/'packages/math/artifacts/runtime.browser.amd.js').read_text())
 page.evaluate("""()=>{window.runtime=ftRequire('browser-entry');window.api=runtime.createGeoGebraNativeApi();window.events=[];api.registerUpdateListener(n=>events.push(n));}""")
 def mount():
  ok=page.evaluate("""async command=>{const ok=api.evalCommand(command);await api.mount(document.getElementById('stage'),{jsxgraph:JXG});return ok;}""", "A=(1,2)\nB=(4,6)\nM=Midpoint(A,B)\ns=Segment(A,B)")
  require(ok,'native evalCommand failed')
 check('public-api-direct-construction-and-mount',mount)
 def verify():
  result=page.evaluate("""()=>{const b=Object.values(JXG.boards)[0];return ['A','B','M'].map(n=>{const p=b.objectsList.find(o=>o.name===n&&typeof o.X==='function'&&typeof o.Y==='function');return {n,public:[api.getXcoord(n),api.getYcoord(n)],rendered:p?[p.X(),p.Y()]:null};})}""")
  for row in result:require(row['rendered'] is not None and all(x is not None and y is not None and abs(x-y)<1e-7*(1+abs(x)) for x,y in zip(row['public'],row['rendered'])),str(row))
 check('public-queries-match-native-renderer',verify)
 def setter():
  page.evaluate("async()=>{api.setCoords('A',-2,3);await api.flush();}");verify();require(page.evaluate("api.getXcoord('M')") == 1,'midpoint dependency not updated')
 check('public-setter-rebuilds-same-canonical-document',setter)
 def pointer():
  before=page.evaluate('api.getDocument().revision');page.evaluate('events.length=0')
  pos=page.evaluate("""()=>{const b=Object.values(JXG.boards)[0],p=b.objectsList.find(o=>o.name==='A'&&o.elType==='point'),r=b.containerObj.getBoundingClientRect();return {x:r.left+p.coords.scrCoords[1],y:r.top+p.coords.scrCoords[2]};}""")
  page.mouse.move(pos['x'],pos['y']);page.mouse.down();page.mouse.move(pos['x']+50,pos['y']-28,steps=12);page.mouse.up()
  page.wait_for_function('(v)=>api.getDocument().revision>v',arg=before);verify()
  values=page.evaluate("({x:api.getXcoord('A'),mx:api.getXcoord('M'),events:[...events]})")
  require(abs(values['x']+2)>.1,str(values));require(abs(values['mx']-(values['x']+4)/2)<1e-7,str(values));require('A' in values['events'] and 'M' in values['events'],str(values))
 check('real-pointer-writeback-is-visible-through-public-api',pointer)
 def roundtrip():
  before=page.evaluate("({x:api.getXcoord('A'),y:api.getYcoord('A'),names:api.getAllObjectNames()})")
  page.evaluate("""async()=>{const state=api.getXML();await api.destroy();window.api=runtime.createGeoGebraNativeApi();api.setXML(state);await api.mount(document.getElementById('stage'),{jsxgraph:JXG});}""");verify()
  after=page.evaluate("({x:api.getXcoord('A'),y:api.getYcoord('A'),names:api.getAllObjectNames()})");require(after==before,str(after));page.evaluate("async()=>{api.setCoords('A',1,2);await api.flush();}");verify()
 check('semantic-state-roundtrip-remount-and-edit',roundtrip)
 check('no-browser-errors',lambda:require(not errors,str(errors)))
 page.screenshot(path=str(OUT/'native-browser.png'));page.evaluate('api.destroy()')
 check('destroy-releases-existing-renderer',lambda:require(page.evaluate('Object.keys(JXG.boards).length')==0,'board leak'))
 browser.close()
report={'schema':'famtutor.native-api.browser.v1','environment':'Chromium set_content','referencePointerParity':'NOT_RUN','passed':sum(c['status']=='PASSED' for c in checks),'failed':sum(c['status']=='FAILED' for c in checks),'checks':checks}
(OUT/'browser.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));raise SystemExit(bool(report['failed']))
