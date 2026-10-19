import copy, hashlib, importlib.util, json, pathlib, sys, unittest
sys.path.insert(0,str(pathlib.Path(__file__).parent))
spec=importlib.util.spec_from_file_location('apib_activation47',pathlib.Path(__file__).with_name('apib-activation47.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CanonicalGateTests(unittest.TestCase):
    def setUp(self):
        self.state={'revision':144,'phase':'MIGRATED_CLEANUP_PENDING','legacyDrainProven':False,
          'activeNormalBlueGreenReleaseId':'release47-alldev-20261019-r2',
          'normalBlueGreenReleases':{'release47-alldev-20261019-r2':{'phase':'COMPLETE'}}}
        self.raw=json.dumps(self.state).encode()
        self.expected={'canonicalSha256':hashlib.sha256(self.raw).hexdigest(),'canonicalRevision':144,'releaseId':'release47-alldev-20261019-r2'}
    def test_complete_successor_does_not_reclassify_history(self):
        before=copy.deepcopy(self.state);r=module.check_canonical(self.raw,self.expected)
        self.assertEqual(r['phase'],'COMPLETE');self.assertEqual(self.state,before)
        self.assertEqual(self.state['phase'],'MIGRATED_CLEANUP_PENDING')
    def test_raw_cas_rejects_new_bytes(self):
        with self.assertRaises(module.require.__globals__['Hold']):module.check_canonical(self.raw+b' ',self.expected)
    def test_revision_rejects_stale_spec(self):
        e={**self.expected,'canonicalRevision':143}
        with self.assertRaises(Exception):module.check_canonical(self.raw,e)
    def test_active_release_must_match(self):
        e={**self.expected,'releaseId':'release47-other'}
        with self.assertRaises(Exception):module.check_canonical(self.raw,e)
    def test_noncomplete_successor_holds(self):
        for phase in ['READY','DRAINING','UNKNOWN','CLEANUP_PENDING','ROLLED_BACK']:
            s=copy.deepcopy(self.state);s['normalBlueGreenReleases'][self.expected['releaseId']]['phase']=phase
            raw=json.dumps(s).encode();e={**self.expected,'canonicalSha256':hashlib.sha256(raw).hexdigest()}
            with self.assertRaises(Exception):module.check_canonical(raw,e)
    def test_root_complete_is_not_successor_proof(self):
        s={**self.state,'phase':'COMPLETE','normalBlueGreenReleases':{}};raw=json.dumps(s).encode()
        e={**self.expected,'canonicalSha256':hashlib.sha256(raw).hexdigest()}
        with self.assertRaises(Exception):module.check_canonical(raw,e)

if __name__=='__main__':unittest.main()
