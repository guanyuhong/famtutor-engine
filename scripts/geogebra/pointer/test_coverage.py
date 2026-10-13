"""Proof-validator unit tests. Synthetic receipts, NEVER real oracle evidence."""
import copy,importlib.util,json,unittest
from pathlib import Path
p=Path(__file__).with_name('coverage.py');spec=importlib.util.spec_from_file_location('pointer_coverage',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CoverageTests(unittest.TestCase):
 def fixture(self):
  sha='a'*40;tree='b'*40;case=json.loads((m.HERE/'case.json').read_text());ch=m.digest((m.HERE/'case.json').read_bytes());rh=m.digest((m.HERE/'recorder.js').read_bytes())
  matrix={'entries':[{'id':k,'signature':v,'nativeApi':{'implementation':{'status':'PARTIAL'},'priorEvidence':'retained'}} for k,v in m.ROWS.items()]+[{'id':'unmapped','implementation':{'status':'UNMAPPED'}}], 'nativeApiMapping':{'sourceSha':sha},'pins':{k:{'commit':v} for k,v in m.PINS.items()}}
  n={'sourceSha':sha,'sourceTree':tree,'trackedDirty':False,'engine':'famtutor','status':'CAPTURED','spec':case,'caseSha256':ch,'recorderSha256':rh,'samples':[{}]*(len(case['actions'])+1),'publicEvents':[{}],'rawDOM':[{}]};r={**copy.deepcopy(n),'engine':'geogebra','runtimeVersion':case['requiredRuntime'],'selectedCodebase':case['codebase']}
  c={'sourceSha':sha,'sourceTree':tree,'caseSha256':ch,'recorderSha256':rh,'status':'PASSED','errors':[],'nativeCoherenceErrors':0,'tolerance':1e-7,'checkedSamples':len(n['samples']),'publicEventCounts':{'native':1,'reference':1}}
  tap='\n'.join(f'ok {i} - synthetic guard {i}' for i in range(1,29))+'\n# fail 0\n# skipped 0\n'
  return [matrix,c,n,r,tap,sha,tree,{}]
 def test_positive_preserves_all_rows_prior_proofs_and_partial(self):
  args=self.fixture();out=m.apply_pointer(*args);self.assertEqual(len(out['entries']),len(args[0]['entries']));self.assertEqual(out['entries'][0]['nativeApi']['priorEvidence'],'retained');self.assertEqual(out['entries'][-1]['implementation']['status'],'UNMAPPED');self.assertFalse(out['nativeApiPointerSlice']['completeCompatibility'])
 def test_stale_sha(self):
  a=self.fixture();a[2]['sourceSha']='c'*40
  with self.assertRaises(ValueError):m.apply_pointer(*a)
 def test_program_and_pin_drift(self):
  for i,k in [(2,'caseSha256'),(3,'runtimeVersion')]:
   a=self.fixture();a[i][k]='wrong'
   with self.assertRaises(ValueError):m.apply_pointer(*a)
 def test_failed_or_relaxed_comparison(self):
  for k,v in [('status','FAILED'),('errors',[{}]),('tolerance',1e-4),('nativeCoherenceErrors',1)]:
   a=self.fixture();a[1][k]=v
   with self.assertRaises(ValueError):m.apply_pointer(*a)
 def test_missing_pointer_or_synthetic_oracle(self):
  for k,v in [('publicEvents',[]),('samples',[]),('unitTestOnly',True)]:
   a=self.fixture();a[3][k]=v
   with self.assertRaises(ValueError):m.apply_pointer(*a)
 def test_native_failures(self):
  a=self.fixture();a[4]+='not ok 26 - failed\n'
  with self.assertRaises(ValueError):m.apply_pointer(*a)
 def test_signature_drift(self):
  a=self.fixture();a[0]['entries'][0]['signature']='invented'
  with self.assertRaises(ValueError):m.apply_pointer(*a)
 def test_source_pin_drift(self):
  a=self.fixture();a[0]['pins']['source']['commit']='d'*40
  with self.assertRaises(ValueError):m.apply_pointer(*a)
if __name__=='__main__':unittest.main()
