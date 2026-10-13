import copy,importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('coverage',Path(__file__).with_name('coverage.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CoverageTests(unittest.TestCase):
 def setUp(self):
  self.sha='a'*40
  self.matrix={'pins':{'source':{'commit':'pin'}},'entries':[{'id':'one','signature':'sig','gaps':['unverified']},{'id':'untouched','signature':'other','implementation':{'status':'UNMAPPED'}}]}
  self.mapping={'pins':self.matrix['pins'],'runtimeVersion':'5.4.920.0','entries':[{'id':'one','signature':'sig','scope':'bounded','implementation':{'status':'PARTIAL'},'nativeTests':['test-one'],'realCases':['case-one'],'browserChecks':['pointer-one'],'gaps':['Not full parity']}]}
  self.reports={'comparison':{'sourceSha':self.sha,'runtimeVersion':'5.4.920.0','programSha256':'program','passed':1,'failed':0,'cases':[{'id':'case-one','status':'PASSED'}]},'browser':{'sourceSha':self.sha,'passed':1,'failed':0,'checks':[{'name':'pointer-one','status':'PASSED'}]},'native':{'sourceSha':self.sha,'programSha256':'program','status':'CAPTURED'},'focused':'ok 1 - test-one\n# fail 0\n','hashes':{n:'hash' for n in ['focused.tap','comparison.json','browser.json']}}
 def apply(self):return m.apply_native_coverage(self.matrix,self.mapping,self.reports,self.sha)
 def test_overlay_preserves_all_unmapped_rows(self):
  result=self.apply();self.assertEqual(result['entries'][1],self.matrix['entries'][1]);self.assertEqual(result['entries'][0]['nativeApi']['implementation']['status'],'PARTIAL');self.assertNotIn('nativeApi',self.matrix['entries'][0])
 def test_stale_evidence_rejected(self):
  self.reports['browser']['sourceSha']='b'*40
  with self.assertRaises(ValueError):self.apply()
 def test_failed_differential_rejected(self):
  self.reports['comparison']['failed']=1
  with self.assertRaises(ValueError):self.apply()
 def test_missing_tests_rejected(self):
  self.reports['focused']='# fail 0\n'
  with self.assertRaises(ValueError):self.apply()
 def test_wrong_pins_rejected(self):
  self.mapping['pins']={'source':{'commit':'other'}}
  with self.assertRaises(ValueError):self.apply()
 def test_signature_drift_rejected(self):
  self.mapping['entries'][0]['signature']='other'
  with self.assertRaises(ValueError):self.apply()
 def test_missing_browser_check_rejected(self):
  self.reports['browser']['checks']=[]
  with self.assertRaises(ValueError):self.apply()
 def test_version_mismatch_rejected(self):
  self.reports['comparison']['runtimeVersion']='5.4.999.0'
  with self.assertRaises(ValueError):self.apply()
if __name__=='__main__':unittest.main()
