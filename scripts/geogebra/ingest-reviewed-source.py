"""Transfer a locally tested, content-addressed source repair; never write a ref.
The exact base and result blobs are mandatory. This does not generate algorithms.
"""
import hashlib,json,os,pathlib,subprocess
repo='guanyuhong/famtutor-engine'
assert os.environ.get('GITHUB_REPOSITORY')==repo
assert os.environ.get('GITHUB_REF')=='refs/heads/codex/geogebra-pr10-v04-20261013'
p=pathlib.Path('packages/math/src/kernel/geometry.ts')
raw=p.read_bytes()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
assert blob(raw)=='788161a0c415235f2b8c434a29d69a87df163c17',blob(raw)
replacements=[
 ('Math.abs(scale) * source.radius\n  );','Math.abs(scale) * source.radius,\n    source.radius === 0 && inversion.radius > 0 // Preserve an admitted point circle, not a singular inversion.\n  );'),
 ('return circle(center, Math.abs(value.radius * transform.factor));','return circle(center, Math.abs(value.radius * transform.factor), value.radius === 0);'),
 ('return circle(center, value.radius);','return circle(center, value.radius, value.radius === 0);')]
text=raw.decode()
for old,new in replacements:
 assert text.count(old)==1
 text=text.replace(old,new)
expected='cf3ba049d47be053b9ed9bd48a64b27b62a826e7'
assert blob(text.encode())==expected
result=json.loads(subprocess.check_output(['gh','api','--method','POST',f'repos/{repo}/git/blobs','--input','-'],input=json.dumps({'content':text,'encoding':'utf-8'}).encode()))
assert result['sha']==expected
out=pathlib.Path('artifacts/reviewed-source');out.mkdir(parents=True,exist_ok=True)
report={'path':str(p),'sourceBlob':blob(raw),'testedResultBlob':expected,'refsWritten':False,'sourceWorkingFileChanged':False}
(out/'ingested-blob.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
