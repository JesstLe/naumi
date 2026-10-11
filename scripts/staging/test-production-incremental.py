#!/usr/bin/env python3
"""Offline contracts for merge classification and exact numeric serialization."""
import collections
import decimal
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('merge', pathlib.Path(__file__).with_name('merge-production-incremental.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Contracts(unittest.TestCase):
    def test_exact_decimal(self):
        text = m.canonical({'price': decimal.Decimal('0.1234567890123456789012345')})
        self.assertEqual(json.loads(text, parse_float=decimal.Decimal)['price'], decimal.Decimal('0.1234567890123456789012345'))

    def test_identifier_escaping(self):
        self.assertEqual(m.ident('x"y'), '"x""y"')
        self.assertEqual(m.literal("it's"), "'it''s'")

    def test_config_protection(self):
        for t in ('app_model_credentials', 'app_settings', 'app_billing_config_versions', 'app_projects', 'app_templates', 'app_supplier_accounts'):
            self.assertTrue(m.protected(t))
        self.assertFalse(m.protected('app_artworks'))

    def test_three_way_and_wallet(self):
        ancestor = {'app_artworks': [
            {'id': 'source-edit', 'value': 'old'}, {'id': 'conflict', 'value': 'old'},
            {'id': 'staging-edit', 'value': 'old'}, {'id': 'deleted', 'value': 'old'}],
            'app_users': [{'email': 'a', 'credits_total': 10, 'credits_used': 0}],
            'app_credit_batches': [{'id': 'b', 'email': 'a', 'remaining': 10}]}
        source = {'app_artworks': [
            {'id': 'source-edit', 'value': 'prod'}, {'id': 'conflict', 'value': 'prod'},
            {'id': 'staging-edit', 'value': 'old'}, {'id': 'deleted', 'value': 'old'},
            {'id': 'new', 'value': 'prod'}],
            'app_users': [{'email': 'a', 'credits_total': 6, 'credits_used': 0}],
            'app_credit_batches': [{'id': 'b', 'email': 'a', 'remaining': 6},
                                   {'id': 'prod-grant', 'email': 'a', 'remaining': 100}]}
        current = {'app_artworks': [
            {'id': 'source-edit', 'value': 'old', 'new_column': 'keep'},
            {'id': 'conflict', 'value': 'test', 'new_column': 'keep'},
            {'id': 'staging-edit', 'value': 'test', 'new_column': 'keep'},
            {'id': 'staging-new', 'value': 'test', 'new_column': 'keep'}],
            'app_users': [{'email': 'a', 'credits_total': 8, 'credits_used': 0}],
            'app_credit_batches': [{'id': 'b', 'email': 'a', 'remaining': 8}],
            'app_supplier_model_metadata': [{'id': 'private', 'price': 'keep'}]}
        keys = {'app_artworks': ['id'], 'app_users': ['email'], 'app_credit_batches': ['id']}
        columns = [{'table_name': t, 'column_name': c} for t, rows in source.items() for c in rows[0]]
        pk = [{'table_name': t, 'column_name': k} for t, kk in keys.items() for k in kk]
        meta = {'old': {'COLUMNS': columns, 'PKS': pk}, 'new': {'FKS': []}}
        with tempfile.TemporaryDirectory() as d, patch.object(m, 'ROOT', pathlib.Path(d)), patch.object(m, 'read', side_effect=[current, source, ancestor]):
            pathlib.Path(d, 'schema-inventory.json').write_text(json.dumps(meta))
            plan = m.prepare('fixture')
        actions = {json.loads(p['key'])[0]: p['action'] for p in plan['plan'] if p['table'] == 'app_artworks'}
        self.assertEqual(actions, {'source-edit': 'update', 'conflict': 'conflict', 'deleted': 'deleted-in-staging', 'new': 'insert'})
        self.assertEqual(plan['wallets_preserved'], 1)
        self.assertEqual(plan['summary']['app_credit_batches']['wallet-conflict'], 2)
        self.assertIn('NEW_TABLE\napp_supplier_model_metadata', plan['preserved'])
        self.assertIn('app_artworks\n["staging-new"]', plan['preserved'])

    def test_live_rollback_requires_stopped_writers(self):
        with patch.object(m, 'sql', return_value='1\n'):
            with self.assertRaisesRegex(AssertionError, 'STOP_STAGING_WRITERS_FIRST'):
                m.rollback('naumi_staging', {})


if __name__ == '__main__':
    unittest.main()
