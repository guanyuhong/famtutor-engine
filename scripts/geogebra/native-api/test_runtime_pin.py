"""The selected runtime must be set before injection; no floating fallback."""
import ast,unittest
from pathlib import Path
class RuntimePinTest(unittest.TestCase):
 def test_injection_uses_locked_codebase(self):
  code=Path(__file__).with_name('capture-reference.py').read_text();tree=ast.parse(code)
  snippets=[n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str) and 'new GGBApplet' in n.value]
  self.assertEqual(len(snippets),1);js=snippets[0]
  self.assertIn("setHTML5Codebase('https://www.geogebra.org/apps/5.4.920.0/web3d/')",js)
  self.assertLess(js.index('setHTML5Codebase('),js.index('app.inject('))
  self.assertIn("if report['runtimeVersion']!=report['requiredRuntime']",code)
if __name__=='__main__':unittest.main()
