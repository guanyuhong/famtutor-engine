"""Controlled native canonical state slice. Not reference-pointer parity.
Uses the public facade, original evaluator, original MountedRenderer and actual
JSXGraph objects as independent observation surfaces. Never supplies coordinates
for undefined geometry. Raw snapshots are saved on failures as well as success.
"""
import json,os,subprocess,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(os.environ.get('STATE_EVIDENCE_DIR',str(ROOT/'artifacts/native-api-state')));OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node','node_modules/typescript/bin/tsc','-p','packages/math/tsconfig.browser-smoke.json'],cwd=ROOT,check=True)
loader="const defs=new Map(),mods=new Map();window.define=(name,deps,factory)=>defs.set(name,{deps,factory});window.define.amd={};window.ftRequire=function load(name){if(mods.has(name))return mods.get(name);const d=defs.get(name);if(!d)throw Error('Module missing '+name);const e={};mods.set(name,e);const r=d.factory(...d.deps.map(x=>x==='require'?load:x==='exports'?e:load(x)));if(r!==undefined)mods.set(name,r);return mods.get(name);};"
checks=[];states=[]
def check(name,fn):
 try:fn();checks.append({'name':name,'status':'PASSED'})
 except Exception as e:checks.append({'name':name,'status':'FAILED','error':str(e)[:3000]})
def require(x,message):
 if not x:raise AssertionError(message)
with sync_playwright() as pw:
 options={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 browser=pw.chromium.launch(**options);page=browser.new_page(viewport={'width':1000,'height':750});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<style>#stage{width:900px;height:600px}</style><div id="stage"></div>')
 for text in [(ROOT/'packages/math/vendor/jsxgraph/jsxgraphcore.js').read_text(),loader,(ROOT/'packages/math/artifacts/runtime.browser.amd.js').read_text()]:page.add_script_tag(content=text)
 page.evaluate("window.rt=ftRequire('browser-entry');window.api=rt.createGeoGebraNativeApi()")
 def observe(phase,defined,radius,center):
  result=page.evaluate("""()=>{const d=api.getDocument(),mounted=api.renderer.getDocument(),e=rt.evaluateMathDocument(d),me=rt.evaluateMathDocument(mounted),h=api.renderer.active;return {document:d,mountedDocument:mounted,report:h.report(),objects:['O','r','c','H','q'].map(n=>{const id=d.entities.find(e=>e.label===n).id,a=e.entities.get(id),b=me.entities.get(id),shape=h.getNative(id);return {n,id,apiDefined:api.isDefined(n),apiType:api.getObjectType(n),apiValue:n==='q'?api.getValue(n):null,evaluated:a,mounted:b,rendererValue:h.getValue(id),native:shape?{kind:shape.elType,x:typeof shape.X==='function'?shape.X():null,y:typeof shape.Y==='function'?shape.Y():null,r:typeof shape.Radius==='function'?shape.Radius():null}:null};})};}""")
  states.append({'phase':phase,**result});require(result['document']==result['mountedDocument'],'canonical documents diverged')
  require(not result['report']['skippedEntities'],'renderer silently skipped outputs')
  rows={r['n']:r for r in result['objects']}
  for row in rows.values():require(row['apiDefined']==row['evaluated']['defined']==row['mounted']['defined'],str(row))
  require(rows['q']['apiValue']==radius and rows['q']['rendererValue']==radius,'retained radius differs')
  for name in ['c','H']:
   row=rows[name];require(row['apiDefined']==defined,name+' wrong defined state')
   if not defined:
    require('value' not in row['evaluated'] and 'value' not in row['mounted'] and row.get('rendererValue') is None,'undefined geometry was revived')
    require(row['native'] is None and row['id'] in result['report'].get('undefinedEntities',[]),'undefined object still has a native shape')
   else:require(row['native'] is not None,'defined shape absent')
  if defined:
   require(rows['c']['native']['r']==radius,'native circle radius differs')
   require([rows['H']['native']['x'],rows['H']['native']['y']]==center,'native center differs')
  require(page.evaluate('Object.keys(JXG.boards).length')==1,'staging board leak')
 def mount_empty():
  result=page.evaluate("""async()=>{const empty=rt.createGeoGebraNativeApi();try{await empty.mount(document.getElementById('stage'),{jsxgraph:JXG});const before=empty.getDocument();if(before.revision<1||before.entities.length)throw Error('Invalid initial document');if(!empty.evalCommand('A=(1,2)'))throw Error('Command after mount failed');await empty.flush();const d=empty.getDocument(),id=d.entities.find(e=>e.label==='A').id,p=empty.renderer.active.getNative(id);return {x:empty.getXcoord('A'),nativeX:p.X(),same:JSON.stringify(d)===JSON.stringify(empty.renderer.getDocument())};}finally{await empty.destroy();}}""")
  require(result=={'x':1,'nativeX':1,'same':True},str(result));require(page.evaluate('Object.keys(JXG.boards).length')==0,'empty lifecycle board leak')
 check('state-empty-api-mount-before-command',mount_empty)
 def initial():
  page.evaluate("async()=>{if(!api.evalCommand('O=(1,2)\\nr=3\\nc=Circle(O,r)\\nH=Center(c)\\nq=Radius(c)'))throw Error('command failed');await api.mount(document.getElementById('stage'),{jsxgraph:JXG});}");observe('valid',True,3,[1,2])
 check('state-valid-public-evaluator-mounted-coherence',initial)
 def undefined():
  page.evaluate("async()=>{api.setValue('r',-1);await api.flush();}");observe('undefined',False,3,[1,2])
 check('state-undefined-removes-geometry-not-axes',undefined)
 def restore():
  page.evaluate("async()=>{window.saved=JSON.parse(JSON.stringify(api.getSnapshot()));await api.destroy();window.api=rt.createGeoGebraNativeApi();api.restoreSnapshot(saved);await api.mount(document.getElementById('stage'),{jsxgraph:JXG});}");observe('restored-undefined',False,3,[1,2])
 check('state-save-while-undefined-restore-and-remount',restore)
 def edit_undefined():
  page.evaluate("async()=>{api.setCoords('O',5,6);await api.flush();}");observe('edited-undefined',False,3,[5,6])
 check('state-continued-parent-edit-while-undefined',edit_undefined)
 def recover():
  page.evaluate("async()=>{api.setValue('r',4);await api.flush();}");observe('recovered',True,4,[5,6])
 check('state-recovery-uses-new-parent-inputs',recover)
 def cycle():
  for value in [0,-2,0,2]:
   page.evaluate("async v=>{api.setValue('r',v);await api.flush();}",value);observe('cycle-'+str(value),value>=0,max(0,value),[5,6])
 check('state-repeated-point-circle-undefined-recovery',cycle)
 check('state-no-page-errors',lambda:require(not errors,str(errors)))
 page.screenshot(path=str(OUT/'state-browser.png'))
 check('state-destroy-releases-board',lambda:page.evaluate('api.destroy()'))
 require(page.evaluate('Object.keys(JXG.boards).length')==0,'board retained after destroy')
 browser.close()
git=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True)
report={'sourceSha':git.stdout.strip() if git.returncode==0 else None,'schema':'famtutor.native-state.browser.v1','environment':'Chromium set_content','referencePointerParity':'NOT_RUN','passed':sum(c['status']=='PASSED' for c in checks),'failed':sum(c['status']=='FAILED' for c in checks),'checks':checks,'states':states}
def json_numbers(value):
 if isinstance(value,float) and not math.isfinite(value):return {'number':'NaN' if math.isnan(value) else '+Infinity' if value>0 else '-Infinity'}
 if isinstance(value,dict):return {k:json_numbers(v) for k,v in value.items()}
 if isinstance(value,list):return [json_numbers(v) for v in value]
 return value
(OUT/'browser.json').write_text(json.dumps(json_numbers(report),indent=2,allow_nan=False));print(json.dumps({k:v for k,v in report.items() if k!='states'},indent=2));raise SystemExit(bool(report['failed']))
