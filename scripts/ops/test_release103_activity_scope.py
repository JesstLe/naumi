"""Opt-in SQL contract only; existing collectors retain all-table defaults."""
import copy
import unittest
import release47_task_snapshot as m
from test_release47_task_snapshot import private


class ActivityScopeTests(unittest.TestCase):
    def test_default_is_explicit_all_and_unchanged(self):
        self.assertEqual(m.build_sql(),m.build_sql(activity_scope='all'))
        self.assertNotIn("t.state IS DISTINCT FROM",m.build_sql().decode())

    def test_unknown_scope_rejected(self):
        for scope in ['active-only','current-boot',None]:
            with self.subTest(scope=scope),self.assertRaisesRegex(ValueError,'UNKNOWN_TASK_ACTIVITY_SCOPE'):
                m.build_sql(activity_scope=scope)

    def test_count_first_and_following_pages_use_same_explicit_filter(self):
        previous=private({'app_release_activities':[{'id':'00000000-0000-0000-0000-000000000001','state':'active'}]})
        sql=m.build_sql(activity_scope='nonfinished-and-prior',previous=previous).decode()
        predicate="t.state IS DISTINCT FROM 'finished' OR t.id IN ('00000000-0000-0000-0000-000000000001')"
        self.assertIn('WHERE ('+m.STATE+"->>'ok')::boolean AND ("+predicate+') ORDER BY :table_12_order_pk LIMIT 100001',sql)
        self.assertIn('WHERE true AND (SELECT (s->>\'ok\')::boolean FROM s) AND ('+predicate+')',sql)
        page=m.page_graph_sql(12,'app_release_activities','public.app_release_activities','id',m.budgets(),activity_filter=predicate)
        self.assertIn('WHERE :table_12_seek AND (SELECT (s->>\'ok\')::boolean FROM s) AND ('+predicate+')',page)
        self.assertNotIn('instance_id=',predicate);self.assertNotIn('boot_id=',predicate)
        self.assertEqual(m.DEFAULT_BUDGET['scan_rows'],100000)

    def test_selected_history_is_not_recertified_across_changed_scope(self):
        before=private();before['collection']={'version':m.PROOF_VERSION,'status':'complete'}
        after=copy.deepcopy(before);after['collection']['activityScope']='nonfinished-and-prior'
        result=m.compare_task_snapshots(before,after)
        self.assertFalse(result['preservationVerified'])
        self.assertIn({'reason':'TASK_ACTIVITY_SCOPE_CHANGED'},result['violations'])


if __name__=='__main__':unittest.main()
