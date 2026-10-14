"""Versioned pointer proofs on the SAME canonical inventory. No official rows added."""
import argparse,copy,csv,hashlib,importlib.util,json,re,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
MAPPING=json.loads((ROOT/'docs/geogebra-runtime/native-api-overrides.v1.json').read_text())
SIGNATURES={'getAllObjectNames([String type])','String getObjectType(String objName)','double getValue(String objName)','double getXcoord(String objName)','double getYcoord(String objName)','double getZcoord(String objName)','boolean isDefined(String objName)','boolean isIndependent(String objName)','void registerUpdateListener(JSFunction function)','Midpoint( <Point>, <Point> )','Segment( <Point>, <Point> )'}
ROWS={e['id']:e['signature'] for e in MAPPING['entries'] if e['signature'] in SIGNATURES}
if set(ROWS.values())!=SIGNATURES:raise ValueError('Existing canonical mappings are incomplete')
def load(name):
 s=importlib.util.spec_from_file_location('pointer_v2_'+name,HERE/(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
contract=load('compare');auditor=load('audit')
def apply(matrix,comparison,audit,sha,tree,hashes):
 if not re.fullmatch('[0-9a-f]{40}',sha) or not re.fullmatch('[0-9a-f]{40}',tree):raise ValueError('Invalid SHA')
 if matrix.get('nativeApiMapping',{}).get('sourceSha')!=sha:raise ValueError('Native evidence is stale')
 if matrix.get('pins')!=MAPPING['pins']:raise ValueError('Fixed source pin drift')
 spec=json.loads((HERE/'protocol.json').read_text());expected=len(spec['cases'])*spec['replicates']
 for r in [comparison,audit]:
  if r.get('sourceSha')!=sha or r.get('sourceTree')!=tree:raise ValueError('Evidence SHA/tree drift')
 if comparison.get('status')!='PASSED_BOUNDED_PROTOCOL_V2' or comparison.get('protocolErrors')!=[] or comparison.get('differences')!=[] or comparison.get('tolerance')!=1e-7 or len(comparison.get('cases',[]))!=expected:raise ValueError('Pointer protocol or parity failed')
 if audit.get('status')!='PASSED_NATIVE_AUDIT_ONLY' or audit.get('errors')!=[] or audit.get('cases')!=len(spec['cases']):raise ValueError('Native audit failed')
 result=copy.deepcopy(matrix);indexed={r['id']:r for r in result['entries']}
 proof={'sourceSha':sha,'sourceTree':tree,'protocol':spec['schema']+'/'+spec['version'],'status':'PASSED_BOUNDED_SCOPE','realDifferential':'PASSED_BOUNDED_SCOPE','inputTiming':'PASSED_DECLARED_WINDOWS','nativeSurfaceAudit':'PASSED_SEPARATE_INSTRUMENTED_REPLAY','files':hashes,'tolerance':1e-7,'scope':'Integer-pixel 2D mouse, actual before/after100ms arrival windows, late first move, short press, roundtrip, and unrelated undefined conic;3 independent repetitions. All ordered callbacks and callback-time dependency values compared.','legacyV1':'FAILED_UNSTABLE_INPUT_PROTOCOL_PRESERVED','sourceBinaryMapping':'UNVERIFIED','remaining':['Exact100ms browser dispatch precision','High input rates and coalescing','Touch/pen, fractional pixels and right-click-disabled mode','Affected mid-drag undefined topology and cancellation','Full client-listener semantics','GeoGebra format interoperability; native snapshots are separate']}
 for id,signature in ROWS.items():
  row=indexed.get(id)
  if row is None or row['signature']!=signature or row.get('nativeApi',{}).get('implementation',{}).get('status')!='PARTIAL':raise ValueError('Canonical row drift')
  row['nativeApi']['pointerProtocolV2']=copy.deepcopy(proof)
 result['nativeApiPointerProtocolV2']={**proof,'rows':list(ROWS),'completeCompatibility':False}
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--matrix',type=Path,required=True);p.add_argument('--evidence',type=Path,required=True);a=p.parse_args();e=a.evidence
 sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip()
 read=lambda name:json.loads((e/name).read_text())
 names=['comparison.json','native.json','reference.json','audit.json','audit-comparison.json','focused.tap','protocol-tests.log'];hashes={n:hashlib.sha256((e/n).read_bytes()).hexdigest() for n in names}
 # Recompute receipts from their complete raw inputs, not a self-asserted green label.
 comparison=contract.compare(read('native.json'),read('reference.json'));audit=auditor.inspect(read('audit.json'))
 if comparison!=read('comparison.json') or audit!=read('audit-comparison.json'):raise ValueError('Receipt differs from raw evidence')
 tap=(e/'focused.tap').read_text()
 if re.search(r'^not ok\b',tap,re.M) or not re.search(r'^# fail 0$',tap,re.M) or not re.search(r'^# skipped 0$',tap,re.M) or len(re.findall(r'^ok \d+ - ',tap,re.M))<42:raise ValueError('Focused native regressions missing/failed')
 out=apply(read_matrix:=json.loads(a.matrix.read_text()),comparison,audit,sha,tree,hashes);a.matrix.write_text(json.dumps(out,indent=2)+'\n')
 with a.matrix.with_suffix('.csv').open('w',newline='') as f:
  w=csv.writer(f);w.writerow(['id','layer','signature','nativeImplementation','nativeRegression','realDifferential','interaction','stateLifecycle','pointerV2','source'])
  for row in out['entries']:
   n=row.get('nativeApi',{});w.writerow([row['id'],row['layer'],row['signature'],n.get('implementation',{}).get('status','UNMAPPED'),*[n.get(k,{}).get('status','NOT_RUN') for k in ['nativeRegression','realDifferential','interaction']],n.get('stateLifecycle',{}).get('status','NOT_RUN'),n.get('pointerProtocolV2',{}).get('status','NOT_RUN'),row['sources'][0]['url']])
 (a.matrix.parent/'SHA256SUMS').write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in sorted(a.matrix.parent.iterdir()) if f.is_file() and f.name!='SHA256SUMS'))
 print(json.dumps(out['nativeApiPointerProtocolV2'],indent=2))
if __name__=='__main__':main()
