import copy,json,pathlib,tempfile,unittest
from unittest.mock import patch
from types import SimpleNamespace
import release47_nas_execute as m
from release47_host import Hold
class FinishCompleted(unittest.TestCase):
 def test_completed_continuation_and_guards_do_not_rerun_release_or_isolation(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=pathlib.Path(tmp);(root/'transaction').mkdir();(root/'final-media-proof').mkdir();cookie=root/'cookie';cookie.write_text('fixture-only')
   cfg={'releaseId':'release47-fixture','commit':'a'*40,'image':'sha256:'+'b'*64,'oldWeb':{'id':'old-web'},'oldWorker':{'id':'old-worker'},'cookiePath':str(cookie),'nasRollbackManifestPath':str(root/'prior.json')}
   receipt={'phase':'COMPLETE','commit':cfg['commit'],'image':cfg['image'],'web':{'id':'new-web'},'worker':{'id':'new-worker'}}
   (root/'transaction/PUBLICATION_RECEIPT.json').write_text(json.dumps(receipt));(root/'transaction/nas-compatible-rollback-test.json').write_text('{}');(root/'browser-after.json').write_text(json.dumps({'media':[{}, {}, {}]}));(root/'final-media-proof/SUMMARY.json').write_text('{}')
   canon=root/'canonical.json';state={'activeNormalBlueGreenReleaseId':cfg['releaseId'],'normalBlueGreenReleases':{cfg['releaseId']:{'phase':'COMPLETE'}}};canon.write_text(json.dumps(state));pins=[];saves=[]
   tx=SimpleNamespace(folder=root/'transaction',pin=lambda i:pins.append(i['id']),inspect=lambda _: {},run=lambda *a,**k:json.dumps({'passed':True,'historicalMedia':3}).encode(),save=lambda n,v:saves.append(n))
   with patch.object(m,'ROOT',root),patch.object(m,'RID',cfg['releaseId']),patch.object(m,'CANON',canon),patch.object(m,'public_identity',return_value={'id':'db'}),patch.object(m,'environment',return_value={}),patch.object(m.NasController,'check_paid_incidents')as paid,patch('release47_normal_rollback.run',return_value={'check':'PASS'})as rb,patch('nas47_evict_verified.execute',return_value={'deleted':3})as evict:
    bad=copy.deepcopy(receipt);bad['commit']='c'*40;(root/'transaction/PUBLICATION_RECEIPT.json').write_text(json.dumps(bad))
    with self.assertRaisesRegex(Hold,'EXACT_COMPLETE_PUBLICATION_REQUIRED'):m.finish_completed(tx,cfg)
    self.assertFalse(evict.called);(root/'transaction/PUBLICATION_RECEIPT.json').write_text(json.dumps(receipt))
    state['activeNormalBlueGreenReleaseId']='another';canon.write_text(json.dumps(state))
    with self.assertRaisesRegex(Hold,'ACTIVE_COMPLETE_SUCCESSOR_REQUIRED'):m.finish_completed(tx,cfg)
    self.assertFalse(evict.called);state['activeNormalBlueGreenReleaseId']=cfg['releaseId'];canon.write_text(json.dumps(state))
    m.finish_completed(tx,cfg);self.assertEqual(pins,['new-web','new-worker']);self.assertEqual(paid.call_count,2);rb.assert_called_once();evict.assert_called_once();self.assertEqual(json.loads((root/'FINAL_RESULT.json').read_bytes())['mediaLocalDeletion']['deleted'],3)
    with self.assertRaisesRegex(Hold,'FINAL_RESULT_ALREADY_EXISTS'):m.finish_completed(tx,cfg)
    self.assertEqual(evict.call_count,1);self.assertEqual(saves,['POST_EVICTION_MEDIA_ACCEPTANCE.json'])
if __name__=='__main__':unittest.main()
