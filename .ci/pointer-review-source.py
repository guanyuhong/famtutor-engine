"""Exact reviewed source-byte transfer only. No ref or worktree mutation."""
import hashlib,json,os,pathlib,subprocess
repo='guanyuhong/famtutor-engine';assert os.environ.get('GITHUB_REPOSITORY')==repo;assert os.environ.get('GITHUB_REF')=='refs/heads/codex/geogebra-pointer-v03'
p=pathlib.Path('packages/math/src/geogebra/native-api.ts');raw=p.read_bytes()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
before='253f8bbdab57f171332089acc2ee8cb577478821';after='f6fdc48c70fca13779b18ae1d1c647f5792df801'
assert blob(raw) in (before,after)
if blob(raw)==before:
 lines=raw.decode().splitlines(keepends=True)
 edits=[
 (40,40,' private notificationPriorState: ReadonlyMap<string,RuntimeEntity>|undefined;\n private notificationCompleted: Set<string>|undefined;\n'),
 (183,184,'   const sourceState=this.notificationState\n    ? (this.notificationCompleted?.has(r.id)?this.notificationState:this.notificationPriorState!)\n    : evaluateMathDocument(this.document).entities;\n   const points=inputs.map(i=>\'ref\' in i?sourceState.get(i.ref)?.value:undefined);\n'),
 (285,286,'    const prior=evaluateMathDocument(this.document).entities;\n    const state=new Map(prior);\n    this.notificationPriorState=prior;\n    this.notificationCompleted=new Set();\n'),
 (295,296,'      for(const output of outputs){state.set(output.id,output);this.notificationCompleted!.add(output.id);}\n'),
 (299,300,'    } finally {this.notificationState=undefined;this.notificationPriorState=undefined;this.notificationCompleted=undefined;}\n')]
 for a,b,s in reversed(edits):lines[a:b]=[s]
 raw=''.join(lines).encode()
assert blob(raw)==after,blob(raw)
result=json.loads(subprocess.check_output(['gh','api','--method','POST',f'repos/{repo}/git/blobs','--input','-'],input=json.dumps({'content':raw.decode(),'encoding':'utf-8'}).encode()));assert result['sha']==after
out=pathlib.Path('artifacts/pointer-review-source');out.mkdir(parents=True,exist_ok=True);(out/'receipt.json').write_text(json.dumps({'path':str(p),'before':before,'after':after,'refsWritten':False,'testAcceptance':False},indent=2)+'\n')
