import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('matrix',pathlib.Path(__file__).with_name('build-compatibility-matrix.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MatrixExtraction(unittest.TestCase):
 def test_command_overloads_not_names(self):
  rows=m.command_signatures('Point( <Object> )::\n  text\nPoint( <Point>, <Vector> )::\n  more\n')
  self.assertEqual([r[1] for r in rows],['Point( <Object> )','Point( <Point>, <Vector> )'])
 def test_wrapped_signature(self):
  rows=m.command_signatures('Curve( <Expression>,\n <Variable>, <Start>, <End> )::\n  description')
  self.assertEqual(len(rows),1);self.assertEqual(rows[0][2],1)
 def test_examples_are_not_definitions(self):
  self.assertEqual(m.command_signatures('Point(A)\n\nEXAMPLE\n'),[])
 def test_concatenated_api_overloads(self):
  rows=m.api_signatures('== State\n|===\n|Method Signature |Since |Description\n|void setCoords(String name, double x, double y)void setCoords(String name, double x, double y, double z) |3.05.0\n|description\n|===\n')
  self.assertEqual(len(rows),2);self.assertEqual(rows[1][3],'3.05.0')
 def test_evidence_defaults_are_not_passes(self):
  r=m.inventory_row('command-overload','Point','Point( <Object> )',{})
  self.assertEqual(r['implementation']['status'],'UNMAPPED')
  self.assertTrue(all(r[k]['status']=='NOT_RUN' for k in ['nativeRegression','realDifferential','interaction']))
 def test_ids_different_for_overloads(self):
  self.assertNotEqual(m.inventory_row('command-overload','P','P(a)',{})['id'],m.inventory_row('command-overload','P','P(a,b)',{})['id'])
 def test_missing_return_type_is_still_a_method(self):
  rows=m.api_signatures('|===\n|Method Signature |Since |Description\n|getEditorState() |5.0 (HTML5) |A function name like foo() in prose is not an API.\n|===')
  self.assertEqual([r[0] for r in rows],['getEditorState'])
 def test_wrapped_api_signature_and_no_description_false_positive(self):
  rows=m.api_signatures('|===\n|Method Signature |Since |Description\n|void setListValue(String name,\n int i, double value) |5.0 |Calling function(x) is possible.\n|===')
  self.assertEqual(len(rows),1);self.assertEqual(rows[0][0],'setListValue')
 def test_malformed_api_table_is_not_silently_truncated(self):
  with self.assertRaises(ValueError):m.api_signatures('|===\n|Method Signature |Since |Description\n|getEditorState() |5.0\n|===')
 def test_coverage_does_not_promote_unmatched_rows(self):
  r=m.inventory_row('command-overload','Point','Point(a)',{})
  m.apply_coverage([r],{'entries':[]})
  self.assertEqual(r['implementation']['status'],'UNMAPPED')
 def test_coverage_rejects_signature_drift(self):
  r=m.inventory_row('command-overload','P','P(a)',{})
  with self.assertRaises(ValueError):m.apply_coverage([r],{'entries':[{'id':r['id'],'signature':'P(b)'}]})
 def test_implementation_mapping_is_not_a_differential_pass(self):
  r=m.inventory_row('command-overload','P','P(a)',{})
  mapping={'id':r['id'],'signature':r['signature'],'implementation':{'status':'PARTIAL'},'gaps':['unverified'],'testFiles':['test.mjs'],'realDifferential':['case-a']}
  m.apply_coverage([r],{'entries':[mapping]})
  self.assertEqual(r['realDifferential']['status'],'NOT_RUN')
  self.assertEqual(r['implementation']['status'],'PARTIAL')
if __name__=='__main__':unittest.main()
