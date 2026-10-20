import copy
import unittest
from unittest.mock import patch
import release103_history_cleanup as m
from test_release103_authorized_ui_retirement import FakeTx


class Tests(unittest.TestCase):
    def row(self):
        return {'Id': 'a'*64, 'Config': {'Image': 'original', 'Env': ['PRIVATE=fixture'], 'Cmd': ['node', 'server.js']}, 'HostConfig': {'AutoRemove': False, 'Binds': ['/host:/data'], 'PortBindings': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '13033'}]}, 'RestartPolicy': {'Name': 'unless-stopped'}}, 'NetworkSettings': {'Networks': {'net': {'IPAddress': '172.20.0.3', 'EndpointID': 'ep', 'Aliases': ['old-ui', 'a'*12], 'IPAMConfig': None}}}}

    def plan(self):
        return {'target': '103.30.76.93', 'thread': m.THREAD, 'authorization': m.AUTHORIZATION, 'historicalVolatileStateAccepted': True, 'ordinaryDrainReceipt': None, 'candidates': [{'id':'a'*64}], 'protectedContainers': [{'id':'b'*64}], 'deleteVolumes': False, 'deleteImages': False}

    def test_snapshot_and_data_binding_preserved(self):
        row = self.row(); before = copy.deepcopy(row); b = m.rollback_body(row, 'sha256:'+'f'*64)
        self.assertEqual(row, before); self.assertEqual(b['HostConfig']['Binds'], ['/host:/data']); self.assertEqual(b['Env'], ['PRIVATE=fixture']); self.assertEqual(b['Image'], 'sha256:'+'f'*64)
        self.assertEqual(b['HostConfig']['RestartPolicy']['Name'], 'no')

    def test_ephemeral_network_identity_not_reused(self):
        b = m.rollback_body(self.row(), 'sha256:'+'f'*64)['NetworkingConfig']['EndpointsConfig']['net']
        self.assertEqual(b, {'Aliases': ['old-ui']})

    def test_reject_unpinned_snapshot(self):
        self.assertRaisesRegex(RuntimeError, 'SNAPSHOT_IMAGE', m.rollback_body, self.row(), 'latest')

    def test_reject_autoremove(self):
        r = self.row(); r['HostConfig']['AutoRemove'] = True
        self.assertRaisesRegex(RuntimeError, 'AUTO_REMOVE', m.rollback_body, r, 'sha256:'+'f'*64)

    def test_explicit_authorization(self):
        p = self.plan(); m.check_plan(p); p['authorization'] = 'old permission'
        self.assertRaisesRegex(RuntimeError, 'CURRENT_EXPLICIT', m.check_plan, p)

    def test_protected_duplicate_and_data_delete_rejected(self):
        for change in ({'protectedContainers':[{'id':'a'*64}]}, {'candidates':[{'id':'a'*64}]*2}, {'deleteVolumes':True}, {'deleteImages':True}, {'ordinaryDrainReceipt':{'coverage':'complete'}}):
            p = self.plan(); p.update(change)
            self.assertRaises(RuntimeError, m.check_plan, p)

    def test_stopped_pin_checks_state(self):
        r = self.row(); r['Name']='/old-ui'; r['Image']='sha256:'+'c'*64
        r['State']={'Running':False,'StartedAt':'old','Status':'exited'}
        r['Config']['Env']=['NAUMI_VIDEO_WORKER=0']
        p={**m.public_identity(r),'name':r['Name'],'port':13033};m.eligible(r,p)
        r['State']['Status']='created'
        self.assertRaisesRegex(RuntimeError,'STOPPED_EXIT',m.eligible,r,p)

    def execute_fixture(self, *, activity=0, uncertain=False, bad_copy=False):
        tx=FakeTx();tx.stop_error=uncertain
        r=tx.rows['a'*64];r['State']['Status']='running'
        plan=self.plan();plan['evidenceDirectory']='/fixture';plan['protectedContainers']=[]
        plan['candidates']=[{**m.public_identity(r),'name':r['Name'],'port':13033}]
        original_run=tx.run
        def run(args,**kwargs):
            if args[1]=='commit':tx.commands.append(args);return ('sha256:'+'f'*64).encode()
            if args[1:3]==['image','inspect']:return __import__('json').dumps([{'Id':'sha256:'+'f'*64}]).encode()
            if args[1]=='rm':tx.commands.append(args);del tx.rows[args[-1]];return b''
            if args[1]=='ps':return '\n'.join(tx.rows).encode()
            return original_run(args,**kwargs)
        tx.run=run
        def api(method,path,body):
            copy_row=copy.deepcopy(tx.rows['a'*64]);copy_row['Id']='d'*64;copy_row['Name']='/naumi-history103-rollback-check-'+'a'*12;copy_row['Image']='sha256:'+'f'*64
            copy_row['State'].update(Running=bad_copy,Status='created');copy_row['HostConfig']['Memory']=0
            tx.rows['d'*64]=copy_row
            return {'Id':'d'*64}
        r['HostConfig']['Memory']=0
        from contextlib import ExitStack
        with ExitStack() as stack:
            stack.enter_context(patch.object(m,'HostTransaction',return_value=tx))
            stack.enter_context(patch.object(m.old,'protected_health',return_value=[]))
            stack.enter_context(patch.object(m.old,'no_references'))
            stack.enter_context(patch.object(m.old,'gateway',return_value=b'fixture'))
            stack.enter_context(patch.object(m.old,'available',return_value=5000))
            stack.enter_context(patch.object(m.old,'serving_connections',return_value=activity))
            stack.enter_context(patch.object(m.old,'active_db',return_value=0))
            stack.enter_context(patch.object(m.time,'sleep'))
            stack.enter_context(patch.object(m,'api',side_effect=api))
            try:return m.execute(plan),tx
            except RuntimeError as error:return error,tx

    def test_execute_removes_only_after_rollback_copy(self):
        result,tx=self.execute_fixture();self.assertIsInstance(result,dict)
        self.assertEqual(result['removedCount'],1);self.assertIn('rollback-copy-pass-'+'a'*12+'.json',tx.saved)
        self.assertEqual([c for c in tx.commands if c[1]=='rm'],[['docker','rm','d'*64],['docker','rm','a'*64]])
        self.assertFalse(any('-f'in c or '-v'in c for c in tx.commands))

    def test_current_connection_never_stops(self):
        result,tx=self.execute_fixture(activity=1);self.assertIsInstance(result,RuntimeError)
        self.assertFalse(any(c[1] in ('stop','rm','update')for c in tx.commands))

    def test_unknown_stop_not_retried_or_removed(self):
        result,tx=self.execute_fixture(uncertain=True);self.assertIsInstance(result,RuntimeError)
        self.assertEqual(len([c for c in tx.commands if c[1]=='stop']),1)
        self.assertFalse(any(c[1]=='rm'for c in tx.commands))

    def test_bad_copy_prevents_original_removal(self):
        result,tx=self.execute_fixture(bad_copy=True);self.assertIsInstance(result,RuntimeError)
        self.assertFalse(any(c[1]=='rm'and c[-1]=='a'*64 for c in tx.commands))

    def test_unknown_overlay_not_ignored(self):
        r={'Mounts':[{'Type':'bind','RW':False,'Source':'/host/code','Destination':'/app/code'}]}
        self.assertRaisesRegex(RuntimeError,'NON_DATA',m.review_mounts,r,{})


if __name__ == '__main__': unittest.main()
