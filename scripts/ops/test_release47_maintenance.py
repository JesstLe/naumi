import datetime as dt
import json
import pathlib
import tempfile
import unittest

import release47_maintenance as m
import release_client_compat as c
from release47_host import Hold, HostTransaction, public_identity, sha
from test_release_client_compat import fixture_files, dump_files, SITE, OLD, ALIAS_URL


class Maintenance(unittest.TestCase):
    def spec(self):
        return {'mode':'one-time-maintenance', 'target':'47.105.59.142', 'date':'2026-10-16',
                'userAcknowledgement':m.ACK, 'restoreDatabase':False, 'replayAcceptedTasks':False}

    def test_exact_window_one_date_one_target_not_recurring(self):
        m.authorize(self.spec(), dt.datetime.fromisoformat('2026-10-16T18:30:00+08:00'))
        for at in ['2026-10-16T18:29:59+08:00','2026-10-17T18:30:00+08:00','2026-10-23T18:30:00+08:00']:
            with self.assertRaisesRegex(Hold,'WINDOW'): m.authorize(self.spec(),dt.datetime.fromisoformat(at))
        m.authorize(dict(self.spec(),target='103.30.76.93'),dt.datetime.fromisoformat('2026-10-16T18:30:00+08:00'))
        for change in [dict(target='101.133.166.67'),dict(restoreDatabase=True),dict(replayAcceptedTasks=True),dict(userAcknowledgement='无人在线')]:
            with self.assertRaises(Hold): m.authorize(dict(self.spec(),**change),dt.datetime.fromisoformat('2026-10-16T18:30:00+08:00'))

    def test_maintenance_rejects_tasks_lost_or_supplier_changed_or_unknown(self):
        before=after={'dbIdentityHash':'a'*64,'errors':[]}
        result={'noMissingJobIds':True,'noSupplierIdentityMutation':True}
        self.assertFalse(m.validate_preservation(before,after,result)['legacyDrainProven'])
        for change in [dict(noMissingJobIds=False),dict(noSupplierIdentityMutation=False)]:
            with self.assertRaises(Hold):m.validate_preservation(before,after,dict(result,**change))
        with self.assertRaises(Hold):m.validate_preservation(before,dict(after,errors=['unknown']),result)

    def test_maintenance_gateway_keeps_legacy_proxy_and_exact_cas(self):
        files=fixture_files();baseline=dump_files(files)
        manifest={'schemaVersion':1,'kind':'next-static-union','assets':[{'url':ALIAS_URL,'sha256':'a'*64,'size':1}]}
        candidate='http://127.0.0.1:13100'
        patches,unified,report=c.render_gateway(baseline,SITE,candidate,OLD,'/var/www/fixture',manifest)
        with tempfile.TemporaryDirectory() as tmp:
            report=m.maintenance_gateway(unified,candidate,pathlib.Path(tmp)/'bundle',baseline_dump=baseline,
                                         source_files={n:b.encode() for n,b in files.items()})
            text=(pathlib.Path(tmp)/'bundle/nginx.after.txt').read_text()
            parsed=c.Dump(text)
            self.assertIn('return 503;',text)
            self.assertIn('if ($naumi47_compat_api = '+candidate+')',text)
            self.assertIn('http://127.0.0.1:17847',text)
            self.assertTrue(report['baselineFileCasVerified'])
            self.assertFalse(report['legacyDrainProven'])
            for name in parsed.files:
                for node in c.walk(parsed.nodes[name]):
                    if node.name=='proxy_pass':self.assertNotEqual(node.args,[candidate])

    def test_legacy_freeze_is_unknown_and_preserves_old_App(self):
        script=b'const running=false; // audited old HTTP caller'
        row={'Id':'1'*64,'Image':'sha256:'+'a'*64,'Name':'/naumi47-legacy-worker',
             'State':{'Running':True,'Paused':False,'StartedAt':'same'},
             'Config':{'Cmd':['scripts/video-worker.mjs'],'Env':[]},
             'HostConfig':{'RestartPolicy':{'Name':'unless-stopped'}}}
        calls=[]
        def command(args,**kw):
            calls.append(args)
            if args[:2]==['docker','inspect']:return json.dumps([row]).encode()
            if args[:2]==['docker','exec']:return script
            if args[:2]==['docker','pause']:row['State']['Paused']=True
            if args[:2]==['docker','unpause']:row['State']['Paused']=False
            return b''
        with tempfile.TemporaryDirectory() as tmp:
            tx=HostTransaction('47.105.59.142','b'*64,tmp,command=command);tx.stack=True
            identity=public_identity(row)
            receipt=m.freeze_legacy_caller(tx,identity,expected_script_sha256=sha(script))
            self.assertIsNone(receipt['activeTicks']);self.assertEqual(receipt['coverage'],'legacy-unknown')
            self.assertFalse(any(c[:2] in [['docker','stop'],['docker','kill']] for c in calls))
            with self.assertRaises(Hold):m.restore_frozen_caller(tx,identity,candidate_worker_quiescent=False)
            self.assertTrue(m.restore_frozen_caller(tx,identity,candidate_worker_quiescent=True)['restored'])


if __name__=='__main__':unittest.main()
