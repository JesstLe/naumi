import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import release47_task_snapshot as m
import verify_release47_snapshot_pagination as verifier
from test_release47_task_snapshot import private


class SnapshotFollowups(unittest.TestCase):
    def test_paid_states_root_and_child_progress_and_regression(self):
        for child in [False,True]:
            for start,end,allowed in [('queued','started',True),('queued','done',True),('started','done',True),('started','rejected',True),('started','queued',False),('done','started',False),('rejected','started',False),('unknown','queued',False)]:
                part={'state':start,'model':'m','gatewayIdentity':'original'}
                paid={'root':{'children':{'child':part}}} if child else {'root':part}
                before=private({'app_image_jobs':[{'id':'j','snapshot':{'paidOperations':paid}}]});after=copy.deepcopy(before)
                target=after['tables']['app_image_jobs']['rows'][0]['snapshot']['paidOperations']['root']
                if child:target=target['children']['child']
                target['state']=end
                with self.subTest(child=child,start=start,end=end):self.assertEqual(m.compare_task_snapshots(before,after)['preservationVerified'],allowed)

    def test_selected_billing_ledger_is_frozen(self):
        before=private({'app_billing_operations':[{'id':'op','ledger_id':'old','state':'reserved'}]});after=copy.deepcopy(before)
        after['tables']['app_billing_operations']['rows'][0].update(ledger_id='new',state='settled')
        self.assertIn('FROZEN_CONTEXT_CHANGED',[v['reason'] for v in m.compare_task_snapshots(before,after)['violations']])
        self.assertIn('ledger_id',m.FROZEN_FIELDS);self.assertIn('ledger_id',m.PROOF_FIELDS)

    def test_original_global_ledger_exact_leaves_allow_only_additions(self):
        before=private();table=before['tables']['app_ledger'];table.update(globalLedger={'old':'a'*64},allSummary={'count':1})
        after=copy.deepcopy(before);after['tables']['app_ledger'].update(globalLedger={'old':'a'*64,'new':'b'*64},allSummary={'count':2})
        self.assertTrue(m.compare_task_snapshots(before,after)['preservationVerified'])
        for leaves in [{'old':'c'*64,'new':'b'*64},{'new':'b'*64,'substitute':'a'*64}]:
            after['tables']['app_ledger']['globalLedger']=leaves
            self.assertIn('ORIGINAL_GLOBAL_LEDGER_ROW_CHANGED',[v['reason'] for v in m.compare_task_snapshots(before,after)['violations']])
        after['tables']['app_ledger'].pop('globalLedger')
        self.assertIn('app_ledger',m.compare_task_snapshots(before,after)['unknownTables'])

    def test_unknown_states_and_tick_phase_cannot_be_reclassified(self):
        for table,row,field,end in [('app_release_activities',{'id':'a','state':'unknown'},'state','finished'),('app_release_session_owners',{'account_key':'a','session_id':'s','kind':'agent','state':'unknown'},'state','idle'),('app_worker_tick_receipts',{'tick_id':'t','phase':'unknown'},'phase','completed')]:
            before=private({table:[row]});after=copy.deepcopy(before);after['tables'][table]['rows'][0][field]=end
            result=m.compare_task_snapshots(before,after)
            self.assertFalse(result['preservationVerified']);self.assertEqual(result['stateTransitionsAllowed'],0)
        before=private({'app_worker_tick_receipts':[{'tick_id':'t','phase':'running'}]});after=copy.deepcopy(before);after['tables']['app_worker_tick_receipts']['rows'][0]['phase']='completed'
        self.assertTrue(m.compare_task_snapshots(before,after)['preservationVerified'])

    def test_falsey_nonobjects_are_not_empty_snapshots(self):
        for value in [[],False,None,0,'']:
            data=private({'app_image_jobs':[{'id':'j','snapshot':value}]})
            self.assertFalse(m.summarize(data)['preservationComplete'])
            self.assertFalse(m.compare_task_snapshots(data,data)['preservationVerified'])
        self.assertTrue(m.summarize(private({'app_image_jobs':[{'id':'j','snapshot':{}}]}))['preservationComplete'])

    def test_v2_does_not_gain_v3_evidence_retroactively(self):
        before=private();after=copy.deepcopy(before)
        before['collection']={'version':2,'status':'complete'};after['collection']={'version':m.PROOF_VERSION,'status':'complete'}
        for value in [before,after]:value['tables']['app_ledger'].update(globalLedger={},allSummary={'count':0})
        self.assertFalse(m.compare_task_snapshots(before,after)['preservationVerified'])
        before['collection']['version']=m.PROOF_VERSION
        self.assertTrue(m.compare_task_snapshots(before,after)['preservationVerified'])

    def test_first_graph_page_rebudgets_after_count(self):
        sql=m.build_sql(budget={'seconds':2}).decode()
        count=sql.index('SELECT count(*) AS scan_count')
        page=sql.index('page_keys AS MATERIALIZED',count)
        self.assertIn('set_config(\'statement_timeout\'',sql[count:page])
        self.assertIn("SET LOCAL statement_timeout='2000ms'",sql)

    def test_tick_negative_relabel_and_global_hash_privacy(self):
        before=private({'app_worker_tick_receipts':[{'tick_id':'t','phase':'unknown','protocol_version':2,'nonacceptance_at':None}]})
        after=copy.deepcopy(before);after['tables']['app_worker_tick_receipts']['rows'][0]['nonacceptance_at']='2026-10-29T00:00:00Z'
        self.assertFalse(m.compare_task_snapshots(before,after)['preservationVerified'])
        data=private();data['tables']['app_ledger'].update(globalLedger={'private-ledger-id':'a'*64},allSummary={'count':1})
        self.assertNotIn('private-ledger-id',json.dumps(m.summarize(data)))

    def test_start_failure_still_finalizes_report_and_owned_resources(self):
        with tempfile.TemporaryDirectory() as directory:
            calls=[]
            def start(fixture):fixture.cid='b'*64;raise RuntimeError('startup-primary')
            def command(_fixture,argv,**_):calls.append(argv);return SimpleNamespace(returncode=0,stdout=b'',stderr=b'')
            with patch('sys.argv',['verify','--phase','startup','--output',directory]),patch.object(verifier.Fixture,'start',start),patch.object(verifier.Fixture,'command',command):
                self.assertEqual(verifier.main(),1)
            report=json.loads((Path(directory)/'RESULT.json').read_text())
            self.assertEqual(report['failed'],[{'name':'runner','error':'startup-primary'}])
            self.assertEqual([x[1] for x in calls],['stop','rm'])
            self.assertFalse(report['realPostgres'])

    def test_cleanup_failures_do_not_skip_stop_remove_or_report(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture=verifier.Fixture(SimpleNamespace(output=directory,fixture_id=None,phase='cleanup-test'))
            fixture.cid='a'*64;fixture.schema='fixture';fixture.failed=[{'name':'runner','error':'original-failure'}]
            calls=[]
            def command(argv,**_):
                calls.append(argv)
                return SimpleNamespace(returncode=1 if 'stop' in argv else 0,stderr=b'stop-failed',stdout=b'')
            fixture.command=command
            with patch.object(fixture,'sql',side_effect=RuntimeError('drop-failed')):fixture.close()
            self.assertEqual([x[1] for x in calls],['stop','rm'])
            report=json.loads((Path(directory)/'RESULT.json').read_text())
            self.assertEqual(report['failed'][0]['error'],'original-failure')
            self.assertEqual([x['name'] for x in report['cleanupErrors']],['drop-schema','stop'])
            self.assertFalse(report['realPostgres'])

if __name__=='__main__':unittest.main()
