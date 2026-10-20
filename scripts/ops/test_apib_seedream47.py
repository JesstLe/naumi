import copy
import hashlib
import json
import pathlib
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import apib_seedream47 as m
from release47_host import Hold


class Tests(unittest.TestCase):
    def setUp(self):
        self.raw=json.dumps({'revision':209,'activeNormalBlueGreenReleaseId':'release47-resolution-20261020','normalBlueGreenReleases':{'release47-resolution-20261020':{'phase':'COMPLETE'}}}).encode()
        self.spec={'canonicalSha256':hashlib.sha256(self.raw).hexdigest(),'revision':209,'releaseId':'release47-resolution-20261020'}

    def test_active_successor_complete_not_historical_root(self):
        self.assertEqual(m.lifecycle(self.raw,self.spec)['revision'],209)

    def test_stale_canonical_rejected(self):
        for key,value in [('revision',208),('canonicalSha256','0'*64),('releaseId','old')]:
            spec={**self.spec,key:value};self.assertRaises(Hold,m.lifecycle,self.raw,spec)

    def test_incomplete_successor_rejected(self):
        state=json.loads(self.raw);state['normalBlueGreenReleases'][self.spec['releaseId']]['phase']='SWITCHED'
        raw=json.dumps(state).encode();spec={**self.spec,'canonicalSha256':hashlib.sha256(raw).hexdigest()}
        self.assertRaisesRegex(Hold,'NOT_COMPLETE',m.lifecycle,raw,spec)

    def test_actual_web_worker_program_overlay_rejected(self):
        row={'Config':{'Env':['SOURCE_COMMIT=abc','BUILD_VERSION=123']},'Image':'fixed','Mounts':[]}
        spec={'web':{'image':'fixed'},'worker':{},'sourceCommit':'abc','buildVersion':'123'}
        tx=SimpleNamespace(pin=lambda p:row);m.runtime_pin(tx,spec)
        row['Mounts']=[{'Destination':'/app/.next/server/chunks/123.js'}]
        self.assertRaisesRegex(Hold,'OVERLAY',m.runtime_pin,tx,spec)

    def test_existing_uuid_directory_never_overwritten(self):
        calls=[]
        tx=SimpleNamespace(run=lambda args,**kwargs:(calls.append(args)or b'EXISTS'))
        self.assertRaisesRegex(Hold,'RECONCILE',m.install,tx,{'web':{'id':'fixed'}},{'operationId':'fixed'},pathlib.Path('unused'))
        self.assertEqual(len(calls),1)

    def test_http_is_plan_only(self):
        calls=[];tx=SimpleNamespace(run=lambda args,**kwargs:(calls.append((args,kwargs))or b'{"status":200,"body":{}}'))
        m.http(tx,{'web':{'id':'fixed'}},'private-cookie','/api/imagegen/plan',{'modelId':'test'})
        self.assertEqual(json.loads(calls[0][1]['stdin'])['method'],'POST')
        self.assertIn("u.pathname==='/api/imagegen/plan'",m.HTTP)
        self.assertNotIn('/api/imagegen/submit',m.HTTP)
        self.assertNotIn('private-cookie',' '.join(calls[0][0]))

    def test_locks_close_after_exception(self):
        tx=SimpleNamespace(__enter__=None);closed=[]
        class Fake:
            def __enter__(self):return tx
            def __exit__(self,*args):closed.append(True)
        # The real context exposes __exit__ on the entered HostTransaction.
        tx.__exit__=lambda *args:closed.append(True)
        with patch.object(m,'HostTransaction',return_value=Fake()):
            with self.assertRaisesRegex(RuntimeError,'fixture'):
                with m.transaction({'evidenceRoot':'/fixture'}):raise RuntimeError('fixture')
        self.assertEqual(closed,[True])


if __name__=='__main__':unittest.main()
