"""Exact source-byte transport only; no refs/worktree mutation or acceptance claim.
The source was reconstructed and hash-verified locally. Pure timing regression
passed locally; full engine/live verification must run on the subsequent commit.
"""
import hashlib,json,os,pathlib,subprocess
repo='guanyuhong/famtutor-engine'
assert os.environ.get('GITHUB_REPOSITORY')==repo
assert os.environ.get('GITHUB_REF')=='refs/heads/codex/geogebra-pointer-v03'
p=pathlib.Path('packages/math/src/render/mounted-renderer.ts');raw=p.read_bytes()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
before='f222604f1eeacc64c730de7f464cab2fba4570b2';after='bde2e868a1bde217ae0416c540bf3a5e96d82735'
assert blob(raw) in (before,after),blob(raw)
if blob(raw)==before:
 lines=raw.decode().splitlines(keepends=True)
 edits=[
  (27,27,'import { GEOGEBRA_DRAGGING_DELAY_MS, pointerActivationReady } from "./pointer-activation.js";\n'),
  (62,63,'  /** Apply the fixed-reference press-to-drag delay. Never skip a move by ordinal. */\n'),
  (180,181,'  private pointerSession?: { target: string; pressedAtMs: number; activated: boolean; changed: boolean };\n'),
  (425,426,'              this.pointerSession = {target:event.target, pressedAtMs:Date.now(), activated:!this.deferPointerActivation, changed:false};\n'),
  (475,477,'    // The reference rejects moves by elapsed time after press, not move count.\n    // Releasing before any accepted move must not replay a suppressed coordinate.\n    if (!session.activated && ended) {\n      restoreVisual();\n      this.pointerSession = undefined;\n      this.emit({type:"interaction.committed",target,payload:{revision:this.document.revision,actionType:"point.set",continuousPointer:true,stateChanged:false,gestureChanged:false}});\n      return;\n    }\n    if (!session.activated) {\n      const nowMs = Date.now();\n      if (!pointerActivationReady(session.pressedAtMs, nowMs, GEOGEBRA_DRAGGING_DELAY_MS)) {\n        restoreVisual();\n        this.emit({type:"interaction.started",target,payload:{phase:"activation-delay",elapsedMs:nowMs-session.pressedAtMs,delayMs:GEOGEBRA_DRAGGING_DELAY_MS}});\n        return;\n      }\n'),
  (478,481,'      // Process this same eligible move. No deferred coordinate or synthetic event.\n')]
 for a,b,s in reversed(edits):lines[a:b]=[s]
 raw=''.join(lines).encode()
assert blob(raw)==after,blob(raw)
result=json.loads(subprocess.check_output(['gh','api','--method','POST',f'repos/{repo}/git/blobs','--input','-'],input=json.dumps({'content':raw.decode(),'encoding':'utf-8'}).encode()))
assert result['sha']==after
out=pathlib.Path('artifacts/pointer-review-source');out.mkdir(parents=True,exist_ok=True)
(out/'receipt.json').write_text(json.dumps({'path':str(p),'before':before,'after':after,'refsWritten':False,'testAcceptance':False},indent=2)+'\n')
