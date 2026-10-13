"""Checked locally tested source-byte transport. No refs/worktree mutations.
Only original-repository source blobs are written. This is NOT test acceptance.
"""
import hashlib,json,os,pathlib,subprocess
REPO='guanyuhong/famtutor-engine'
assert os.environ.get('GITHUB_REPOSITORY')==REPO
assert os.environ.get('GITHUB_REF')=='refs/heads/codex/geogebra-pointer-v03'
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
manifest=json.loads(pathlib.Path('.ci/pointer-source.json').read_text())
allowed={'packages/math/src/kernel/evaluate.ts','packages/math/src/render/mounted-renderer.ts','packages/math/src/geogebra/native-api.ts'}
assert {s['path'] for s in manifest}==allowed
reports=[]
for spec in manifest:
 raw=pathlib.Path(spec['path']).read_bytes();before=blob(raw)
 assert before in (spec['before'],spec['after']),(spec['path'],before)
 if before==spec['before']:
  lines=raw.decode().splitlines(keepends=True)
  for start,end,text in reversed(spec['edits']):lines[start:end]=[text]
  raw=''.join(lines).encode()
 assert blob(raw)==spec['after'],(spec['path'],blob(raw))
 payload=json.dumps({'content':raw.decode(),'encoding':'utf-8'}).encode()
 result=json.loads(subprocess.check_output(['gh','api','--method','POST',f'repos/{REPO}/git/blobs','--input','-'],input=payload))
 assert result['sha']==spec['after']
 reports.append({'path':spec['path'],'before':before,'after':result['sha']})
out=pathlib.Path('artifacts/pointer-source');out.mkdir(parents=True,exist_ok=True)
(out/'transport.json').write_text(json.dumps({'changes':reports,'refsWritten':False,'worktreeModified':False,'testAcceptance':False},indent=2)+'\n')
