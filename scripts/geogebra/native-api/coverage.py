"""Overlay scoped native evidence into the existing full fixed-source matrix.
No second progress database; all unmatched rows and predecessor evidence remain.
"""
import argparse,copy,csv,hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def fingerprint(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def apply_native_coverage(matrix,mapping,reports,source_sha):
 result=copy.deepcopy(matrix)
 if not re.fullmatch(r'[0-9a-f]{40}',source_sha):raise ValueError('Invalid tested source SHA')
 if matrix['pins']!=mapping['pins']:raise ValueError('Official source pin drift')
 comparison=reports['comparison'];browser=reports['browser'];native=reports['native']
 for report in [comparison,browser]:
  if report.get('sourceSha')!=source_sha or report.get('failed')!=0 or report.get('passed',0)<=0:raise ValueError('Failed or stale evidence')
 if comparison.get('runtimeVersion')!=mapping['runtimeVersion']:raise ValueError('Reference version mismatch')
 if native.get('sourceSha')!=source_sha or native.get('status')!='CAPTURED' or native.get('programSha256')!=comparison.get('programSha256'):raise ValueError('Native trace identity mismatch')
 if re.search(r'^not ok\b',reports['focused'],re.M) or not re.search(r'^# fail 0$',reports['focused'],re.M):raise ValueError('Focused native tests failed or missing')
 tests=set(re.findall(r'^ok \d+ - (.+)$',reports['focused'],re.M))
 passed_cases={c['id'] for c in comparison['cases'] if c['status']=='PASSED'}
 passed_browser={c['name'] for c in browser['checks'] if c['status']=='PASSED'}
 indexed={r['id']:r for r in result['entries']}
 for m in mapping['entries']:
  row=indexed.get(m['id'])
  if row is None or row['signature']!=m['signature']:raise ValueError('Overload identity drift: '+m['id'])
  evidence={'scope':m['scope'],'implementation':m.get('implementation',mapping.get('defaultImplementation')),'gaps':m.get('gaps',[m['scope'],*mapping.get('globalGaps',[])])}
  for kind,required,available,filename in [
   ('nativeRegression',m['nativeTests'],tests,'focused.tap'),
   ('realDifferential',m['realCases'],passed_cases,'comparison.json'),
   ('interaction',m['browserChecks'],passed_browser,'browser.json')]:
   if any(name not in available for name in required):raise ValueError('Missing required '+kind+' check: '+m['id'])
   evidence[kind]={'status':'PASSED_SAMPLED_SCOPE' if required else 'NOT_RUN','checks':required,
    'evidence':[{'sourceSha':source_sha,'path':filename,'sha256':reports['hashes'][filename]}] if required else []}
  # Separate native entrypoint evidence from existing importer evidence on the
  # SAME canonical overload row, never relabel an importer pass as API parity.
  row['nativeApi']=evidence
 result['nativeApiMapping']={'sourceSha':source_sha,'completeCompatibility':False,'referencePointerParity':'NOT_RUN','mappingRows':len(mapping['entries'])}
 return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--matrix',type=Path,required=True);parser.add_argument('--evidence',type=Path,required=True);args=parser.parse_args()
 folder=args.evidence;source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 if (folder/'commit.txt').read_text().strip()!=source:raise ValueError('Evidence directory belongs to another checkout')
 reports={k:json.loads((folder/(k+'.json')).read_text()) for k in ['comparison','browser','native']}
 reports['focused']=(folder/'focused.tap').read_text();reports['hashes']={n:fingerprint(folder/n) for n in ['comparison.json','browser.json','native.json','focused.tap']}
 mapping=json.loads((ROOT/'docs/geogebra-runtime/native-api-overrides.v1.json').read_text())
 result=apply_native_coverage(json.loads(args.matrix.read_text()),mapping,reports,source)
 args.matrix.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 with args.matrix.with_suffix('.csv').open('w',newline='') as f:
  writer=csv.writer(f);writer.writerow(['id','layer','signature','nativeAPIImplementation','nativeRegression','realDifferential','interaction','source'])
  for r in result['entries']:
   e=r.get('nativeApi',{});writer.writerow([r['id'],r['layer'],r['signature'],e.get('implementation',{}).get('status','UNMAPPED'),*[e.get(k,{}).get('status','NOT_RUN') for k in ['nativeRegression','realDifferential','interaction']],r['sources'][0]['url']])
 (args.matrix.parent/'SHA256SUMS').write_text(''.join(fingerprint(p)+'  '+p.name+'\n' for p in sorted(args.matrix.parent.iterdir()) if p.is_file() and p.name!='SHA256SUMS'))
 print(json.dumps(result['nativeApiMapping']))
if __name__=='__main__':main()
