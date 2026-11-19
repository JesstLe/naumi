import hashlib,importlib.util,json,pathlib,tempfile,unittest
source=pathlib.Path(__file__).with_name('deepseek_hotupdate47.py')
spec=importlib.util.spec_from_file_location('hot',source);hot=importlib.util.module_from_spec(spec);spec.loader.exec_module(hot)
class HandoffTest(unittest.TestCase):
 def test_handoff_preserves_unknown_request_and_proof(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);e=root/'export-APPLY';e.mkdir();bundle=b'fixed bundle';digest=hashlib.sha256(bundle).hexdigest()
   (e/'deepseek-text-hotupdate.cjs').write_bytes(bundle)
   for name in ['PLAN.json','PROBE.json','PROBE_REQUEST.json','APPLY_REQUEST.json']:(e/name).write_text(json.dumps({'id':'original-operation'}))
   selected,names=hot.stage_source('VERIFY',digest,root)
   self.assertEqual(selected,e);self.assertIn('APPLY_REQUEST.json',names);self.assertIn('PROBE_REQUEST.json',names)
   self.assertEqual(json.loads((selected/'APPLY_REQUEST.json').read_text())['id'],'original-operation')
   with self.assertRaises(AssertionError):hot.stage_source('PROBE',digest,root)
   with self.assertRaises(AssertionError):hot.stage_source('APPLY','0'*64,root)
 def test_probe_receipt_can_resume_into_plan_without_new_probe(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);e=root/'export-PROBE';e.mkdir();bundle=b'fixed'
   (e/'deepseek-text-hotupdate.cjs').write_bytes(bundle);(e/'PROBE.json').write_text('{"status":"PASS"}')
   self.assertEqual(hot.stage_source('PLAN',hashlib.sha256(bundle).hexdigest(),root)[0],e)
   with self.assertRaises(AssertionError):hot.stage_source('APPLY',hashlib.sha256(bundle).hexdigest(),root)
if __name__=='__main__':unittest.main()
