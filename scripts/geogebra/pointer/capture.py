"""Real mouse input, independently executed. No setCoords during recorded drag.
Always saves partial/error evidence. GeoGebra is a separate oracle browser only.
"""
import argparse,hashlib,json,os,subprocess,traceback,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
LOADER="const defs=new Map(),mods=new Map();window.define=(name,deps,factory)=>defs.set(name,{deps,factory});window.define.amd={};window.ftRequire=function load(name){if(mods.has(name))return mods.get(name);const d=defs.get(name);if(!d)throw Error('Missing module '+name);const e={};mods.set(name,e);const r=d.factory(...d.deps.map(x=>x==='require'?load:x==='exports'?e:load(x)));if(r!==undefined)mods.set(name,r);return mods.get(name);};"
def sha(raw):return hashlib.sha256(raw).hexdigest()
def identity():
 def git(*args):
  p=subprocess.run(['git',*args],cwd=ROOT,text=True,capture_output=True);return p.stdout.strip() if p.returncode==0 else None
 return {'sourceSha':git('rev-parse','HEAD'),'sourceTree':git('rev-parse','HEAD^{tree}'),'trackedDirty':bool(git('diff','--name-only','HEAD')),'localRecoveryBase':os.environ.get('FT_RECOVERY_BASE')}
def encoded(data):
 if isinstance(data,float) and not math.isfinite(data):return {"$number":"NaN" if math.isnan(data) else "Infinity" if data>0 else "-Infinity"}
 if isinstance(data,dict):return {k:encoded(v) for k,v in data.items()}
 if isinstance(data,list):return [encoded(v) for v in data]
 return data
def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);raw=json.dumps(encoded(data),ensure_ascii=False,indent=2,allow_nan=False).encode();path.write_bytes(raw);path.with_suffix('.sha256').write_text(sha(raw)+'  '+path.name+'\n')
def run(engine,out):
 raw=(HERE/'case.json').read_bytes();spec=json.loads(raw);observer=(HERE/'recorder.js').read_bytes()
 report={'schema':'famtutor.pointer.trace.v1','engine':engine,**identity(),'caseSha256':sha(raw),'recorderSha256':sha(observer),'spec':spec,'status':'BLOCKED','samples':[],'pageErrors':[],'rawDOM':[],'publicEvents':[],'engineEvents':[]}
 if engine=='famtutor':subprocess.run(['node','node_modules/typescript/bin/tsc','-p','packages/math/tsconfig.browser-smoke.json'],cwd=ROOT,check=True)
 try:
  with sync_playwright() as pw:
   opts={'headless':True}
   if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
   browser=pw.chromium.launch(**opts);report['browserVersion']=browser.version
   page=browser.new_page(viewport=spec['viewport'],device_scale_factor=1);page.set_default_timeout(int(os.environ.get('GGB_TIMEOUT_MS','90000')));page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
   page.set_content('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}#stage{width:900px;height:600px;touch-action:none}</style><div id="stage"></div>')
   try:
    if engine=='geogebra':
     page.add_script_tag(url='https://www.geogebra.org/apps/deployggb.js')
     page.evaluate("""spec=>{window.ready=false;const app=new GGBApplet({appName:'classic',width:900,height:600,language:'en',perspective:'G',showToolBar:false,showAlgebraInput:false,showMenuBar:false,showResetIcon:false,enableRightClick:spec.referenceEnableRightClick,enableLabelDrags:false,enableShiftDragZoom:false,showZoomButtons:false,showFullscreenButton:false,appletOnLoad:a=>{window.api=a;window.ready=true;}},true);app.setHTML5Codebase(spec.codebase);app.inject('stage');}""",spec)
     page.wait_for_function('window.ready');report['runtimeVersion']=page.evaluate('api.getVersion()');report['selectedCodebase']=spec['codebase']
     if report['runtimeVersion']!=spec['requiredRuntime']:raise RuntimeError('Reference version mismatch '+report['runtimeVersion'])
     page.evaluate("""spec=>{const p=JSON.parse(api.getViewProperties(1)),k=spec.pixelsPerUnit;if(!(p.width>0&&p.height>0&&k>0))throw Error('Invalid view dimensions');api.setCoordSystem(-p.width/(2*k),p.width/(2*k),-p.height/(2*k),p.height/(2*k));api.setPointCapture(1,0);api.setGridVisible(false);api.setMode(0);}""",spec)
    else:
     for text in [(ROOT/'packages/math/vendor/jsxgraph/jsxgraphcore.js').read_text(),LOADER,(ROOT/'packages/math/artifacts/runtime.browser.amd.js').read_text()]:page.add_script_tag(content=text)
     page.evaluate("()=>{window.rt=ftRequire('browser-entry');window.api=rt.createGeoGebraNativeApi();}")
    report['constructionReturn']=page.evaluate('(s)=>api.evalCommand(s)',spec['program'])
    if report['constructionReturn'] is not True:raise RuntimeError('Construction rejected')
    if engine=='famtutor':page.evaluate("async()=>{await api.mount(document.getElementById('stage'),{jsxgraph:JXG,onEvent:e=>window.pointerRecord?.engineEvent(e)});}")
    page.add_script_tag(content=observer.decode());page.evaluate('(s)=>installPointerRecorder(api,s.spec,s.engine)',{'spec':spec,'engine':engine})
    if engine=='famtutor':page.evaluate("api.renderer.subscribe(e=>pointerRecord.engineEvent(e))")
    # View transforms are test-harness geometry, not construction outputs.
    if engine=='geogebra':
     view=page.evaluate("()=>{const p=JSON.parse(api.getViewProperties(1)),r=document.getElementById('stage').getBoundingClientRect();return {...p,frameLeft:r.left,frameTop:r.top};}")
     report['view']=view
     if abs(view['invXscale']-1/spec['pixelsPerUnit'])>1e-12 or abs(view['invYscale']-1/spec['pixelsPerUnit'])>1e-12:raise RuntimeError('Reference view calibration failed')
     def screen(xy):return [view['frameLeft']+view['left']+(xy[0]-view['xMin'])/view['invXscale'],view['frameTop']+view['top']+view['height']-(xy[1]-view['yMin'])/view['invYscale']]
    else:
     view=page.evaluate("()=>{const b=Object.values(JXG.boards)[0],r=b.containerObj.getBoundingClientRect();return {left:r.left,top:r.top,origin:b.origin.scrCoords,unitX:b.unitX,unitY:b.unitY,bounds:b.getBoundingBox()};}")
     report['view']=view
     if abs(view['unitX']-spec['pixelsPerUnit'])>1e-9 or abs(view['unitY']-spec['pixelsPerUnit'])>1e-9:raise RuntimeError('Native view calibration failed')
     def screen(xy):return [view['left']+view['origin'][1]+xy[0]*view['unitX'],view['top']+view['origin'][2]-xy[1]*view['unitY']]
    def settle():page.evaluate("async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(typeof api.flush==='function')await api.flush();}")
    def sample(step,action=None,xy=None):
     row=page.evaluate("()=>({state:pointerRecord.state(),publicEventCount:pointerRecord.trace.publicEvents.length,domEventCount:pointerRecord.trace.rawDOM.length})")
     row.update(step=step,action=action,screen=xy)
     if engine=='famtutor':
      row['native']=page.evaluate("""()=>{const d=api.getDocument(),md=api.renderer.getDocument(),e=rt.evaluateMathDocument(d),me=rt.evaluateMathDocument(md),h=api.renderer.active;return {document:d,mountedDocument:md,report:h.report(),objects:Object.fromEntries(['A','B','M','s'].map(n=>{const id=d.entities.find(x=>x.label===n).id,p=h.getNative(id);return [n,{evaluated:e.entities.get(id),mounted:me.entities.get(id),rendererValue:h.getValue(id),native:p?{type:p.elType,x:typeof p.X==='function'?p.X():null,y:typeof p.Y==='function'?p.Y():null}:null}]}))};}""")
     report['samples'].append(row)
     report.update(page.evaluate('pointerRecord.trace'));write(out,report)
    settle();sample('initial')
    for action in spec['actions']:
     page.evaluate('(s)=>window.pointerStep=s',action['id']);xy=None
     if action['type']=='move':
      xy=screen(action['world'])
      if any(abs(v-round(v))>1e-7 for v in xy):raise RuntimeError('Non-integer pointer target under calibrated view')
      page.mouse.move(*xy,steps=1)
     elif action['type']=='down':page.mouse.down()
     elif action['type']=='up':page.mouse.up()
     else:raise ValueError('Unknown pointer action')
     settle();sample(action['id'],action,xy)
    report['status']='CAPTURED'
   finally:
    try:
     report.update(page.evaluate('window.pointerRecord?.trace??{}'));page.screenshot(path=str(out.with_suffix('.png')))
    except Exception as e:report['teardownDiagnostic']=str(e)
    browser.close()
 except Exception as e:report['error']=str(e);report['pythonTrace']=traceback.format_exc()
 # Recursively encode nonfinite values, including runtime internal diagnostics.
 write(out,report);print(json.dumps({k:report.get(k) for k in ['engine','status','sourceSha','runtimeVersion','error']}));return report['status']=='CAPTURED'
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--engine',choices=['famtutor','geogebra'],required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();raise SystemExit(0 if run(a.engine,a.output) else 1)
