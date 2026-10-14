"""Version2 input timing: symmetric in-browser public observations, no disk I/O
or native-only internal observation inside primary gestures. Every attempt saved.
No retry, no script/material import, no setCoords during the recorded gesture.
"""
import argparse,hashlib,json,math,os,subprocess,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
LOADER="const defs=new Map(),mods=new Map();window.define=(n,d,f)=>defs.set(n,{d,f});window.define.amd={};window.ftRequire=function load(n){if(mods.has(n))return mods.get(n);const q=defs.get(n);if(!q)throw Error(n);const e={};mods.set(n,e);const r=q.f(...q.d.map(x=>x==='exports'?e:x==='require'?load:load(x)));if(r!==undefined)mods.set(n,r);return mods.get(n);};"
def digest(raw):return hashlib.sha256(raw).hexdigest()
def git(*args):
 p=subprocess.run(['git',*args],cwd=ROOT,text=True,capture_output=True);return p.stdout.strip() if p.returncode==0 else None
def encode(x):
 if isinstance(x,float) and not math.isfinite(x):return {'$number':'NaN' if math.isnan(x) else 'Infinity' if x>0 else '-Infinity'}
 if isinstance(x,dict):return {k:encode(v) for k,v in x.items()}
 if isinstance(x,list):return [encode(v) for v in x]
 return x
def save(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);raw=json.dumps(encode(data),indent=2,allow_nan=False).encode();path.write_bytes(raw);path.with_suffix('.sha256').write_text(digest(raw)+'  '+path.name+'\n')
AUDIT="""()=>{const d=api.getDocument(),md=api.renderer.getDocument(),ev=rt.evaluateMathDocument(d),me=rt.evaluateMathDocument(md),h=api.renderer.active;return {document:d,mountedDocument:md,report:h.report(),entities:Object.fromEntries(d.entities.filter(e=>e.label).map(e=>{const n=h.getNative(e.id);return [e.label,{evaluated:ev.entities.get(e.id),mounted:me.entities.get(e.id),renderer:h.getValue(e.id),native:n?{type:n.elType,x:typeof n.X==='function'?n.X():null,y:typeof n.Y==='function'?n.Y():null}:null}]}))};}"""
def run(engine,out,case_id=None,replicates=None,audit=False):
 raw=(HERE/'protocol.json').read_bytes();spec=json.loads(raw);observer=(HERE/'observer.js').read_bytes();sha=git('rev-parse','HEAD');tree=git('rev-parse','HEAD^{tree}')
 report={'schema':'famtutor.pointer.capture.v2','engine':engine,'protocol':spec,'protocolSha256':digest(raw),'observerSha256':digest(observer),'runnerSha256':digest(Path(__file__).read_bytes()),'sourceSha':sha,'sourceTree':tree,'trackedDirty':bool(git('diff','--name-only','HEAD')) if sha else None,'scope':'NATIVE_INSTRUMENTED_AUDIT' if audit else 'SYMMETRIC_PUBLIC_CAPTURE','cases':[],'status':'BLOCKED'}
 if audit and engine!='famtutor':raise ValueError('Native audit must be a separate native replay')
 if engine=='famtutor':subprocess.run(['node','node_modules/typescript/bin/tsc','-p','packages/math/tsconfig.browser-smoke.json'],cwd=ROOT,check=True)
 try:
  with sync_playwright() as pw:
   opts={'headless':True}
   if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
   browser=pw.chromium.launch(**opts);report['browserVersion']=browser.version
   for replicate in range(replicates if replicates is not None else spec['replicates']):
    for case in spec['cases']:
     if case_id and case['id']!=case_id:continue
     row={'id':case['id'],'replicate':replicate,'status':'BLOCKED','pageErrors':[],'controllerCalls':[],'audits':[]};report['cases'].append(row)
     page=browser.new_page(viewport={'width':1000,'height':750},device_scale_factor=1);page.set_default_timeout(int(os.environ.get('GGB_TIMEOUT_MS','60000')));page.on('pageerror',lambda e,row=row:row['pageErrors'].append(str(e)))
     try:
      page.set_content('<!doctype html><style>html,body{margin:0;padding:0}#stage{width:900px;height:600px;touch-action:none}</style><div id="stage"></div>')
      if engine=='geogebra':
       page.add_script_tag(url='https://www.geogebra.org/apps/deployggb.js')
       page.evaluate("""s=>{window.ready=false;const app=new GGBApplet({appName:'classic',width:900,height:600,perspective:'G',language:'en',showToolBar:false,showAlgebraInput:false,showMenuBar:false,showResetIcon:false,enableRightClick:true,enableLabelDrags:false,enableShiftDragZoom:false,showZoomButtons:false,showFullscreenButton:false,appletOnLoad:a=>{window.api=a;window.ready=true;}},true);app.setHTML5Codebase(s.codebase);app.inject('stage');}""",spec)
       page.wait_for_function('window.ready');row['runtimeVersion']=page.evaluate('api.getVersion()');row['selectedCodebase']=spec['codebase']
       if row['runtimeVersion']!=spec['referenceRuntime']:raise ValueError('Wrong reference version')
       page.evaluate("""s=>{const p=JSON.parse(api.getViewProperties(1)),k=s.pixelsPerUnit;api.setCoordSystem(-p.width/(2*k),p.width/(2*k),-p.height/(2*k),p.height/(2*k));api.setPointCapture(1,0);api.setGridVisible(false);api.setMode(0);}""",spec)
      else:
       for text in [(ROOT/'packages/math/vendor/jsxgraph/jsxgraphcore.js').read_text(),LOADER,(ROOT/'packages/math/artifacts/runtime.browser.amd.js').read_text()]:page.add_script_tag(content=text)
       page.evaluate("()=>{window.rt=ftRequire('browser-entry');window.api=rt.createGeoGebraNativeApi();}")
      program=spec['program']+('\n'+spec['unrelatedProgram'] if case.get('unrelatedUndefined') else '')
      row['program']=program;row['constructionReturn']=page.evaluate('(s)=>api.evalCommand(s)',program)
      if row['constructionReturn'] is not True:raise ValueError('Native construction program rejected')
      if case.get('unrelatedUndefined'):page.evaluate("api.setValue('r',-1)")
      if engine=='famtutor':page.evaluate("async()=>await api.mount(document.getElementById('stage'),{jsxgraph:JXG})")
      page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
      if engine=='geogebra':
       v=page.evaluate("()=>{const p=JSON.parse(api.getViewProperties(1)),r=document.getElementById('stage').getBoundingClientRect();return {...p,frameLeft:r.left,frameTop:r.top};}");row['view']=v
       if abs(v['invXscale']-1/spec['pixelsPerUnit'])>1e-12 or abs(v['invYscale']-1/spec['pixelsPerUnit'])>1e-12:raise ValueError('Reference calibration')
       def screen(xy):return [v['frameLeft']+v['left']+(xy[0]-v['xMin'])/v['invXscale'],v['frameTop']+v['top']+v['height']-(xy[1]-v['yMin'])/v['invYscale']]
      else:
       v=page.evaluate("()=>{const b=Object.values(JXG.boards)[0],r=b.containerObj.getBoundingClientRect();return {left:r.left,top:r.top,origin:b.origin.scrCoords,unitX:b.unitX,unitY:b.unitY};}");row['view']=v
       if abs(v['unitX']-spec['pixelsPerUnit'])>1e-9 or abs(v['unitY']-spec['pixelsPerUnit'])>1e-9:raise ValueError('Native calibration')
       def screen(xy):return [v['left']+v['origin'][1]+xy[0]*v['unitX'],v['top']+v['origin'][2]-xy[1]*v['unitY']]
      page.mouse.move(*screen([1,2]),steps=1)
      page.add_script_tag(content=observer.decode());page.evaluate('(x)=>installPointerV2(api,x.spec,x.case,x.engine)',{'spec':spec,'case':case,'engine':engine})
      if engine=='famtutor':page.evaluate('()=>{api.renderer.subscribe(e=>pointerV2.engineEvent(e));}')
      page.evaluate("pointerV2.setStep('initial');pointerV2.sample()")
      for action in case['actions']:
       page.evaluate('async a=>{await pointerV2.wait(a);pointerV2.prepare(a);}',action)
       start=time.monotonic_ns();xy=None
       if action['kind']=='down':page.mouse.down()
       elif action['kind']=='up':page.mouse.up()
       else:
        xy=screen(action['world'])
        if any(abs(x-round(x))>1e-7 for x in xy):raise ValueError('Fractional target is outside this declared profile')
        page.mouse.move(*xy,steps=1)
       ack=time.monotonic_ns();page.evaluate('pointerV2.sample()');end=time.monotonic_ns()
       row['controllerCalls'].append({'step':action['id'],'inputStartNs':start,'inputAckNs':ack,'sampleAckNs':end,'screen':xy})
       if audit:
        t=time.monotonic_ns();snapshot=page.evaluate(AUDIT);row['audits'].append({'step':action['id'],'startNs':t,'endNs':time.monotonic_ns(),'state':snapshot})
      page.evaluate('(ms)=>new Promise(r=>setTimeout(r,ms))',spec['quiescentMs'])
      page.evaluate("pointerV2.setStep('quiescent');pointerV2.sample()")
      if audit:
       t=time.monotonic_ns();snapshot=page.evaluate(AUDIT);row['audits'].append({'step':'quiescent','startNs':t,'endNs':time.monotonic_ns(),'state':snapshot})
      row['status']='CAPTURED'
     except Exception as e:row['error']=str(e);row['stack']=traceback.format_exc()
     finally:
      # Large data transfer, disk writes and screenshots happen only AFTER input.
      try:row['trace']=page.evaluate('window.pointerV2?.log??null');page.screenshot(path=str(out.parent/(out.stem+'-'+case['id']+'-'+str(replicate)+'.png')))
      except Exception as e:row['readbackError']=str(e)
      page.close();save(out,report)
   browser.close()
  report['status']='CAPTURED' if report['cases'] and all(x['status']=='CAPTURED' for x in report['cases']) else 'PARTIAL'
 except Exception as e:report['error']=str(e);report['stack']=traceback.format_exc()
 save(out,report);print(json.dumps({'engine':engine,'status':report['status'],'cases':len(report['cases']),'captured':sum(x['status']=='CAPTURED' for x in report['cases'])}));return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--engine',choices=['famtutor','geogebra'],required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--case');p.add_argument('--replicates',type=int);p.add_argument('--audit-native',action='store_true');a=p.parse_args();a.output.parent.mkdir(parents=True,exist_ok=True)
 result=run(a.engine,a.output,a.case,a.replicates,a.audit_native);raise SystemExit(0 if result['status']=='CAPTURED' else 1)
