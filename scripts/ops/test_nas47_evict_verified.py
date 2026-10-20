import json,pathlib,tempfile,unittest,hashlib,os
from types import SimpleNamespace
from unittest.mock import patch
import nas47_evict_verified as m
from release47_host import Hold

class Eviction(unittest.TestCase):
 def test_exact_verified_only_changed_and_unknown_retained_rollback_copy(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=pathlib.Path(tmp);media=root/'media';media.mkdir();proof=root/'final-media-proof';proof.mkdir()
   files={'a':b'verified-original','b':b'changed-original','unknown':b'not-in-manifest'}
   for k,v in files.items():(media/k).write_bytes(v)
   rows=[]
   for k in ['a','b']:
    s=(media/k).stat();rows.append(dict(key=k,size=s.st_size,ino=s.st_ino,mtimeMs=s.st_mtime_ns/1e6,sha256=hashlib.sha256(files[k]).hexdigest()))
   (media/'b').write_bytes(b'changed-after-readback')
   (proof/'verified-files.jsonl').write_text('\n'.join(json.dumps(r)for r in rows))
   (proof/'SUMMARY.json').write_text(json.dumps(dict(phase='ALL_BYTES_VERIFIED',files=2,errors=0,missing=0,mismatch=0,changed=0)))
   canonical=root/'current.json';canonical.write_text(json.dumps(dict(activeNormalBlueGreenReleaseId='release47-fixture',normalBlueGreenReleases={'release47-fixture':{'phase':'COMPLETE'}})))
   backup=root/'fixture.dump';backup.write_bytes(b'fixture-only')
   (root/'backup-readable.json').write_text(json.dumps(dict(path=str(backup),sha256=m.file_sha(backup))))
   (root/'nas-compatible-rollback-test.json').write_text(json.dumps(dict(passed=True,priorNasCompatibleRead=True,verificationDataCleaned=True)))
   class Tx:
    folder=root
    def inspect(self,id):return {'State':{'Running':False}}
    def pin(self,id):return{'Config':{'Env':['STORAGE_DRIVER=s3','MEDIA_REMOTE_ACCESS=proxy','MEDIA_PRIVATE=1','S3_BUCKET=fixture']}}
    def save(self,name,value):(root/name).write_text(json.dumps(value))
   o=SimpleNamespace(tx=Tx(),cfg=dict(evidenceRoot=str(root),mediaSource=str(media),releaseId='release47-fixture'),web={'id':'oldweb'},worker={'id':'oldworker'},newweb={'id':'newweb'})
   with patch.object(m,'MEDIA_ROOT',media),patch.object(m,'CANONICAL',canonical):
    result=m.execute(o);self.assertEqual(result['deleted'],1);self.assertEqual(result['retainedChanged'],1)
    self.assertFalse((media/'a').exists());self.assertEqual((media/'b').read_bytes(),b'changed-after-readback');self.assertTrue((media/'unknown').exists())
    with self.assertRaises(Hold):m.execute(o)
    # Actual restore of the removed verification fixture from its exact copy;
    # production rollback never restores the database or replays a task.
    (media/'a').write_bytes(files['a']);self.assertEqual(hashlib.sha256((media/'a').read_bytes()).hexdigest(),rows[0]['sha256'])
    self.assertTrue(backup.exists());self.assertFalse(result['databaseDeleted']);self.assertFalse(result['volumesDeleted'])
if __name__=='__main__':unittest.main()
