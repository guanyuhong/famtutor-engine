import copy,importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('state_coverage',Path(__file__).with_name('state-coverage.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class EvidenceGuards(unittest.TestCase):
 def fixture(self):
  sha='a'*40
  matrix={'nativeApiMapping':{'sourceSha':sha},'entries':[{'id':k,'signature':v,'nativeApi':{}} for k,v in m.ROWS.items()]}
  comparison={'sourceSha':sha,'failed':0,'runtimeVersion':'5.4.920.0','programSha256':'test-only','cases':[{'id':m.CASE,'status':'PASSED'}]}
  native={'sourceSha':sha,'status':'CAPTURED','programSha256':'test-only','nativeSnapshotBoundaries':[{'case':m.CASE,'afterStep':1,'status':'PASSED'}]}
  state={'document':{'revision':1},'mountedDocument':{'revision':1},'objects':[{'n':n,'apiDefined':False,'native':None,'evaluated':{}} for n in ['c','H']]}
  browser={'sourceSha':sha,'failed':0,'passed':8,'checks':[{'status':'PASSED'} for _ in range(8)],'states':[dict(copy.deepcopy(state),phase=p) for p in ['valid','undefined','restored-undefined','edited-undefined','recovered']]}
  tap='\n'.join('ok '+str(i+1)+' - guard fixture '+str(i) for i in range(6))+'\n# fail 0\n# skipped 0\n'
  return [matrix,comparison,native,browser,tap,sha,{}]
 def test_accepts_scoped_evidence_without_dropping_rows(self):
  args=self.fixture();r=m.apply_state(*args);self.assertEqual(len(r['entries']),len(args[0]['entries']));self.assertFalse(r['nativeApiStateSlice']['completeCompatibility'])
 def test_rejects_stale_sha(self):
  a=self.fixture();a[1]['sourceSha']='b'*40
  with self.assertRaises(ValueError):m.apply_state(*a)
 def test_requires_native_snapshot_boundary(self):
  a=self.fixture();a[2]['nativeSnapshotBoundaries']=[]
  with self.assertRaises(ValueError):m.apply_state(*a)
 def test_rejects_failed_browser(self):
  a=self.fixture();a[3]['failed']=1
  with self.assertRaises(ValueError):m.apply_state(*a)
 def test_rejects_stale_mounted_document(self):
  a=self.fixture();a[3]['states'][1]['mountedDocument']['revision']=0
  with self.assertRaises(ValueError):m.apply_state(*a)
 def test_rejects_revived_geometry(self):
  a=self.fixture();a[3]['states'][1]['objects'][0]['evaluated']['value']={'kind':'circle2'}
  with self.assertRaises(ValueError):m.apply_state(*a)
 def test_rejects_missing_native_tests(self):
  a=self.fixture();a[4]=''
  with self.assertRaises(ValueError):m.apply_state(*a)
 def test_rejects_signature_drift(self):
  a=self.fixture();a[0]['entries'][0]['signature']='wrong'
  with self.assertRaises(ValueError):m.apply_state(*a)
if __name__=='__main__':unittest.main()
