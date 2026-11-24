import importlib.util,pathlib,tempfile,unittest,json,stat
spec=importlib.util.spec_from_file_location('archive',pathlib.Path(__file__).with_name('central_backup_archive.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class ArchiveChecks(unittest.TestCase):
 def setUp(self):
  self.x={'bytes':9,'sha256':'a'*64};self.h={'ContentLength':9,'Metadata':{'sha256':'a'*64},'ETag':'immutable'};self.p={'fullNasReadbackVerified':True,'fullGet':{'bytes':9,'sha256':'a'*64,'etag':'immutable'},'anonymousHeadStatus':403}
 def test_acknowledged_full_readback_accepts(self):a.eligible_to_release(self.x,self.p,self.h)
 def test_etag_alone_is_not_sha(self):
  with self.assertRaises(a.Hold):a.eligible_to_release(self.x,{**self.p,'fullNasReadbackVerified':False},self.h)
 def test_wrong_full_get_sha_retains_local(self):
  with self.assertRaises(a.Hold):a.eligible_to_release(self.x,{**self.p,'fullGet':{**self.p['fullGet'],'sha256':'b'*64}},self.h)
 def test_object_changed_after_readback_retains_local(self):
  with self.assertRaises(a.Hold):a.eligible_to_release(self.x,self.p,{**self.h,'ETag':'changed'})
 def test_head_metadata_or_length_mismatch_retains_local(self):
  for h in [{**self.h,'ContentLength':10},{**self.h,'Metadata':{'sha256':'b'*64}}]:
   with self.subTest(h=h),self.assertRaises(a.Hold):a.eligible_to_release(self.x,self.p,h)
 def test_anonymous_access_retains_local(self):
  with self.assertRaises(a.Hold):a.eligible_to_release(self.x,{**self.p,'anonymousHeadStatus':200},self.h)
 def test_foreign_release_or_traversal_rejected(self):
  for r in ['other-project','../database','release47-central-rendering-20261124-r1']:
   with self.subTest(r=r),self.assertRaises(a.Hold):a.source_path(r)
 def test_atomic_receipt_private_and_reopened(self):
  with tempfile.TemporaryDirectory(prefix='archive-fixture-') as root:
   p=pathlib.Path(root)/'receipt.json';a.atomic(p,{'scope':'fixture'});self.assertEqual(a.read(p),{'scope':'fixture'});self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o600)
if __name__=='__main__':unittest.main()
