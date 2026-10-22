"""NAS repair through the existing incident-preserving 47 blue/green operator.

The original root journal remains historical evidence. Its current publication
must already be COMPLETE; fresh unknown work still blocks creating a candidate.
"""
import json,pathlib
import release47_normal_controller as ctl
from release47_image_delivery_successor import ImageDeliveryController
from release47_host import require,file_sha,public_identity

AUTHORIZATION='那你把上一轮发布未收尾的问题处理好，然后把这次修复上线，别影响正在使用的用户。'

def predecessor_check(state, config):
 require(config.get('authorization')==AUTHORIZATION,'EXACT_NAS_RELEASE_AUTHORIZATION_REQUIRED')
 active=state.get('activeNormalBlueGreenReleaseId')
 require(active==config.get('predecessorReleaseId'),'ACTIVE_PUBLICATION_CHANGED')
 journal=state.get('normalBlueGreenReleases',{})
 require(journal.get(active,{}).get('phase')=='COMPLETE','PRIOR_PUBLICATION_NOT_COMPLETE')
 require(all(v.get('phase') in ['COMPLETE','ROLLED_BACK'] and
   all(o.get('phase')=='ACKNOWLEDGED'for o in v.get('operations',{}).values())for v in journal.values()),
   'PRIOR_OPERATION_NOT_RECONCILED')
 require(state.get('legacyDrainProven') is False and state.get('phase')=='MIGRATED_CLEANUP_PENDING',
   'HISTORICAL_INCIDENTS_MUST_REMAIN_EXPLICIT')

class NasController(ImageDeliveryController):
 def ready(self):
  result=super().ready()
  script=pathlib.Path(self.cfg['storageAcceptanceScript'])
  require(script.parent==ctl.ROOT/'tools' and file_sha(script)==self.cfg['storageAcceptanceSha256'],
    'FIXED_STORAGE_ACCEPTANCE_REQUIRED')
  raw=self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',self.newweb['id'],'node'],stdin=script.read_bytes(),timeout=90)
  proof=json.loads(raw)
  require(proof.get('passed')is True and proof.get('actualUpload')is True and
    proof.get('verificationDataCleaned')is True and proof.get('supplierCalls')==0,'REAL_NAS_ACCEPTANCE_FAILED')
  self.tx.save('NAS_STORAGE_HTTP_ACCEPTANCE.json',proof)
  return {**result,'nasStorage':proof}

def main(config_path):
 cfg=json.loads(pathlib.Path(config_path).read_bytes());ctl.configure(cfg)
 require(cfg['releaseId'].startswith('release47-nas-upload-'),'NAS_RELEASE_ID_REQUIRED')
 with ctl.transaction()as tx:
  print('THREE_LOCKS=ACQUIRED',flush=True)
  state=json.loads(ctl.CANON.read_bytes());predecessor_check(state,cfg)
  # Verify the latest publication's retired slots; never stop them as cleanup.
  prior=state['normalBlueGreenReleases'][state['activeNormalBlueGreenReleaseId']]
  retired=[]
  for identifier in prior['retired']:
   row=public_identity(tx.inspect(identifier));require(not row['running']and row['restartPolicy']=='no','PREVIOUS_SLOT_STILL_RUNNING')
   retired.append(row)
  require(len(retired)==2,'PREVIOUS_RETIREMENT_INCOMPLETE')
  tx.save('PREDECESSOR_PUBLICATION_RECONCILED.json',{'releaseId':prior['releaseId'],'phase':prior['phase'],
    'retired':retired,'historicalDrainReclassified':False,'historicalUnknownsCleared':False})
  op=NasController(tx,cfg)
  try:op.run()
  except BaseException as error:op.recover_failure(error);raise
 print('THREE_LOCKS=RELEASED',flush=True)
