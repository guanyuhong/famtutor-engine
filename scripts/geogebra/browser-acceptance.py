"""Offline Chromium acceptance of the original MountedRenderer.
Build with node scripts/geogebra/build-gallery.mjs first.
This tests the same compiled single-file page via set_content, not HTTP or WebKit.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/geogebra-results';OUT.mkdir(parents=True,exist_ok=True)
HTML=(ROOT/'examples/geogebra/index.html').read_text()
results=[]
def check(name,fn):
    try:
        fn();results.append({'name':name,'status':'PASSED'})
    except Exception as exc:
        results.append({'name':name,'status':'FAILED','error':str(exc)[:1000]})
def require(value,message):
    if not value:raise AssertionError(message)
with sync_playwright() as pw:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=pw.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1400,'height':1000},accept_downloads=True)
    page.set_default_timeout(5000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(HTML,wait_until='load');page.evaluate('window.__FT_READY__')
    for index in range(8):
        def mount(index=index):
            report=page.evaluate('(i)=>__FT_BENCH__.load(i)',index)
            require(report['status']=='ready',str(report))
            require(page.locator('#stage svg').count()==1,'Expected original JSXGraph SVG')
            info=page.evaluate("() => ({schema:__FT_BENCH__.renderer.getDocument().schema,boards:Object.keys(JXG.boards).length})")
            require(info['schema']=='famtutor.math.document.v1','Different runtime protocol')
            require(info['boards']==1,'Old board leaked')
        check('mount-original-renderer-'+str(index),mount)
    def pointer():
        page.evaluate('__FT_BENCH__.load(0)')
        point=page.evaluate("() => {const b=Object.values(JXG.boards)[0],p=b.objectsList.find(o=>o.elType==='point'&&o.name==='A'),r=b.containerObj.getBoundingClientRect();return {x:r.left+p.coords.scrCoords[1],y:r.top+p.coords.scrCoords[2]};}")
        page.mouse.move(point['x'],point['y']);page.mouse.down();page.mouse.move(point['x']+70,point['y']-35,steps=12);page.mouse.up()
        page.wait_for_function('__FT_BENCH__.renderer.getDocument().revision>1')
        values=page.evaluate("() => {const b=__FT_BENCH__,e=b.api.evaluateMathDocument(b.renderer.getDocument());return ['A','B','M'].map(n=>e.entities.get(b.labels[n]).value);}")
        a,b,m=values;require(abs(a['x'])>0.1,'No pointer movement')
        require(abs(m['x']-(a['x']+b['x'])/2)<1e-8,'Midpoint x not updated')
        require(abs(m['y']-(a['y']+b['y'])/2)<1e-8,'Midpoint y not updated')
    check('real-pointer-drag-updates-canonical-document',pointer)
    def reset():
        page.click('#reset');page.wait_for_function('__FT_BENCH__.renderer.getDocument().revision===1')
        require('(0.0000, 0.0000)' in page.locator('#values').inner_text(),'Reset failed')
    check('original-mounted-reset',reset)
    def mutation():
        result=page.evaluate("async()=>{const b=__FT_BENCH__;const r=await b.renderer.dispatch({type:'point.set',target:b.labels.B,payload:{coords:[6,4]}});const e=b.api.evaluateMathDocument(b.renderer.getDocument());return {ok:r.ok,value:e.entities.get(b.labels.M).value};}")
        require(result['ok'],'Original dispatcher rejected edit')
        require(result['value']['x']==3 and result['value']['y']==2,'Calculation failed')
    check('existing-dispatch-point-set',mutation)
    def download():
        with page.expect_download() as info:page.click('#save')
        file=OUT/'browser-export.json';info.value.save_as(file)
        require(json.loads(file.read_text())['schema']=='famtutor.math.document.v1','Export schema mismatch')
    check('native-document-download',download)
    def scalar():
        page.evaluate('__FT_BENCH__.load(7)')
        result=page.evaluate("async()=>{const b=__FT_BENCH__;const r=await b.renderer.dispatch({type:'scalar.set',target:b.labels.a,payload:{value:4}});if(!r.ok)throw Error(JSON.stringify(r.diagnostics));return b.api.evaluateMathDocument(b.renderer.getDocument()).entities.get(b.labels.b).value;}")
        require(abs(result-1.5)<1e-8,'Derived logarithm failed')
    check('existing-dispatch-scalar-set',scalar)
    def reject():
        page.locator('summary').click()
        page.locator('#source').fill('<!DOCTYPE geogebra SYSTEM "file:///etc/passwd"><geogebra><construction/></geogebra>')
        page.click('#run');page.wait_for_function("document.getElementById('status').textContent.includes('DTD')")
        require(page.locator('#stage svg').count()==0,'Stale runnable model after rejection')
    check('unsafe-xml-reject-and-clear',reject)
    check('reload-after-rejection',lambda:page.evaluate('__FT_BENCH__.load(4)'))
    check('no-browser-exceptions',lambda:require(not errors,str(errors)))
    page.locator('summary').click();page.screenshot(path=str(OUT/'workbench-desktop.png'))
    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.set_content(HTML);mobile.evaluate('window.__FT_READY__')
    check('mobile-layout',lambda:require(mobile.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Horizontal overflow'))
    check('mobile-original-svg',lambda:require(mobile.locator('#stage svg').count()==1,'Missing SVG'))
    mobile.screenshot(path=str(OUT/'workbench-mobile.png'),full_page=True)
    browser.close()
report={'schema':'famtutor.geogebra.browser-acceptance.v1','environment':'Chromium single-file set_content; no HTTP/WebKit/device certification','passed':sum(r['status']=='PASSED' for r in results),'failed':sum(r['status']=='FAILED' for r in results),'checks':results}
(OUT/'browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(bool(report['failed']))
