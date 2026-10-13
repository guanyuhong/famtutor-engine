"""Execute the identical API program in real GeoGebra; never import FamTutor."""
import argparse,hashlib,json,os,subprocess,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]
def capture(output):
 program=Path(__file__).with_name('program.mjs').read_bytes()
 git=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True)
 report={'schema':'famtutor.native-api.trace.v1','engine':'geogebra','sourceSha':git.stdout.strip() if git.returncode==0 else None,'programSha256':hashlib.sha256(program).hexdigest(),'requiredRuntime':'5.4.920.0','binarySourceMapping':'UNVERIFIED','status':'BLOCKED','cases':[]}
 try:
  with sync_playwright() as p:
   options={'headless':True}
   if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
   browser=p.chromium.launch(**options);page=browser.new_page();page.set_default_timeout(int(os.environ.get('GGB_TIMEOUT_MS','90000')))
   page.set_content('<!doctype html><meta charset="utf-8"><div id="ggb"></div>')
   page.add_script_tag(url='https://www.geogebra.org/apps/deployggb.js')
   page.evaluate("""()=>{window.ready=false;const app=new GGBApplet({appName:'classic',width:900,height:650,language:'en',showToolBar:false,showAlgebraInput:false,appletOnLoad:api=>{window.ggb=api;window.ready=true;}},true);app.inject('ggb');}""")
   page.wait_for_function('window.ready');report['runtimeVersion']=page.evaluate('ggb.getVersion()')
   if report['runtimeVersion']!=report['requiredRuntime']:raise RuntimeError('Unexpected oracle version '+report['runtimeVersion'])
   page.add_script_tag(type='module',content=program.decode());page.wait_for_function('window.FT_API_PROGRAM')
   ids=page.evaluate('FT_API_PROGRAM.programs.map(p=>p.id)')
   for name in ids:
    try:report['cases'].append(page.evaluate('(id)=>FT_API_PROGRAM.runProgram(ggb,FT_API_PROGRAM.programs.find(p=>p.id===id))',name))
    except Exception as error:report['cases'].append({'id':name,'status':'FAILED','error':str(error)})
   report['status']='CAPTURED' if all(c['status']=='CAPTURED' for c in report['cases']) else 'FAILED'
   browser.close()
 except Exception as error:report['error']=str(error)
 raw=json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False).encode();output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(raw)
 output.with_suffix('.sha256').write_text(hashlib.sha256(raw).hexdigest()+'  '+output.name+'\n')
 print(json.dumps({k:report.get(k) for k in ['status','runtimeVersion','sourceSha','error']}))
 return report['status']=='CAPTURED'
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('artifacts/native-api/reference.json'));args=parser.parse_args();raise SystemExit(0 if capture(args.output) else 1)
