"""Focused fail-closed/static-live policy regressions; no Linux module rerun."""
import json
from pathlib import Path
import unittest

import release_client_compat as c
import release103_gateway as old
import prepare_latest103_gateway as latest

ROOT=Path('E:/Workspace/naumi/output/release103-evening-20261016')


class LatestPolicy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.static=(ROOT/'final-prepared-0614-static-rebased/package/gateways/maintenance/nginx.before.txt').read_bytes().decode()
        cls.manifest=json.loads((ROOT/'assets-7bdcd8b-hk/static-union/manifest.json').read_text())

    def test_exact51_static_live_classes_not65_original(self):
        _,_,locs=latest.inventory(self.static)
        self.assertEqual(len(locs),51)
        self.assertFalse(set(locs)&old.FALLBACKS)

    def test_stale_unknown_original_and_changed_alias_fail_closed(self):
        original=(ROOT/'final-prepared-0614-unified/package/gateways/maintenance/nginx.before.txt').read_bytes().decode()
        for text in (self.static+'\n',original,self.static.replace('evening-0614','unreviewed-0614',1)):
            with self.assertRaises(c.CompatError):latest.inventory(text)

    def test_new_candidate_policy_semantics_match_reviewed_old_candidate(self):
        rendered,_=latest.render(self.static,self.manifest,'/new-latest-static')
        reviewed=(ROOT/'final-prepared-0614-unified/package/gateways/open/nginx.after.txt').read_bytes().decode()
        reviewed=reviewed.replace('/var/www/naumi-client-assets/evening-0614f9ae6f91-unified','/new-latest-static')
        def signature(text):return [(n.name,n.args) for n in c.walk(c.Dump(text).nodes[old.SITE])]
        self.assertEqual(signature(rendered),signature(reviewed))

    def test_new_maintenance_policy_semantics_match_reviewed_old_maintenance(self):
        rendered,_=latest.render(self.static,self.manifest,'/new-latest-static',maintenance=True)
        reviewed=(ROOT/'final-prepared-0614-unified/package/gateways/maintenance/nginx.after.txt').read_bytes().decode()
        reviewed=reviewed.replace('/var/www/naumi-client-assets/evening-0614f9ae6f91-unified','/new-latest-static')
        def signature(text):return [(n.name,n.args) for n in c.walk(c.Dump(text).nodes[old.SITE])]
        self.assertEqual(signature(rendered),signature(reviewed))

    def test_external_origin_conflicts_and_invalid_root_rejected(self):
        for kwargs in ({'candidate':'http://8.8.8.8:13100'},{'candidate':'http://127.0.0.1:13062'},{'static_root':'/tmp/../bad'}):
            values={'static_root':'/new-latest-static',**kwargs}
            with self.assertRaises(c.CompatError):latest.render(self.static,self.manifest,**values)


if __name__=='__main__':unittest.main()
