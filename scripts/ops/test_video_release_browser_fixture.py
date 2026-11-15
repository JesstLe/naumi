import copy,json,pathlib,tempfile,unittest
from types import SimpleNamespace
from unittest.mock import Mock,patch
from video_release_gateway_fixture import VideoReleaseGateway

class BrowserFixture(unittest.TestCase):
 def owner(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  owner=object.__new__(VideoReleaseGateway);owner.args=SimpleNamespace(browser_port=15693,evidence=pathlib.Path(self.temp.name));owner.browser_seed=None;owner.browser_observations=[];owner.old_commit='a'*40;owner.old_version='1';owner.web='new';owner.tx=Mock();owner.tx.inspect.return_value={'Config':{'Env':['SOURCE_COMMIT='+'b'*40,'BUILD_VERSION=2']}};owner.check=Mock();owner.old_web_name='fixture-old';return owner
 def ack(self,owner,mutate=lambda value:value):
  folder=owner.args.evidence/'browser';value=json.loads((folder/'request.json').read_text());reply=mutate({'ok':True,'phase':value['phase'],'token':value['token']});(folder/('reply-'+value['token']+'.json')).write_text(json.dumps(reply))
 def test_disabled_path_is_noop(self):
  owner=self.owner();owner.args.browser_port=None;owner.browser_phase('new');self.assertFalse((owner.args.evidence/'browser').exists());owner.check.assert_not_called()
 def test_initial_phase_and_identity_required(self):
  owner=self.owner()
  with self.assertRaises(AssertionError):owner.browser_phase('new')
  with self.assertRaises(AssertionError):owner.browser_phase('new',{'cookie':'fixture'})
  owner.check.assert_not_called()
 def test_atomic_request_ack_and_zero_generation(self):
  owner=self.owner();observe=Mock(return_value={'tasks':2,'ledger':1})
  with patch('video_release_gateway_fixture.time.sleep',side_effect=lambda _:self.ack(owner)):owner.browser_phase('old',{'cookie':'fixture'},observe)
  self.assertEqual(observe.call_count,2);owner.check.assert_called_once_with('actual-browser-survives-old',True);self.assertEqual(list((owner.args.evidence/'browser').glob('*.tmp')),[])
 def test_failed_wrong_token_wrong_phase_and_nonbool_never_pass(self):
  for change in [{'ok':False},{'token':'wrong'},{'phase':'new'},{'ok':1},{'noReload':False}]:
   owner=self.owner()
   with patch('video_release_gateway_fixture.time.sleep',side_effect=lambda _,o=owner,c=change:self.ack(o,lambda value:{**value,**c})):
    with self.assertRaises(AssertionError):owner.browser_phase('old',{'cookie':'fixture'},lambda:{'tasks':0})
   owner.check.assert_not_called()
 def test_explicit_audit_records_upgrade_without_claiming_strict_pass(self):
  owner=self.owner();owner.args.browser_observe_upgrades=True
  with patch('video_release_gateway_fixture.time.sleep',side_effect=lambda _:self.ack(owner,lambda value:{**value,'noReload':False})):owner.browser_phase('old',{'cookie':'fixture'},lambda:{'tasks':0})
  self.assertIs(owner.browser_observations[0]['noReload'],False);owner.check.assert_called_once_with('actual-browser-observed-old',True)
 def test_generation_increment_never_zero(self):
  owner=self.owner();observe=Mock(side_effect=[{'tasks':0},{'tasks':1}])
  with patch('video_release_gateway_fixture.time.sleep',side_effect=lambda _:self.ack(owner)):
   with self.assertRaises(AssertionError):owner.browser_phase('old',{'cookie':'fixture'},observe)
  owner.check.assert_not_called()
 def test_host_port_preserved_only_for_explicit_local_browser(self):
  owner=self.owner();self.assertIn(b'proxy_set_header Host $http_host;',owner.render('old'));owner.args.browser_port=None;self.assertIn(b'proxy_set_header Host $host;',owner.render('old'))

if __name__=='__main__':unittest.main()
