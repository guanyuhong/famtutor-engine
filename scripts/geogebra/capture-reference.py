"""Capture our own programs using the real, isolated GeoGebra browser runtime.
No generated third-party source is committed. The single author material is optional,
kept transiently for compatibility inspection, and never grants reuse permissions.
A failed load is BLOCKED, never a passing comparison.
"""
import argparse, base64, hashlib, json, pathlib, time
from playwright.sync_api import sync_playwright

CASES = [
    ('midpoint', 'A=(0,0)\nB=(4,2)\nM=Midpoint(A,B)\ns=Segment(A,B)', ['A','B','M','s']),
    ('bisector', 'A=(-3,0)\nB=(3,0)\nl=PerpendicularBisector(A,B)\nP=Point(l)\nd=Distance(P,A)\ne=Distance(P,B)', ['A','B','P','d','e']),
    ('angle-bisector', 'A=(4,0)\nB=(0,0)\nC=(0,4)\nl=AngleBisector(A,B,C)\nP=Point(l)', ['A','B','C','P']),
    ('circle-intersection', 'O=(0,0)\nA=(-5,0)\nB=(5,0)\nl=Line(A,B)\nc=Circle(O,3)\nX=Intersect(l,c,1)\nY=Intersect(l,c,2)', ['X','Y']),
    ('polygon-rotation', 'A=(0,0)\nB=(4,0)\nC=(1,3)\np=Polygon(A,B,C)\nq=Rotate(p,60°,A)\nd=Area(q)', ['A','B','C','d']),
    ('ellipse', 'A=(-2,0)\nB=(2,0)\nC=(0,3)\ne=Ellipse(A,B,C)\nD=(-6,0)\nE=(6,0)\nl=Line(D,E)\nX=Intersect(l,e,1)', ['A','B','C','X']),
    ('parabola', 'F=(0,2)\nA=(-5,-2)\nB=(5,-2)\nl=Line(A,B)\np=Parabola(F,l)', ['F','A','B']),
    ('exponent-log', 'a=2\nb=log(a,8)\nf(x)=a^x\nP=(3,b)', ['a','b','P'])
]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='artifacts/reference')
    parser.add_argument('--author-material',action='store_true')
    args=parser.parse_args(); out=pathlib.Path(args.output); out.mkdir(parents=True,exist_ok=True)
    report={'schema':'famtutor.geogebra.reference-capture.v1','status':'BLOCKED','cases':[], 'author':{'status':'NOT_REQUESTED'},'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(accept_downloads=False)
            page=context.new_page()
            page.set_content('<!doctype html><meta charset="utf-8"><div id="ggb"></div>')
            page.add_script_tag(url='https://www.geogebra.org/apps/deployggb.js')
            page.evaluate('''() => { window.ready=false; window.app=new GGBApplet({appName:'classic',width:900,height:650,language:'en',showToolBar:false,showAlgebraInput:false,appletOnLoad:api=>{window.ggb=api;window.ready=true;}},true); app.inject('ggb'); }''')
            page.wait_for_function('window.ready',timeout=90000)
            report['runtimeVersion']=page.evaluate('ggb.getVersion()')
            for name,commands,labels in CASES:
                result={'id':name,'origin':'original-program-executed-by-geogebra','commands':commands,'status':'BLOCKED'}
                try:
                    page.evaluate('ggb.newConstruction()')
                    ok=page.evaluate('(commands)=>ggb.evalCommand(commands)',commands)
                    if not ok: raise RuntimeError('GeoGebra rejected a program')
                    xml=page.evaluate('ggb.getXML()'); (out/f'{name}.xml').write_text(xml)
                    state=page.evaluate('''labels => Object.fromEntries(labels.map(label => [label,{type:ggb.getObjectType(label),defined:ggb.isDefined(label),x:ggb.getXcoord(label),y:ggb.getYcoord(label),value:ggb.getValue(label)}]))''',labels)
                    archive=page.evaluate('ggb.getBase64()')
                    if isinstance(archive,str): (out/f'{name}.ggb').write_bytes(base64.b64decode(archive))
                    result.update(status='CAPTURED',xmlSha256=hashlib.sha256(xml.encode()).hexdigest(),expected=state)
                    result['updated']=[]
                    if page.evaluate('ggb.exists("A") && ggb.isIndependent("A")'):
                        page.evaluate('ggb.setCoords("A", -2, 1)')
                        updated=page.evaluate('''labels => Object.fromEntries(labels.map(label => [label,{type:ggb.getObjectType(label),defined:ggb.isDefined(label),x:ggb.getXcoord(label),y:ggb.getYcoord(label),value:ggb.getValue(label)}]))''',labels)
                        result['updated'].append({'setCoords':{'label':'A','coords':[-2,1]},'expected':updated})
                except Exception as exc: result['error']=str(exc)[:1200]
                report['cases'].append(result)
            report['status']='CAPTURED' if all(c['status']=='CAPTURED' for c in report['cases']) else 'PARTIAL'
            if args.author_material:
                try:
                    api=context.request.get('https://www.geogebra.org/material/download/format/file/id/udmtcdnh',timeout=30000)
                    data=api.body()
                    if not api.ok or not data.startswith(b'PK'): raise RuntimeError(f'No public .ggb bytes: HTTP {api.status}')
                    (out/'author-udmtcdnh.ggb').write_bytes(data)
                    report['author']={'status':'FETCHED_NOT_EXECUTED','materialId':'udmtcdnh','source':'https://www.geogebra.org/m/udmtcdnh','sha256':hashlib.sha256(data).hexdigest(),'license':'UNREVIEWED','redistribution':'not authorized by this capture'}
                except Exception as exc: report['author']={'status':'BLOCKED','error':str(exc)[:1200]}
            browser.close()
    except Exception as exc: report['error']=str(exc)[:1800]
    (out/'capture.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
