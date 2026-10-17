import copy
import json
import unittest

import release_rollback_guard as g
from release47_host import Hold


def output():
    common = {'database': 'fixture', 'readOnly': 'on', 'isolation': 'repeatable read', 'snapshot': '1:2:'}
    catalog = sorted(g.REQUIRED | {'app_video_tasks'})
    return [{'kind': 'begin', **common}, {'kind': 'catalog', 'tables': catalog, 'schemaDigest': 'a'*64},
            *[{'kind': 'table', 'table': name, 'count': 0, 'digest': 'b'*64}
              for name in catalog if name not in g.OPERATIONAL],
            {'kind': 'activities', 'count': 0, 'unfinished': 0, 'agentCount': 0, 'agentDigest': 'c'*64},
            {'kind': 'ticks', 'count': 0, 'unfinished': 0}, {'kind': 'owners', 'unfinished': 0},
            {'kind': 'end', **common}]


def raw(rows): return ('\n'.join(json.dumps(row) for row in rows)+'\n').encode()


class GuardTests(unittest.TestCase):
    def test_catalog_bound_precedes_dynamic_hash_dispatch(self):
        sql=g.build_sql(['web-fixture'],'caller-fixture').decode()
        self.assertLess(sql.index("RAISE EXCEPTION 'ROLLBACK_CATALOG_BOUND_EXCEEDED'"),sql.index('SELECT format('))
        self.assertLess(sql.index("RAISE EXCEPTION 'ROLLBACK_CATALOG_BOUND_EXCEEDED'"),sql.index('\\gexec'))
        self.assertIn('LIMIT 513',sql)

    def test_complete_read_only_observation(self):
        result = g.parse(raw(output()), 'fixture')
        self.assertEqual(set(result['tables']), {'app_video_tasks', 'app_release_session_owners'})

    def test_partial_transaction_or_catalog_rejected(self):
        for mutation in ('truncate', 'duplicate', 'omit-table', 'unknown-kind', 'wrong-db', 'wrong-snapshot', 'not-read-only'):
            with self.subTest(mutation=mutation):
                rows = output()
                if mutation == 'truncate': rows.pop()
                elif mutation == 'duplicate': rows.insert(2, copy.deepcopy(rows[2]))
                elif mutation == 'omit-table': rows.pop(2)
                elif mutation == 'unknown-kind': rows.insert(2, {'kind': 'ignored'})
                elif mutation == 'wrong-db': rows[0]['database'] = 'replacement'
                elif mutation == 'wrong-snapshot': rows[-1]['snapshot'] = '3:4:'
                else: rows[-1]['readOnly'] = 'off'
                with self.assertRaises((Hold, ValueError)): g.parse(raw(rows), 'fixture')

    def test_nonterminal_or_unbounded_observations_rejected(self):
        for kind, field in [('table','count'), ('activities','count'), ('ticks','count'),
                            ('activities','unfinished'), ('ticks','unfinished'), ('owners','unfinished')]:
            rows = output(); item = next(r for r in rows if r['kind'] == kind)
            item[field] = g.ROW_LIMIT+1 if field == 'count' else 1
            with self.subTest(kind=kind, field=field), self.assertRaises(Hold): g.parse(raw(rows), 'fixture')

    def test_completed_empty_scans_do_not_change_business_proof(self):
        before = self.boundary(); rows = output()
        next(r for r in rows if r['kind']=='ticks')['count'] = 9
        next(r for r in rows if r['kind']=='activities')['count'] = 15
        after = {**before, 'observed': g.parse(raw(rows), 'fixture')}
        self.assertEqual(g.compare(before, after)['kind'], 'unchanged-business-fallback-v1')

    def boundary(self):
        return {'kind': 'unchanged-business-rollback-boundary-v1', 'binding': {'boot':'original'},
                'databaseNameSha256':'d'*64, 'sqlSha256':'e'*64, 'observed':g.parse(raw(output()),'fixture')}

    def test_business_mutation_and_finished_agent_turn_are_not_empty_scans(self):
        before = self.boundary()
        for field in ('tables','agents','catalog','schemaDigest'):
            after = copy.deepcopy(before)
            after['observed'][field] = {} if field not in ('catalog','schemaDigest') else 'changed'
            with self.subTest(field=field), self.assertRaisesRegex(Hold,'STATE_CHANGED'): g.compare(before,after)

    def test_changed_original_identity_is_not_rebound(self):
        before = self.boundary()
        for field in ('binding','databaseNameSha256','sqlSha256'):
            after = copy.deepcopy(before); after[field] = 'changed'
            with self.subTest(field=field), self.assertRaisesRegex(Hold,'BINDING_CHANGED'): g.compare(before,after)

    def test_runtime_null_zero_and_transport_faults_fail_closed(self):
        plan={'webs':[{'variant':'main'}], 'releaseId':'r','commit':'c','buildVersion':'v','database':{}}
        ident={'instanceId':'fixture','bootId':'boot'}
        state={'webs':{'main':{'running':{},'verified':{'app':{'identity':ident}}}},'worker':{'running':{}}}
        status={'identity':ident,'admission':{'mode':'draining'},
                'transport':{'verified':True,'transport':{'accountingFault':False}},
                'observations':{k:0 for k in g.ZERO_FIELDS}}
        g.runtime_binding(plan,state,{'main':status})
        for field in g.ZERO_FIELDS:
            bad=copy.deepcopy(status);bad['observations'][field]=None
            with self.subTest(field=field), self.assertRaises(Hold):g.runtime_binding(plan,state,{'main':bad})
        for fault in (True,None):
            bad=copy.deepcopy(status);bad['transport']['transport']['accountingFault']=fault
            with self.assertRaises(Hold):g.runtime_binding(plan,state,{'main':bad})


if __name__ == '__main__': unittest.main()
