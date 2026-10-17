import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import patch

import release_rollback_ingress as ingress
import release_maintenance_session as session
from release47_host import Hold, sha
import test_release_maintenance_session as fixture


class IngressTests(unittest.TestCase):
    def test_original_worker_identity_not_pid_number_alone(self):
        before={'master':{'pid':1,'startTicks':10},'workers':[{'pid':2,'startTicks':20}]}
        self.assertFalse(ingress.drained(before,copy.deepcopy(before)))
        after=copy.deepcopy(before);after['workers'][0]['startTicks']=21
        self.assertTrue(ingress.drained(before,after))
        after['master']['startTicks']=11
        with self.assertRaisesRegex(Hold,'MASTER_CHANGED'):ingress.drained(before,after)

    def test_still_live_worker_never_becomes_drain_by_timeout(self):
        seen={'master':{'pid':1,'startTicks':10},'workers':[{'pid':2,'startTicks':20}]}
        with patch.object(ingress,'observe',return_value=seen), self.assertRaisesRegex(Hold,'NOT_DRAINED'):
            ingress.wait_drained(None,seen,timeout=0)

    def test_all_four_probes_must_return_503(self):
        calls=[]
        def run(args,**kwargs):calls.append(args);return b'503'
        self.assertEqual(ingress.maintenance_probes(SimpleNamespace(run=run))['paths'],4)
        self.assertEqual(len(calls),4)
        for status in (b'200',b'301',b'502',b'000'):
            with self.assertRaises(Hold):ingress.maintenance_probes(SimpleNamespace(run=lambda *a,**k:status))


class ReverseGatewayTests(unittest.TestCase):
    setUp=fixture.LiveRecoveryTests.setUp
    tearDown=fixture.LiveRecoveryTests.tearDown
    command=fixture.LiveRecoveryTests.command
    gateway_fixture=fixture.LiveRecoveryTests.gateway_fixture
    def reverse_fixture(self):
        self.gateway_fixture()
        self.spec['authorization']['mode']='canvas-video-fusion-103'
        self.spec['gateways']['open']=self.spec['gateways']['maintenance']
        return self.spec['gateways']['open']

    def test_reverse_open_uses_exact_full_candidate_closure(self):
        self.reverse_fixture()
        _,report,before,after=self.adapter.gateway_material('rollback-seal')
        self.assertEqual(report['beforeDumpSha256'],sha(b'after'))
        self.assertEqual(report['afterDumpSha256'],sha(b'before'))
        self.assertEqual(before,self.after)
        self.assertTrue(all(value==b'before config\n' for value in after.values()))
        operation=str(uuid.uuid4())
        with patch.object(session.controls,'NGINX_ROOT',self.folder/'nginx'):
            self.adapter.gateway('maintenance',str(uuid.uuid4()))
            self.adapter.gateway('rollback-seal',operation)
            self.assertTrue(self.adapter.gateway_matches('rollback-seal',True))
            self.adapter.gateway('rollback-seal',operation,True)

    def test_reverse_rejects_changed_original_patch_hash_before_io(self):
        descriptor=self.reverse_fixture()
        path=self.folder/descriptor['report']['path'];report=json.loads(path.read_text())
        report['patches'][0]['beforeSha256']='a'*64
        path.write_bytes(session.encoded(report));descriptor['report']['sha256']=sha(path.read_bytes())
        with self.assertRaisesRegex(Hold,'BOUND_OPEN_TRANSITION_REQUIRED'):self.adapter.gateway_material('rollback-seal')


if __name__=='__main__':unittest.main()
