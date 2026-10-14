"""Contract negative controls; fixtures are not live reference evidence."""
import copy,importlib.util,json,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('contract',HERE/'compare.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
SPEC=json.loads((HERE/'protocol.json').read_text())
def fixture():
 scenario=SPEC['cases'][1];state={'names':SPEC['labels'],'objects':{n:{'exists':True,'type':'segment' if n=='s' else 'point','defined':True,'independent':n in ['A','B'],'value':{'type':'number','value':0},'x':{'type':'number','value':1},'y':{'type':'number','value':2},'z':{'type':'number','value':0}} for n in SPEC['labels']}}
 trace={'rawDOM':[],'publicEvents':[],'platformEvents':[],'samples':[],'observations':[],'errors':[]};seq=0
 for i,(step,kind,t,x) in enumerate([('initial',None,0,1),('press','pointerdown',0,1),('first','pointermove',170,2),('release','pointerup',270,2),('quiescent',None,420,2)]):
  current=copy.deepcopy(state);current['objects']['A']['x']['value']=x
  if kind:
   seq+=1;trace['rawDOM'].append({'seq':seq,'step':step,'perfMs':1000+t,'wallMs':10000+t,'eventTimeStamp':1000+t,'type':kind,'sincePressMs':t,'sincePressWallMs':t,'trusted':True,'pointerType':'mouse','buttons':0 if kind=='pointerup' else 1})
  trace['samples'].append({'step':step,'state':current,'publicEventCount':0,'sequenceAfter':seq});trace['observations'].append({'step':step,'kind':'sample','startMs':1000+t,'endMs':1001+t})
 return {'id':scenario['id'],'replicate':0,'status':'CAPTURED','constructionReturn':True,'program':SPEC['program'],'pageErrors':[],'trace':trace}
class Contract(unittest.TestCase):
 def codes(self,row):return {e['code'] for e in c.validate_case(row,SPEC)}
 def test_own_negative_control_fixture(self):self.assertEqual(self.codes(fixture()),set())
 def test_missing_intermediate_state(self):
  r=fixture();r['trace']['samples'].pop(2);self.assertIn('SAMPLE_SEQUENCE',self.codes(r))
 def test_missing_input(self):
  r=fixture();r['trace']['rawDOM'].pop(1);self.assertIn('INPUT_DELIVERY_COUNT',self.codes(r))
 def test_duplicate_input(self):
  r=fixture();r['trace']['rawDOM'].append(r['trace']['rawDOM'][1]);self.assertIn('INPUT_DELIVERY_COUNT',self.codes(r))
 def test_untrusted_input(self):
  r=fixture();r['trace']['rawDOM'][1]['trusted']=False;self.assertIn('UNTRUSTED_OR_WRONG_INPUT',self.codes(r))
 def test_elapsed_time_is_not_same_as_frame_count(self):
  r=fixture();r['trace']['rawDOM'][1]['sincePressMs']=70;self.assertIn('DELIVERY_WINDOW',self.codes(r))
 def test_single_side_observation_overrun(self):
  r=fixture();r['trace']['observations'][1]['endMs']=1090;self.assertIn('OBSERVATION_BUDGET',self.codes(r))
 def test_nonfinite_clock(self):
  r=fixture();r['trace']['rawDOM'][1]['perfMs']=float('nan');self.assertIn('INPUT_CLOCK',self.codes(r))
 def test_callback_fields_cannot_be_dropped(self):
  r=fixture();r['trace']['publicEvents'].append({'seq':20,'step':'first','perfMs':1170,'wallMs':10170,'kind':'update','args':['A']});self.assertIn('PUBLIC_EVENT_FIELDS',self.codes(r))
 def test_equal_noop_states_fail(self):
  r=fixture()
  for s in r['trace']['samples']:s['state']['objects']['A']['x']['value']=1
  self.assertIn('INPUT_INTENT_STATE',self.codes(r))
 def test_getter_type_not_numeric_coercion(self):self.assertTrue(c.diff({'type':'number','value':1},{'type':'boolean','value':True}))
 def test_ordered_callbacks_are_not_sorted(self):self.assertTrue(c.diff([{'label':'A'},{'label':'M'}],[{'label':'M'},{'label':'A'}]))
 def test_numeric_tolerance_is_unchanged(self):
  self.assertEqual(c.TOLERANCE,1e-7);self.assertTrue(c.diff(1.00001,1));self.assertFalse(c.diff(1+1e-9,1))
 def test_audit_cannot_certify_reference_parity(self):
  r=c.compare({'scope':'NATIVE_INSTRUMENTED_AUDIT'},{})
  self.assertNotEqual(r['status'],'PASSED_BOUNDED_PROTOCOL_V2');self.assertTrue(r['protocolErrors'])
class AuditContract(unittest.TestCase):
 def test_empty_audit_is_not_evidence(self):
  s=importlib.util.spec_from_file_location('audit',HERE/'audit.py');a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
  self.assertEqual(a.inspect({'scope':'NATIVE_INSTRUMENTED_AUDIT','engine':'famtutor','cases':[]})['status'],'FAILED')

if __name__=='__main__':unittest.main()
