"""Research six explicitly selected public materials. Output metadata/results only, never author XML/images/scripts.
Reference execution strips scripts and stops animations. This is NOT full original-applet equivalence.
"""
import argparse, json, math, os, pathlib, subprocess, tempfile, time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
IDS=['udmtcdnh','gntjrg3g','efzw4jwg','Ba2ftYQn','jsx88pqu','aac5hn84']
OBSERVE="""labels=>Object.fromEntries(labels.map(label=>{const t=ggb.getObjectType(label),defined=ggb.isDefined(label),r={defined,type:t};if(defined){if(['point','vector'].includes(t)){r.x=ggb.getXcoord(label);r.y=ggb.getYcoord(label)}else if(['numeric','angle','segment','polygon','boolean'].includes(t)){const v=ggb.getValue(label);r.value=Number.isFinite(v)?v:null}}return [label,r]}))"""
def node(mode,filename):
 result=subprocess.run(['node',str(ROOT/'scripts/geogebra/material-probe.mjs'),mode,str(filename)],cwd=ROOT,capture_output=True,text=True,timeout=40)
 if result.returncode:raise RuntimeError(result.stderr[-1500:])
 return json.loads(result.stdout)
def compare(actual,expected,phase):
 errors=[]
 for label,a in actual.items():
  e=expected[label]
  if a['defined']!=e['defined']:errors.append({'label':label,'phase':phase,'expectedDefined':e['defined'],'actualDefined':a['defined']});continue
  if not e['defined']:continue
  for k in ['x','y','value']:
   if k not in a:continue
   av,ev=a[k],e.get(k)
   if av is None or ev is None or not math.isfinite(av) or not math.isfinite(ev) or abs(av-ev)>1e-7*(1+abs(ev)):errors.append({'label':label,'phase':phase,'key':k,'expected':ev,'actual':av})
 return errors

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',default='artifacts/author-materials.json');args=parser.parse_args()
 out=pathlib.Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
 report={'schema':'famtutor.geogebra.material-probe.v1','workflowRun':os.environ.get('GITHUB_RUN_ID'),'commit':os.environ.get('GITHUB_SHA'),'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'referenceMode':'script-free-math-only','sourceAssetsRedistributed':False,'materials':[]}
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True);context=browser.new_context();page=context.new_page()
  try:
   page.set_content('<!doctype html><div id="ggb"></div>');page.add_script_tag(url='https://www.geogebra.org/apps/deployggb.js')
   page.evaluate("""()=>{window.ready=false;new GGBApplet({appName:'classic',width:900,height:650,language:'en',showToolBar:false,appletOnLoad:api=>{window.ggb=api;window.ready=true}},true).inject('ggb')}""")
   page.wait_for_function('window.ready',timeout=90000);report['runtimeVersion']=page.evaluate('ggb.getVersion()')
   for material in IDS:
    item={'id':material,'url':'https://www.geogebra.org/m/'+material,'status':'BLOCKED','wholeMaterialCompatible':False,'states':0,'observations':0,'errors':[]}
    try:
     response=context.request.get('https://www.geogebra.org/material/download/format/file/id/'+material,timeout=45000)
     if not response.ok:raise RuntimeError('Download status '+str(response.status))
     raw=response.body()
     if len(raw)>16*1024*1024 or not raw.startswith(b'PK'):raise RuntimeError('Not a bounded .ggb archive')
     with tempfile.TemporaryDirectory(prefix='famtutor-material-') as temp:
      f=pathlib.Path(temp)/'source.ggb';f.write_bytes(raw);prep=node('prepare',f)
      item.update({k:prep[k] for k in ['source','archive','xmlSha256','strictStatus','partialStatus','scriptsRemoved']})
      item['diagnostics']=prep['diagnostics']
      if not prep.get('document') or not prep['initial']:raise RuntimeError('No importable numeric/point observations')
      page.evaluate('ggb.newConstruction()');page.evaluate('(xml)=>ggb.setXML(xml)',prep['sanitizedXml']);page.evaluate('ggb.stopAnimation()')
      request={'document':prep['document'],'labels':prep['labels']}
      for index,action in enumerate([None]+prep['changes']):
       if action:
        a=action.get('setCoords') or action['setValue'];page.evaluate('(a)=>ggb.setCoords(a.label,...a.coords)',a)
       request['action']=action;f=pathlib.Path(temp)/'request.json';f.write_text(json.dumps(request,ensure_ascii=False));state=node('state',f);request['document']=state['document']
       expected=page.evaluate(OBSERVE,list(state['observed']));errors=compare(state['observed'],expected,index)
       item['errors']+=errors;item['states']+=1;item['observations']+=len(expected)
       item.setdefault('renders',[]).append(state['render'])
      item['status']='SUBSET_MISMATCH' if item['errors'] else 'SUBSET_MATCH'
    except Exception as error:item['blockedReason']=str(error)[:1800]
    report['materials'].append(item)
    print(json.dumps({k:v for k,v in item.items() if k not in ['diagnostics','errors']},ensure_ascii=False))
  except Exception as error:report['blockedReason']=str(error)[:1800]
  browser.close()
 report['tested']=sum(m['states']>0 for m in report['materials']);report['subsetMatched']=sum(m['status']=='SUBSET_MATCH' for m in report['materials']);report['wholeMaterialsPassed']=0
 out.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False));print(json.dumps({k:v for k,v in report.items() if k!='materials'},ensure_ascii=False))
 if report['tested']!=len(IDS):raise SystemExit(2)
 # Mismatches are recorded research results, not a false full-compatibility gate.
if __name__=='__main__':main()
