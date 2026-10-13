"""Capture original bounded programs in the real GeoGebra app. No expected values are synthesized.
Only our programs/XML are distributable fixtures; author materials use a separate research check.
"""
import argparse
import hashlib
import json
import os
import pathlib
import time
from playwright.sync_api import sync_playwright

OBSERVE = """labels => Object.fromEntries(labels.map(label => {
 const type=ggb.getObjectType(label), defined=ggb.isDefined(label);
 const result={type,defined};
 if(defined && ['point','vector'].includes(type)) {
   result.x=ggb.getXcoord(label); result.y=ggb.getYcoord(label);
 } else if(defined && ['numeric','angle','segment','polygon','boolean'].includes(type)) {
   const value=ggb.getValue(label); result.value=Number.isFinite(value)?value:null;
 }
 return [label,result];
}))"""

def coord(label, x, y):
    return {'setCoords': {'label': label, 'coords': [x, y]}}

def scalar(label, value):
    return {'setValue': {'label': label, 'value': value}}

# Each path is initialized at a nonzero parameter, then moved, dragged, and moved again.
CASES = [
 {'id':'transport-line','commands':'A=(1,2)\nB=(5,2)\np=Line(A,B)\nP=Point(p)\ns=Segment(A,P)', 'position':[3,2], 'labels':['A','B','P','s'], 'updates':[coord('B',9,6),coord('P',7,5),coord('A',-1,0),coord('B',-5,4)]},
 {'id':'transport-segment','commands':'A=(1,2)\nB=(5,2)\np=Segment(A,B)\nP=Point(p)', 'position':[2,2], 'labels':['A','B','P'], 'updates':[coord('B',9,6),coord('P',99,99),coord('A',-1,0),coord('B',-5,4)]},
 {'id':'transport-ray','commands':'A=(1,2)\nB=(5,2)\np=Ray(A,B)\nP=Point(p)', 'position':[7,2], 'labels':['A','B','P'], 'updates':[coord('B',9,6),coord('P',-99,-99),coord('A',-1,0),coord('B',-5,4)]},
 {'id':'transport-circle','commands':'O=(1,2)\nr=3\np=Circle(O,r)\nP=Point(p)', 'position':[3,4], 'labels':['O','r','P'], 'updates':[scalar('r',5),coord('O',-2,1),coord('P',-3,-4),scalar('r',2)]},
 {'id':'transport-perpendicular-bisector','commands':'A=(-3,0)\nB=(3,0)\np=PerpendicularBisector(A,B)\nP=Point(p)\nd=Distance(P,A)\ne=Distance(P,B)', 'position':[0,3], 'labels':['A','B','P','d','e'], 'updates':[coord('A',-2,1),coord('B',6,-1),coord('P',-1,4),coord('A',1,3)]},
 {'id':'transport-perpendicular','commands':'A=(0,0)\nB=(4,0)\nC=(1,2)\nl=Line(A,B)\np=PerpendicularLine(C,l)\nP=Point(p)', 'position':[1,4], 'labels':['A','B','C','P'], 'updates':[coord('B',8,4),coord('C',-2,1),coord('P',-3,5),coord('B',-4,3)]},
 {'id':'transport-parallel','commands':'A=(0,0)\nB=(4,0)\nC=(1,2)\nl=Line(A,B)\np=Line(C,l)\nP=Point(p)', 'position':[3,2], 'labels':['A','B','C','P'], 'updates':[coord('B',8,4),coord('C',-2,1),coord('P',4,6),coord('B',-4,3)]},
 {'id':'transport-angle-bisector','commands':'A=(4,0)\nB=(0,0)\nC=(0,4)\np=AngleBisector(A,B,C)\nP=Point(p)', 'position':[2,2], 'labels':['A','B','C','P'], 'updates':[coord('A',4,1),coord('B',-1,0),coord('P',3,5),coord('C',-1,6)]},
 {'id':'transport-circle-boundary','commands':'O=(0,0)\nr=3\np=Circle(O,r)\nP=Point(p)', 'position':[2,2], 'labels':['O','r','P'], 'updates':[scalar('r',0),scalar('r',3),scalar('r',-1),scalar('r',2)]}
]

def apply(page, update):
    if 'setCoords' in update:
        page.evaluate('(a)=>ggb.setCoords(a.label,...a.coords)', update['setCoords'])
    else:
        page.evaluate('(a)=>ggb.setValue(a.label,a.value)', update['setValue'])

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='artifacts/path-reference.json')
    args=parser.parse_args()
    out=pathlib.Path(args.output); out.parent.mkdir(parents=True,exist_ok=True)
    report={'schema':'famtutor.geogebra.reference-capture.v1','status':'BLOCKED','cases':[],
            'captureWorkflowRun':os.environ.get('GITHUB_RUN_ID'),
            'captureCommit':os.environ.get('GITHUB_SHA'),
            'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
            'origin':'original-program-executed-by-geogebra'}
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            page=browser.new_page()
            page.set_content('<!doctype html><meta charset="utf-8"><div id="ggb"></div>')
            page.add_script_tag(url='https://www.geogebra.org/apps/deployggb.js')
            page.evaluate("""() => {window.ready=false;window.app=new GGBApplet({appName:'classic',width:900,height:650,language:'en',showToolBar:false,showAlgebraInput:false,appletOnLoad:api=>{window.ggb=api;window.ready=true;}},true);app.inject('ggb');}""")
            page.wait_for_function('window.ready',timeout=90000)
            report['runtimeVersion']=page.evaluate('ggb.getVersion()')
            for spec in CASES:
                item={'id':spec['id'],'commands':spec['commands'],'status':'BLOCKED','updated':[]}
                try:
                    page.evaluate('ggb.newConstruction()')
                    if not page.evaluate('(x)=>ggb.evalCommand(x)',spec['commands']):
                        raise RuntimeError('GeoGebra rejected program')
                    apply(page,coord('P',*spec['position']))
                    item['setup']=[coord('P',*spec['position'])]
                    item['xml']=page.evaluate('ggb.getXML()')
                    item['xmlSha256']=hashlib.sha256(item['xml'].encode()).hexdigest()
                    item['expected']=page.evaluate(OBSERVE,spec['labels'])
                    for update in spec['updates']:
                        apply(page,update)
                        item['updated'].append({**update,'expected':page.evaluate(OBSERVE,spec['labels'])})
                    item['status']='CAPTURED'
                except Exception as error:
                    item['error']=str(error)[:1500]
                report['cases'].append(item)
            report['status']='CAPTURED' if len(report['cases'])==len(CASES) and all(x['status']=='CAPTURED' for x in report['cases']) else 'BLOCKED'
            browser.close()
    except Exception as error:
        report['error']=str(error)[:1800]
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False))
    print(json.dumps({k:v for k,v in report.items() if k!='cases'},ensure_ascii=False))
    for item in report['cases']:
        print(json.dumps({k:v for k,v in item.items() if k not in ['xml','commands']},ensure_ascii=False))
    if report['status']!='CAPTURED':raise SystemExit(2)

if __name__=='__main__':main()
