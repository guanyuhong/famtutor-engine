"""Add SHA-bound state-slice evidence to existing canonical matrix rows only."""
import argparse,copy,hashlib,json,re
from pathlib import Path
ROWS={
 'apps-api:27595d78fe3be7b1da8e':'String getObjectType(String objName)',
 'apps-api:85cedbd6bf40d9a434a1':'double getValue(String objName)',
 'apps-api:043ca80cd402503ac83c':'boolean isDefined(String objName)',
 'apps-api:4bb27cb75dde4776818e':'void setCoords(String objName, double x, double y)',
 'apps-api:997625b71f40c1623647':'void setValue(String objName, double value)',
 'command-overload:0dc2fc93f7fb8a7fd83d':'Center( <Conic> )',
 'command-overload:4bedad6ddb31f094bf74':'Circle( <Point>, <Radius Number> )',
 'command-overload:aafe9218c8b807a72455':'Radius( <Conic> )'}
CASE='api-undefined-snapshot-continuation'
def apply_state(matrix,comparison,native,browser,tap,sha,hashes):
 if not re.fullmatch('[0-9a-f]{40}',sha) or matrix.get('nativeApiMapping',{}).get('sourceSha')!=sha:raise ValueError('Stale matrix')
 for r in [comparison,native,browser]:
  if r.get('sourceSha')!=sha:raise ValueError('Stale evidence')
 if comparison.get('failed')!=0 or comparison.get('runtimeVersion')!='5.4.920.0' or native.get('status')!='CAPTURED':raise ValueError('Failed differential')
 if native.get('programSha256')!=comparison.get('programSha256'):raise ValueError('Program drift')
 if not any(c.get('id')==CASE and c.get('status')=='PASSED' for c in comparison['cases']):raise ValueError('Missing state differential')
 if not any(b.get('case')==CASE and b.get('afterStep')==1 and b.get('status')=='PASSED' for b in native.get('nativeSnapshotBoundaries',[])):raise ValueError('No native saved-state boundary')
 if browser.get('failed')!=0 or browser.get('passed',0)<8 or len(browser.get('checks',[]))<8 or any(c.get('status')!='PASSED' for c in browser['checks']):raise ValueError('Failed browser')
 phases={s['phase']:s for s in browser.get('states',[])}
 for phase in ['valid','undefined','restored-undefined','edited-undefined','recovered']:
  s=phases.get(phase)
  if not s or s.get('document')!=s.get('mountedDocument'):raise ValueError('Missing or divergent state')
  if 'undefined' in phase:
   for n in ['c','H']:
    o=next(o for o in s['objects'] if o['n']==n)
    if o['apiDefined'] or o.get('native') is not None or 'value' in o['evaluated']:raise ValueError('Undefined geometry revived')
 if re.search(r'^not ok\b',tap,re.M) or not re.search(r'^# fail 0$',tap,re.M) or not re.search(r'^# skipped 0$',tap,re.M) or len(re.findall(r'^ok \d+ - ',tap,re.M))<5:raise ValueError('Missing native regressions')
 result=copy.deepcopy(matrix);indexed={r['id']:r for r in result['entries']}
 proof={'sourceSha':sha,'scope':'Controlled circle valid/undefined/recovery; native canonical persistence; reference continuation uses same public operations without native checkpoint',
  'nativeRegression':'PASSED_SAMPLED_SCOPE','realDifferential':'PASSED_SAMPLED_SCOPE','interaction':'PASSED_SAMPLED_SCOPE',
  'case':CASE,'files':hashes,'referencePointerParity':'NOT_RUN','fullXmlInterchange':'UNIMPLEMENTED'}
 for id,signature in ROWS.items():
  row=indexed.get(id)
  if not row or row['signature']!=signature or 'nativeApi' not in row:raise ValueError('Canonical signature drift')
  row['nativeApi']['stateLifecycle']=copy.deepcopy(proof)
 result['nativeApiStateSlice']={**proof,'rows':list(ROWS),'extensions':['getSnapshot','restoreSnapshot'],'extensionsAreOfficialApi':False,'completeCompatibility':False}
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--matrix',type=Path,required=True);p.add_argument('--evidence',type=Path,required=True);a=p.parse_args();e=a.evidence
 paths=['comparison.json','native.json','state/browser.json','state-focused.tap']
 hashes={n:hashlib.sha256((e/n).read_bytes()).hexdigest() for n in paths}
 result=apply_state(json.loads(a.matrix.read_text()),*[json.loads((e/n).read_text()) for n in paths[:3]],(e/paths[3]).read_text(),(e/'commit.txt').read_text().strip(),hashes)
 a.matrix.write_text(json.dumps(result,indent=2)+'\n')
 (a.matrix.parent/'SHA256SUMS').write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in sorted(a.matrix.parent.iterdir()) if f.is_file() and f.name!='SHA256SUMS'))
 print(json.dumps(result['nativeApiStateSlice'],indent=2))
