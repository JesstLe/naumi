"""NAS repair through the existing incident-preserving 47 blue/green operator.

The original root journal remains historical evidence. Its current publication
must already be COMPLETE; fresh unknown work still blocks creating a candidate.
"""
import json,pathlib
import release47_recovery_supervisor as recovery
import release47_normal_controller as ctl
from release47_image_delivery_successor import ImageDeliveryController
from release47_host import require,file_sha,public_identity

AUTHORIZATION='那你把上一轮发布未收尾的问题处理好，然后把这次修复上线，别影响正在使用的用户。'

def memory_growth_budget(available_mib,current_mib,final_mib):
 require(type(final_mib)is int and final_mib==3072,'EXACT_FINAL_MEMORY_REQUIRED')
 require(available_mib>=max(0,final_mib-current_mib)+1024+128,'FINAL_RAM_RESERVE_INSUFFICIENT')
 return {'availableMiB':available_mib,'currentUsageMiB':current_mib,'finalMiB':final_mib,'hostReserveMiB':1024,'workerReserveMiB':128}

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
 def after_retirement(self):
  for old in [self.web,self.worker]:
   row=self.tx.inspect(old['id']);require(not row['State']['Running']and row['HostConfig']['RestartPolicy']['Name']=='no','OLD_SLOT_NOT_RETIRED')
  row=self.tx.inspect(self.newweb['id']);before=row['State']['StartedAt']
  memory=pathlib.Path('/sys/fs/cgroup/system.slice/docker-'+row['Id']+'.scope/memory.current')
  current=(int(memory.read_text())+1048575)//1048576
  available=int(next(l.split()[1]for l in pathlib.Path('/proc/meminfo').read_text().splitlines()if l.startswith('MemAvailable:')))//1024
  proof=memory_growth_budget(available,current,self.cfg['webFinalMemoryMiB'])
  self.tx.save('MEMORY_GROWTH_PREFLIGHT.json',proof)
  def grow(_):
   self.tx.run(['docker','update','--memory=3072m','--memory-swap=3072m',row['Id']])
   changed=self.tx.inspect(row['Id']);require(changed['HostConfig']['Memory']==3072*1048576 and changed['HostConfig']['MemorySwap']==3072*1048576 and changed['State']['StartedAt']==before,'MEMORY_UPDATE_OR_PROCESS_CHANGED')
   path=pathlib.Path(self.state['runtimeRecovery']['manifestPath']);manifest=json.loads(path.read_bytes())
   self.tx.save('SUPERVISOR_BEFORE_MEMORY.json',manifest)
   manifest['web']['staticSha256']=recovery.static_pin(changed);manifest['web']['memoryMiB']=3072
   ctl.save(path,manifest);self.state['runtimeRecovery'].update(manifestSha256=recovery.sha(recovery.encoded(manifest)),memoryMiB=3072);self.persist()
   return {**proof,'running':True,'sameProcessStartedAt':before,'restartExecuted':False,'manifestUpdated':True}
  self.op('new-web-memory-grow',grow)

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
