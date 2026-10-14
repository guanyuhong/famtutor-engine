import copy,importlib.util,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('coverage_v2',HERE/'coverage.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
SHA='a'*40;TREE='b'*40
class Coverage(unittest.TestCase):
 def fixture(self):
  m={'pins':c.MAPPING['pins'],'nativeApiMapping':{'sourceSha':SHA,'referencePointerParity':'NOT_RUN'},'entries':[{'id':i,'signature':sig,'nativeApi':{'implementation':{'status':'PARTIAL'},'priorProof':'preserved'}} for i,sig in c.ROWS.items()]+[{'id':'unmapped','signature':'other'}]}
  comparison={'sourceSha':SHA,'sourceTree':TREE,'status':'PASSED_BOUNDED_PROTOCOL_V2','protocolErrors':[],'differences':[],'tolerance':1e-7,'cases':[{}]*12}
  audit={'sourceSha':SHA,'sourceTree':TREE,'status':'PASSED_NATIVE_AUDIT_ONLY','errors':[],'cases':4}
  return m,comparison,audit
 def test_preserves_prior_evidence_and_unmapped_rows(self):
  m,p,a=self.fixture();before=copy.deepcopy(m);r=c.apply(m,p,a,SHA,TREE,{})
  self.assertEqual(m,before);self.assertEqual(r['entries'][-1],before['entries'][-1]);self.assertEqual(len(r['entries']),len(m['entries']))
  for row in r['entries'][:-1]:self.assertEqual(row['nativeApi']['priorProof'],'preserved');self.assertEqual(row['nativeApi']['implementation']['status'],'PARTIAL')
 def test_summary_uses_current_bounded_proof_without_promoting_old_scope(self):
  m,p,a=self.fixture();m['nativeApiStateSlice']={'referencePointerParity':'NOT_RUN'}
  r=c.apply(m,p,a,SHA,TREE,{})
  self.assertEqual(r['nativeApiMapping']['referencePointerParity'],'PASSED_BOUNDED_PROTOCOL_V2')
  self.assertEqual(r['nativeApiStateSlice']['referencePointerParity'],'NOT_RUN')
 def test_csv_preserves_prior_state_interaction_evidence(self):
  row={'id':'known','layer':'apps-api','signature':'known','sources':[{'url':'source'}],'nativeApi':{'stateLifecycle':{'interaction':'PASSED_SAMPLED_SCOPE'}}}
  self.assertEqual(c.csv_row(row)[7],'PASSED_SAMPLED_SCOPE')
  self.assertEqual(c.csv_row(row)[8],'NOT_RUN')
 def test_failed_input_protocol_cannot_mark_pass(self):
  m,p,a=self.fixture();p['status']='INPUT_PROTOCOL_FAILED'
  with self.assertRaises(ValueError):c.apply(m,p,a,SHA,TREE,{})
 def test_incomplete_repetitions_cannot_mark_pass(self):
  m,p,a=self.fixture();p['cases'].pop()
  with self.assertRaises(ValueError):c.apply(m,p,a,SHA,TREE,{})
 def test_old_sha_cannot_mark_pass(self):
  m,p,a=self.fixture();a['sourceSha']='c'*40
  with self.assertRaises(ValueError):c.apply(m,p,a,SHA,TREE,{})
 def test_failed_audit_cannot_mark_pass(self):
  m,p,a=self.fixture();a['errors']=[{'code':'MISMATCH'}]
  with self.assertRaises(ValueError):c.apply(m,p,a,SHA,TREE,{})
 def test_empty_audit_cannot_mark_pass(self):
  m,p,a=self.fixture();a['cases']=0
  with self.assertRaises(ValueError):c.apply(m,p,a,SHA,TREE,{})
 def test_signature_drift_cannot_mark_pass(self):
  m,p,a=self.fixture();m['entries'][0]['signature']='invented'
  with self.assertRaises(ValueError):c.apply(m,p,a,SHA,TREE,{})
 def test_relaxed_tolerance_cannot_mark_pass(self):
  m,p,a=self.fixture();p['tolerance']=1e-3
  with self.assertRaises(ValueError):c.apply(m,p,a,SHA,TREE,{})
if __name__=='__main__':unittest.main()
