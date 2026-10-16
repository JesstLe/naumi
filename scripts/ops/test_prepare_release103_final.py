#!/usr/bin/env python3
"""Offline final union conflict/nonoverwrite and package whitelist tests."""
import json
from pathlib import Path
import tempfile
import unittest

from release_client_compat import sha
from release103_assets import materialize
from prepare_release103_final import merge_candidates, verify_materialized
import prepare_release103_final as final


class FinalUnion(unittest.TestCase):
    def test_new_fixed_candidate_definition_and_prefix_rejection(self):
        old=(final.SOURCE,final.VERSION,final.IMAGES,final.ORIGINS,final.STATIC_ROOT,final.RELEASE_KEY,final.RUNTIME_TOPOLOGY)
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'candidate.json'
            definition={'source':'a'*40,'version':'1792999999','images':{flavor:{'image':'sha256:'+char*64,'assetPrefix':prefix} for flavor,char,prefix in [('main','a',''),('desktop','b','/desktop'),('enterprise','c','/enterprise')]},'origins':{'main':'http://127.0.0.1:13100','desktop':'http://127.0.0.1:13101','enterprise':'http://127.0.0.1:13102'},'staticRoot':'/var/www/naumi-client-assets/new-fixed-sha','releaseKey':'evening-new-fixed'}
            try:
                path.write_text(json.dumps(definition));final.configure_candidates(path)
                self.assertEqual(final.SOURCE,'a'*40);self.assertEqual(final.IMAGES['desktop'][1],'/desktop')
                definition['images']['enterprise']['assetPrefix']=''
                path.write_text(json.dumps(definition))
                from release_client_compat import CompatError
                with self.assertRaises(CompatError):final.configure_candidates(path)
                definition['images']={'main':{'image':'sha256:'+'d'*64,'assetPrefix':''}}
                definition['runtimeTopology']='unified-web-three-ui'
                definition['origins']={key:'http://127.0.0.1:13100' for key in ('main','desktop','enterprise')}
                path.write_text(json.dumps(definition));final.configure_candidates(path)
                self.assertEqual(len(final.IMAGES),1);self.assertEqual(final.RUNTIME_TOPOLOGY,'unified-web-three-ui')
            finally:final.SOURCE,final.VERSION,final.IMAGES,final.ORIGINS,final.STATIC_ROOT,final.RELEASE_KEY,final.RUNTIME_TOPOLOGY=old

    def test_real_prefix_isolation_duplicates_and_conflict_hold(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);old=root/'old';old.write_bytes(b'old')
            legacy={'kind':'103-prefixed-static-union','schemaVersion':1,'fleetIncluded':False,'conflicts':[],'assets':[{'url':'/_next/static/chunks/same.js','source':str(old),'size':3,'sha256':sha(b'old')}],'sourceFiles':1,'containerSources':1,'diskRoots':1}
            candidates=[]
            for flavor,prefix,data in [('main','',b'old'),('desktop','/desktop',b'desktop'),('enterprise','/enterprise',b'enterprise')]:
                folder=root/flavor/'chunks';folder.mkdir(parents=True);(folder/'same.js').write_bytes(data)
                candidates.append({'flavor':flavor,'assetPrefix':prefix,'copiedStaticRoot':str(root/flavor),'image':'sha256:'+flavor})
            merged=merge_candidates(legacy,candidates)
            self.assertEqual(len(merged['assets']),3);self.assertEqual(merged['newUrls'],2);self.assertFalse(merged['conflicts'])
            materialize(merged,root/'union');self.assertEqual(verify_materialized(merged,root/'union'),3)
            (root/'main/chunks/same.js').write_bytes(b'new')
            bad=merge_candidates(legacy,candidates)
            self.assertEqual(len(bad['conflicts']),1)
            self.assertEqual(Path(bad['conflicts'][0]['original']['source']).read_bytes(),b'old')
            from release_client_compat import CompatError
            with self.assertRaises(CompatError):materialize(bad,root/'conflicted-union')
            self.assertFalse((root/'conflicted-union').exists())
            self.assertEqual((root/'union/_next/static/chunks/same.js').read_bytes(),b'old')

    def test_changed_materialized_bytes_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);path=root/'_next/static/chunks/a.js';path.parent.mkdir(parents=True);path.write_bytes(b'tamper')
            manifest={'assets':[{'url':'/_next/static/chunks/a.js','sha256':sha(b'original'),'size':8}]}
            from release_client_compat import CompatError
            with self.assertRaises(CompatError):verify_materialized(manifest,root)


if __name__=='__main__':unittest.main()
