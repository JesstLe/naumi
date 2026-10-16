import copy
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import release_maintenance_session as m
from test_release_maintenance_session import plan, NOW

class LayeredInventoryTests(unittest.TestCase):
    def setUp(self):
        self.plan=plan('103.30.76.93')
        self.plan['authorization'].update(mode='immediate-HK-only',userImmediateAcknowledgement=m.maintenance.IMMEDIATE_HK_ACK,notBefore=m.maintenance.IMMEDIATE_HK_NOT_BEFORE)
        self.pins=[]
        self.tx=SimpleNamespace(target='103.30.76.93',run=lambda *a,**k:None,pin=lambda item:self.pins.append(item))
        self.adapter=m.LiveAdapter(self.tx,self.plan)
        self.result={'hostIdentityMatches':True,'dockerInventory':{'complete':True,'stable':True},'nginx':{'stable':True,'fullDumpSha256':'a'*64},'containers':copy.deepcopy(self.plan['baseline']),'systemdCoverage':'partial','errors':[]}
        self.allowed=[{'source':'systemd-unit-list','code':'SERVICE_LIMIT_EXCEEDED'},{'source':'systemd-unit-cat','code':'OBSERVATION_UNAVAILABLE'},{'source':'systemd-unit-show','code':'OBSERVATION_UNAVAILABLE'}]
        self.authorize=m.maintenance.authorize
    def collect(self):
        with patch.object(m,'collect_inventory',return_value=copy.deepcopy(self.result)),patch.object(self.adapter,'private_save',return_value=lambda *a:None),patch.object(m.maintenance,'authorize',side_effect=lambda spec:self.authorize(spec,now=NOW)):
            return self.adapter.inventory('fixture-inventory')
    def test_103_allowed_errors_retained_not_reference_complete_or_drain(self):
        self.result['errors']=copy.deepcopy(self.allowed);got=self.collect()
        self.assertEqual(got['errors'],self.allowed);self.assertEqual(got['baselineCoverage']['retainedSystemdErrors'],self.allowed)
        self.assertTrue(got['baselineCoverage']['coreComplete']);self.assertEqual(got['baselineCoverage']['systemdReferenceCoverage'],'partial')
        self.assertFalse(got['baselineCoverage']['retirementEvidence']);self.assertFalse(got['baselineCoverage']['taskDrainEvidence']);self.assertEqual(self.pins,self.plan['baseline'])
    def test_clean_47_still_checks_core_and_each_pin(self):
        self.plan['target']='47.105.59.142';self.tx.target=self.plan['target']
        self.assertTrue(self.collect()['baselineCoverage']['coreComplete']);self.assertEqual(self.pins,self.plan['baseline'])
    def test_47_and_missing_explicit_ack_do_not_get_exception(self):
        self.result['errors']=self.allowed;self.plan['target']='47.105.59.142'
        with self.assertRaises(m.Hold):self.collect()
        self.plan['target']='103.30.76.93';self.plan['authorization']['userAcknowledgement']='wrong'
        with self.assertRaises(m.Hold):self.collect()
    def test_all_other_errors_rejected(self):
        for source,code in [('systemd-unit-cat','OBSERVATION_COMMAND_FAILED'),('systemd-unit-list','UNPARSED_SYSTEMD_UNIT'),('systemd-unit-files','OBSERVATION_UNAVAILABLE'),('docker','OBSERVATION_UNAVAILABLE'),('machine-id','HOST_IDENTITY_UNVERIFIED'),('nginx','CONCURRENT_CONFIG_CHANGE_OR_INCOMPLETE')]:
            self.result['errors']=[self.allowed[0],{'source':source,'code':code}]
            with self.assertRaises(m.Hold):self.collect()
    def test_allowed_errors_never_override_broken_core(self):
        self.result['errors']=self.allowed
        for section,key in [(None,'hostIdentityMatches'),('dockerInventory','complete'),('dockerInventory','stable'),('nginx','stable'),('nginx','fullDumpSha256')]:
            original=copy.deepcopy(self.result)
            if section:self.result[section][key]=False if key!='fullDumpSha256' else ''
            else:self.result[key]=False
            with self.assertRaises(m.Hold):self.collect()
            self.result=original
        self.assertEqual(self.pins,[])
    def test_missing_duplicate_or_changed_baseline_identity_rejected(self):
        self.result['errors']=self.allowed
        for rows in [[],[dict(self.plan['baseline'][0],image='sha256:'+'d'*64)],self.plan['baseline']*2]:
            self.result['containers']=rows
            with self.assertRaises(m.Hold):self.collect()
    def test_live_pin_race_is_not_ignored(self):
        self.result['errors']=self.allowed
        def changed(item):raise m.Hold('CONTAINER_BASELINE_CHANGED')
        self.tx.pin=changed
        with self.assertRaisesRegex(m.Hold,'CONTAINER_BASELINE_CHANGED'):self.collect()

if __name__=='__main__':unittest.main()
