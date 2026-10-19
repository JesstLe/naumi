import json,hashlib,pathlib,tempfile,unittest,importlib.util,sys
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).parent))
spec=importlib.util.spec_from_file_location('activationhost',pathlib.Path(__file__).with_name('apib-activation47.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from release47_host import public_identity,Hold
class OuterTransaction(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);bundle=self.root/'bundle';bundle.mkdir();self.outer=self.root/'transaction';self.outer.mkdir();self.mode='PLAN'
  raw=json.dumps({'revision':144,'activeNormalBlueGreenReleaseId':'release47-r2','normalBlueGreenReleases':{'release47-r2':{'phase':'COMPLETE'}}}).encode();self.canon=self.root/'canonical.json';self.canon.write_bytes(raw)
  files={'apib-activation.cjs':b'isolated-test','PLAN.json':json.dumps({'operationId':'4ccac68c-f764-4add-967b-1fafbbb40381'}).encode()}
  for name,b in files.items():(bundle/name).write_bytes(b)
  (bundle/'BUNDLE_HASHES.json').write_text(json.dumps({k:hashlib.sha256(v).hexdigest() for k,v in files.items()}))
  self.row={'Id':'1'*64,'Name':'/naumi47-web','Image':'sha256:'+'2'*64,'State':{'Running':True,'StartedAt':'fixed'},'HostConfig':{'RestartPolicy':{'Name':'no'}},'Config':{'Env':['SOURCE_COMMIT='+'3'*40,'BUILD_VERSION=1792383873']}}
  self.body=dict(target='47.105.59.142',mode='PLAN',bundleRoot=str(bundle),evidenceRoot=str(self.outer/'PLAN'),web=public_identity(self.row),sourceCommit='3'*40,buildVersion='1792383873',releaseId='release47-r2',canonicalRevision=144,canonicalSha256=hashlib.sha256(raw).hexdigest())
  self.spec=self.root/'spec.json';self.calls=[];self.saves=[]
  self.tx=SimpleNamespace(target='47.105.59.142',stack=object(),lock_fds=[1,2,3],folder=self.outer,inspect=lambda id:self.row,pin=lambda web:self.assertEqual(web,public_identity(self.row)),save=lambda *a:self.saves.append(a),run=self.command)
 def tearDown(self):self.tmp.cleanup()
 def command(self,args,**kw):
  self.calls.append(args);self.assertFalse(any(a in args for a in ['restart','create','stop','rm']))
  if any('echo EXISTS' in a for a in args):return b'ABSENT\n'
  if 'node' in args:return b'{"mode":"PLAN","fixture":true}'
  return b''
 def runfixture(self):
  self.spec.write_text(json.dumps(self.body));return m.run(SimpleNamespace(spec=str(self.spec)),existing_tx=self.tx)
 def test_outer_lock_never_reacquired_or_released(self):
  stack=self.tx.stack
  with patch.object(m,'CANON',self.canon),patch.object(m,'HostTransaction',side_effect=AssertionError('Nested lock forbidden')):self.runfixture()
  self.assertIs(self.tx.stack,stack);self.assertEqual(self.tx.lock_fds,[1,2,3]);self.assertTrue(self.saves)
  ownership=[a for a in self.calls if 'chown' in a];self.assertEqual(len(ownership),2);self.assertTrue(all(a[-1].startswith('/tmp/apib-activation-4ccac68c-') for a in ownership));self.assertFalse(any('-R' in a for a in ownership))
 def test_missing_outer_locks_blocks(self):
  self.tx.lock_fds=[1,2]
  with self.assertRaisesRegex(Hold,'THREE_LOCKS'):self.runfixture()
 def test_outer_not_entered_blocks(self):
  self.tx.stack=None
  with self.assertRaises(Hold):self.runfixture()
 def test_evidence_outside_outer_blocks(self):
  self.body['evidenceRoot']=str(self.root/'outside')
  with self.assertRaisesRegex(Hold,'OUTSIDE_TRANSACTION'):self.runfixture()
 def test_stale_canonical_blocks_before_docker(self):
  self.body['canonicalRevision']=143
  with patch.object(m,'CANON',self.canon),self.assertRaises(Hold):self.runfixture()
  self.assertEqual(self.calls,[])
 def test_existing_request_never_overwritten(self):
  self.tx.run=lambda argv,**kw:b'EXISTS' if any('echo EXISTS' in a for a in argv) else b'corrupt-immutable-file'
  with patch.object(m,'CANON',self.canon),self.assertRaisesRegex(Hold,'EXISTING_IMMUTABLE_BUNDLE_CHANGED'):self.runfixture()
if __name__=='__main__':unittest.main()
