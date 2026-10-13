"""Transfer locally tested source bytes; never write a branch or claim acceptance.
Each exact base/result hash is checked. Final source changes must subsequently be
committed and run through the complete final-SHA validation gate (Issue #13).
"""
import hashlib,json,os,pathlib,subprocess
repo='guanyuhong/famtutor-engine'
assert os.environ.get('GITHUB_REPOSITORY')==repo
assert os.environ.get('GITHUB_REF')=='refs/heads/codex/geogebra-pr10-v04-20261013'
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
center_case='''      case "point.circle_center": {
        const current = () => {
          const source = valueOf(refs[0]!);
          if (!isCircle(source)) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", "point.circle_center requires a circle2 input.");
          return source.center;
        };
        native = board.create("point", [() => current().x, () => current().y], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
'''
updates=[
 ('packages/math/src/kernel/geometry.ts','788161a0c415235f2b8c434a29d69a87df163c17','cf3ba049d47be053b9ed9bd48a64b27b62a826e7',[
  ('Math.abs(scale) * source.radius\n  );','Math.abs(scale) * source.radius,\n    source.radius === 0 && inversion.radius > 0 // Preserve an admitted point circle, not a singular inversion.\n  );'),
  ('return circle(center, Math.abs(value.radius * transform.factor));','return circle(center, Math.abs(value.radius * transform.factor), value.radius === 0);'),
  ('return circle(center, value.radius);','return circle(center, value.radius, value.radius === 0);')]),
 ('packages/math/src/render/jsxgraph.ts','f91de7106a7b35f2b00e25a2f2fb303c004cba60','dc03f0459ea95f131cba72609421cbbabc9949fe',[
  ('      case "point.midpoint": {',center_case+'      case "point.midpoint": {')])
]
reports=[]
for name,before,after,replacements in updates:
 raw=pathlib.Path(name).read_bytes();actual=blob(raw)
 assert actual in (before,after),(name,actual)
 text=raw.decode()
 if actual==before:
  for old,new in replacements:
   assert text.count(old)==1,(name,old)
   text=text.replace(old,new)
 assert blob(text.encode())==after,(name,blob(text.encode()))
 result=json.loads(subprocess.check_output(['gh','api','--method','POST',f'repos/{repo}/git/blobs','--input','-'],input=json.dumps({'content':text,'encoding':'utf-8'}).encode()))
 assert result['sha']==after
 reports.append({'path':name,'sourceBlob':actual,'testedResultBlob':after})
out=pathlib.Path('artifacts/reviewed-source');out.mkdir(parents=True,exist_ok=True)
report={'changes':reports,'refsWritten':False,'sourceWorkingFilesChanged':False,'acceptance':'NOT_A_FINAL_SHA_TEST_RESULT'}
(out/'ingested-blob.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
