"""Capture original programs in the real engine; never infer missing expectations.
No author materials, scripts, native engine imports, or write credentials are used.
"""
import argparse, hashlib, importlib.util, json, os, pathlib, sys, time
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('original_capture', pathlib.Path(__file__).with_name('capture-reference.py'))
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)
OBSERVE = r'''labels => Object.fromEntries(labels.map(label => {
 if(!ggb.exists(label)) throw Error('Missing reference object '+label);
 const type=ggb.getObjectType(label), defined=ggb.isDefined(label), r={type,defined};
 if(!defined) return [label,r];
 if(['point','vector','point3d','vector3d'].includes(type)) {
   r.x=ggb.getXcoord(label); r.y=ggb.getYcoord(label);
   if(type.endsWith('3d')) r.z=ggb.getZcoord(label);
 } else if(type==='line') {
   const dom=new DOMParser().parseFromString(ggb.getXML(),'application/xml');
   const element=Array.from(dom.querySelectorAll('element')).find(e=>e.getAttribute('label')===label);
   const c=element?.querySelector('coords'); if(!c)throw Error('Missing line coefficients');
   r.coefficients=['x','y','z'].map(k=>Number(c.getAttribute(k)));
 } else if(type==='conicpart') {
   const dom=new DOMParser().parseFromString(ggb.getXML(),'application/xml');
   const element=Array.from(dom.querySelectorAll('element')).find(e=>e.getAttribute('label')===label);
   const c=element?.querySelector('conicPart'); if(!c)throw Error('Missing conic part type');
   const t=c.getAttribute('type'); if(!['0','1'].includes(t))throw Error('Unknown conic part type '+t);
   r.part=t==='0'?'arc':'sector'; r.value=ggb.getValue(label);
 } else if(['numeric','angle','segment','polygon','triangle','quadrilateral','boolean','arc','sector'].includes(type)) {
   r.value=ggb.getValue(label);
 } else throw Error('Unmeasured reference type '+type);
 for(const [k,v] of Object.entries(r)) {
   if(typeof v==='number'&&!Number.isFinite(v))throw Error('Nonfinite reference '+label+'.'+k);
   if(Array.isArray(v)&&!v.every(Number.isFinite))throw Error('Nonfinite reference array');
 }
 return [label,r];
}))'''
REVIEWS = [
 ('review-vector-translate','A=(3,4)\nv=(1,2)\nB=Translate(A,v)',['A','v','B'],[{'setCoords':{'label':'A','coords':[-2,3]}},{'setCoords':{'label':'A','coords':[3,4]}}]),
 ('review-dependent-vector','a=2\nv=(a,-a^2)\nA=(3,4)\nB=Translate(A,v)',['a','v','A','B'],[{'setValue':{'label':'a','value':3}},{'setValue':{'label':'a','value':-2}},{'setValue':{'label':'a','value':2}}]),
 ('review-independent-line','l:x+y=1\nA=(0,0)\nd=Distance(A,l)',['l','A','d'],[{'setCoords':{'label':'A','coords':[3,4]}},{'setCoords':{'label':'A','coords':[0,0]}}]),
 ('review-direction-arc-sector','O=(0,0)\nA=(2,0)\nB=(0,7)\na=CircularArc(O,A,B)\ns=CircularSector(O,A,B)',['O','A','B','a','s'],[{'setCoords':{'label':'B','coords':[0,11]}},{'setCoords':{'label':'B','coords':[-9,0]}},{'setCoords':{'label':'A','coords':[4,0]}},{'setCoords':{'label':'B','coords':[0,7]}},{'setCoords':{'label':'A','coords':[2,0]}}]),
]

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',default='artifacts/review-capture');parser.add_argument('--runtime-version',default='5.4.920.0');args=parser.parse_args()
 out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
 report={'schema':'famtutor.geogebra.reference-capture.v2','status':'BLOCKED','cases':[],
         'captureCommit':os.environ.get('GITHUB_SHA'),'captureWorkflowRun':os.environ.get('GITHUB_RUN_ID'),
         'runtimeVersionRequired':args.runtime_version,'binarySourceMapping':'UNVERIFIED',
         'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'authorMaterials':'NOT_REQUESTED'}
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}))
   page=browser.new_page();page.set_default_timeout(90000)
   page.set_content('<!doctype html><meta charset="utf-8"><div id="ggb"></div>')
   page.add_script_tag(url='https://www.geogebra.org/apps/deployggb.js')
   page.evaluate("""() => {window.ready=false;window.app=new GGBApplet({appName:'classic',width:900,height:650,language:'en',showToolBar:false,showAlgebraInput:false,appletOnLoad:api=>{window.ggb=api;window.ready=true;}},true);app.inject('ggb');}""")
   page.wait_for_function('window.ready');report['runtimeVersion']=page.evaluate('ggb.getVersion()')
   if report['runtimeVersion']!=args.runtime_version:raise RuntimeError('Runtime version mismatch: '+report['runtimeVersion'])
   programs=[(n,c,ls,None) for n,c,ls in original.CASES]+REVIEWS
   for name,commands,labels,actions in programs:
    entry={'id':name,'origin':'original-program-executed-by-geogebra','commands':commands,'status':'BLOCKED'}
    try:
     page.evaluate('ggb.newConstruction()')
     if not page.evaluate('(c)=>ggb.evalCommand(c)',commands):raise RuntimeError('Reference rejected original program')
     xml=page.evaluate('ggb.getXML()');entry.update(xml=xml,xmlSha256=hashlib.sha256(xml.encode()).hexdigest(),updated=[])
     entry['expected']=page.evaluate(OBSERVE,labels)
     if actions is None:
      actions=[]
      if page.evaluate('ggb.exists("A") && ggb.isIndependent("A")'):actions.append({'setCoords':{'label':'A','coords':[-2,1]}})
      if name=='exponent-log':actions.append({'setValue':{'label':'a','value':4}})
     for action in actions:
      page.evaluate("""a=>{if(a.setCoords)ggb.setCoords(a.setCoords.label,...a.setCoords.coords);else ggb.setValue(a.setValue.label,a.setValue.value);}""",action)
      entry['updated'].append({**action,'expected':page.evaluate(OBSERVE,labels)})
     entry['status']='CAPTURED'
    except Exception as exc:entry['error']=str(exc)[:2400]
    report['cases'].append(entry)
   browser.close()
  report['status']='CAPTURED' if len(report['cases'])==12 and all(c['status']=='CAPTURED' for c in report['cases']) else 'PARTIAL'
 except Exception as exc:report['error']=str(exc)[:3000]
 raw=json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False).encode();(out/'capture.json').write_bytes(raw)
 (out/'SHA256SUMS').write_text(hashlib.sha256(raw).hexdigest()+'  capture.json\n')
 print(json.dumps({'status':report['status'],'runtimeVersion':report.get('runtimeVersion'),'cases':[{k:c.get(k) for k in ('id','status','error')} for c in report['cases']],'error':report.get('error')}))
 return 0 if report['status']=='CAPTURED' else 1
if __name__=='__main__':sys.exit(main())
