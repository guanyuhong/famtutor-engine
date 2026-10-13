import importlib.util, pathlib, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('capture',pathlib.Path(__file__).with_name('capture-review.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CaptureIdentity(unittest.TestCase):
 def test_actual_checkout_not_synthetic_event(self):
  with patch.object(m.subprocess,'check_output',side_effect=['a'*40+'\n','b'*40+'\n']), patch.object(m.subprocess,'run') as run, patch.dict(m.os.environ,{'GITHUB_SHA':'c'*40}):
   got=m.capture_identity()
   self.assertEqual(got['captureCommit'],'a'*40);self.assertEqual(got['captureTree'],'b'*40);self.assertEqual(got['workflowEventSha'],'c'*40)
   self.assertIn('diff',run.call_args.args[0]);self.assertTrue(run.call_args.kwargs['check'])
 def test_invalid_identity_fails(self):
  with patch.object(m.subprocess,'check_output',side_effect=['unknown','b'*40]):
   with self.assertRaises(ValueError):m.capture_identity()
 def test_dirty_source_fails(self):
  with patch.object(m.subprocess,'check_output',side_effect=['a'*40,'b'*40]),patch.object(m.subprocess,'run',side_effect=m.subprocess.CalledProcessError(1,'git diff')):
   with self.assertRaises(m.subprocess.CalledProcessError):m.capture_identity()
if __name__=='__main__':unittest.main()
