"""Pointer proof on the SAME canonical matrix; no new official interface rows."""
import argparse,copy,csv,hashlib,json,re,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
PINS={'manual':'e318ba503db08005e4713e6955d6b9ba5769a36c','integration':'298e983cad5e2f87cab7a330e303487d297960c1','source':'325faee17884c7ced41d360d0f08ae919a38a955'}
ROWS={
 'apps-api:bd551c61f1f9f478de5b':'getAllObjectNames([String type])',
 'apps-api:27595d78fe3be7b1da8e':'String getObjectType(String objName)',
 'apps-api:85cedbd6bf40d9a434a1':'double getValue(String objName)',
 'apps-api:971ff20f73538c9afcdf':'double getXcoord(String objName)',
 'apps-api:1cccbdd3a3ecea75ce1d':'double getYcoord(String objName)',
 'apps-api:45a169d54ba9b2f440a3':'double getZcoord(String objName)',
 'apps-api:043ca80cd402503ac83c':'boolean isDefined(String objName)',
 'apps-api:66f8a70d40b58f3335ff':'boolean isIndependent(String objName)',
 'apps-api:c803d431d932d98a9a13':'void registerUpdateListener(JSFunction function)',
 'command-overload:8edb3cd49ea2f9281957':'Midpoint( <Point>, <Point> )',
 'command-overload:2e6a42e77bfbe6295381':'Segment( <Point>, <Point> )'}
def digest(raw):return hashlib.sha256(raw).hexdigest()
def apply_pointer(matrix,comparison,native,reference,tap,sha,tree,hashes):
 if not re.fullmatch('[0-9a-f]{40}',sha) or not re.fullmatch('[0-9a-f]{40}',tree):raise ValueError('Invalid source identity')
 if matrix.get('nativeApiMapping',{}).get('sourceSha')!=sha:raise ValueError('Stale API matrix')
 for k,v in PINS.items():
  if matrix.get('pins',{}).get(k,{}).get('commit')!=v:raise ValueError('Source pin drift')
 case=HERE/'case.json';recorder=HERE/'recorder.js';spec=json.loads(case.read_text())
 for t,engine in [(native,'famtutor'),(reference,'geogebra')]:
  if t.get('unitTestOnly') or t.get('engine')!=engine or t.get('status')!='CAPTURED' or t.get('sourceSha')!=sha or t.get('sourceTree')!=tree or t.get('trackedDirty') is not False:raise ValueError('Unverified capture identity')
  if t.get('caseSha256')!=digest(case.read_bytes()) or t.get('recorderSha256')!=digest(recorder.read_bytes()) or t.get('spec')!=spec:raise ValueError('Program/observer drift')
  if len(t.get('samples',[]))!=len(spec['actions'])+1 or not t.get('publicEvents') or not t.get('rawDOM'):raise ValueError('Missing pointer traces')
 if reference.get('runtimeVersion')!=spec['requiredRuntime'] or reference.get('selectedCodebase')!=spec['codebase']:raise ValueError('Reference pin drift')
 if comparison.get('sourceSha')!=sha or comparison.get('sourceTree')!=tree or comparison.get('caseSha256')!=native['caseSha256'] or comparison.get('recorderSha256')!=native['recorderSha256']:raise ValueError('Stale comparison')
 if comparison.get('status')!='PASSED' or comparison.get('errors')!=[] or comparison.get('nativeCoherenceErrors')!=0 or comparison.get('tolerance')!=1e-7:raise ValueError('Failed or relaxed comparison')
 if comparison.get('checkedSamples')!=len(native['samples']) or comparison.get('publicEventCounts')!={'native':len(native['publicEvents']),'reference':len(reference['publicEvents'])}:raise ValueError('Incomplete comparison counts')
 if re.search(r'^not ok\b',tap,re.M) or not re.search(r'^# fail 0$',tap,re.M) or not re.search(r'^# skipped 0$',tap,re.M) or len(re.findall(r'^ok \d+ - ',tap,re.M))<28:raise ValueError('Missing pointer regressions')
 result=copy.deepcopy(matrix);indexed={r['id']:r for r in result['entries']}
 proof={'sourceSha':sha,'sourceTree':tree,'case':spec['id'],'caseSha256':native['caseSha256'],'recorderSha256':native['recorderSha256'],
  'scope':'Calibrated integer-pixel mouse free-point A with midpoint M and segment s; every down/move/up and return boundary; ordered public update callbacks and callback-time observations',
  'nativeRegression':'PASSED_SAMPLED_SCOPE','realDifferential':'PASSED_SAMPLED_SCOPE','interaction':'PASSED_SAMPLED_SCOPE',
  'samples':len(native['samples']),'publicEvents':comparison['publicEventCounts'],'files':hashes,'runtime':spec['requiredRuntime'],'sourceBinaryMapping':'UNVERIFIED',
  'platformBoundary':spec['platformBoundary'],'fullClientEventApi':'UNIMPLEMENTED','formatInterchange':'NOT_RUN',
  'gaps':['Fractional-pixel setup retained as failed earlier experiment, not certified by calibrated slice.','Right-click-disabled mode remains FAILED in retained earlier captures. Touch/pen/high input rate, coalescing, constraints, simultaneous mutations, cancellation and mid-drag undefined topology are NOT_RUN.','Snapshots/format interchange and complete public client-listener channel are not pointer acceptance.']}
 for id,signature in ROWS.items():
  row=indexed.get(id)
  if row is None or row['signature']!=signature or row.get('nativeApi',{}).get('implementation',{}).get('status')!='PARTIAL':raise ValueError('Canonical mapping drift: '+id)
  row['nativeApi']['pointerLifecycle']=copy.deepcopy(proof)
 result['nativeApiPointerSlice']={**proof,'rows':list(ROWS),'completeCompatibility':False}
 result['nativeApiMapping']['referencePointerParity']='PASSED_BOUNDED_SCOPE'
 result['nativeApiMapping']['referencePointerScope']=proof['scope']
 return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--matrix',type=Path,required=True);p.add_argument('--evidence',type=Path,required=True);a=p.parse_args();e=a.evidence
 root=HERE.parents[2]
 sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
 tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip()
 if (e/'commit.txt').read_text().strip()!=sha or (e/'tree.txt').read_text().strip()!=tree:raise ValueError('Evidence checkout mismatch')
 names=['comparison.json','native.json','reference.json','focused.tap','warning.json','warning-comparison.json']
 hashes={n:digest((e/n).read_bytes()) for n in names}
 matrix=json.loads(a.matrix.read_text());read=lambda n:json.loads((e/n).read_text());tap=(e/'focused.tap').read_text()
 native,reference=read('native.json'),read('reference.json')
 if native.get('nativeWarningOnly') is not False:raise ValueError('Primary trace has a different diagnostic profile')
 out=apply_pointer(matrix,read('comparison.json'),native,reference,tap,sha,tree,hashes)
 warning=read('warning.json')
 if warning.get('nativeWarningOnly') is not True:raise ValueError('Warning-only native regression missing')
 # Reuse the same strict receipt checks for a native-only warning assertion.
 # It is a host diagnostic regression, not a GeoGebra assertion API claim.
 validated=apply_pointer(matrix,read('warning-comparison.json'),warning,reference,tap,sha,tree,hashes)
 warning_proof={'status':'PASSED_NATIVE_DIAGNOSTIC_SCOPE','sourceSha':sha,'samples':len(warning['samples']),'files':{k:hashes[k] for k in ['warning.json','warning-comparison.json']}}
 for row in out['entries']:
  proof=row.get('nativeApi',{}).get('pointerLifecycle')
  if proof is not None:proof['warningOnlyNativeRegression']=warning_proof
 out['nativeApiPointerSlice']['warningOnlyNativeRegression']=warning_proof
 a.matrix.write_text(json.dumps(out,indent=2)+'\n')
 with a.matrix.with_suffix('.csv').open('w',newline='') as f:
  writer=csv.writer(f);writer.writerow(['id','layer','signature','nativeImplementation','nativeRegression','realDifferential','interaction','pointerLifecycle','source'])
  for row in out['entries']:
   n=row.get('nativeApi',{});writer.writerow([row['id'],row['layer'],row['signature'],n.get('implementation',{}).get('status','UNMAPPED'),*[n.get(k,{}).get('status','NOT_RUN') for k in ['nativeRegression','realDifferential','interaction']],n.get('pointerLifecycle',{}).get('interaction','NOT_RUN'),row['sources'][0]['url']])
 (a.matrix.parent/'SHA256SUMS').write_text(''.join(digest(f.read_bytes())+'  '+f.name+'\n' for f in sorted(a.matrix.parent.iterdir()) if f.is_file() and f.name!='SHA256SUMS'))
 print(json.dumps(out['nativeApiPointerSlice'],indent=2))
if __name__=='__main__':main()
