"""Resume fixed image successor after acknowledged cutover; never replay prior actions."""
import json,pathlib,uuid,time
import release47_normal_controller as ctl
import release47_controls as c
import release47_normal_policy as normal
import release47_task_snapshot as tasks
from release47_host import require,sha
from release47_image_delivery_successor import ImageDeliveryController
from release47_normal_controller import now,ROOT,RELEASE
policy=ctl.policy
class Resumed(ImageDeliveryController):
 def finish_tail(self):
  if self.succ['phase']=='SWITCHED':
   self.op('new-worker-resume',lambda op:self.worker_control(self.newworker,'resume',op))
   self.wait(lambda:(lambda s:s if normal.worker_completed(s) else None)(self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state']),'NEW_WORKER_SERVER_RECEIPT',90)
   self.phase('WORKER_ACTIVE')
   self.post=tasks.collect_task_snapshot(self.tx.run,self.db,self.tx.save,previous=self.pre.private,projection='proof',row_limit=self.pre.private.get('rowLimit',1000),allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=self.cfg.get('snapshotStatementTimeoutMs',5000))
  from release47_completed_image_proof import reviewed_completion
  proof=json.loads((ROOT/'completed-image-delivery-proof.json').read_bytes())
  comparison=reviewed_completion(self.pre,self.post,proof);self.tx.save('task-preservation-reviewed-comparison.json',comparison)
  require(comparison['preservationVerified'],'TASK_PRESERVATION_NOT_VERIFIED')
  # The domain reader is shared-DB, not old-slot-specific. Pause the new scan
  # at the final retirement barrier so its own read transaction cannot be
  # mistaken for undrained old work. Keep the completed tick receipt intact.
  self.op('new-worker-retirement-barrier',lambda op:self.worker_control(self.newworker,'drain',op))
  self.wait(lambda:(lambda s:s if normal.worker_quiescent(s) else None)(self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state']),'NEW_WORKER_RETIREMENT_BARRIER',120)
  # Repeated current-execution proof, including exact immutable held incident.
  self.wait(lambda:self.drain_proof(),'REPEATED_CURRENT_DRAIN',60);time.sleep(2);self.wait(lambda:self.drain_proof(),'FINAL_CURRENT_DRAIN',60)
  require(('http://127.0.0.1:'+str(self.cfg['oldPort'])) not in self.tx.run(['nginx','-T']).decode(),'OLD_ROUTE_STILL_REFERENCED')
  self.reference_proof()
  self.install_supervisor()
  for identity in [self.worker,self.web]:
   self.wait(lambda:self.drain_proof(),'RETIREMENT_CURRENT_DRAIN',120) if identity is self.worker else None
   self.op('retire-'+identity['id'][:12],lambda _,identity=identity:self.stop_exact(identity))
   self.succ['retired'].append(identity['id']);self.persist()
  self.op('new-worker-after-retirement',lambda op:self.worker_control(self.newworker,'resume',op))
  self.wait(lambda:(lambda s:s if normal.worker_completed(s) else None)(self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state']),'NEW_WORKER_FINAL_COMPLETION',90)
  from release47_normal_rollback import run as rollback_check
  rollback_check(self.cfg,apply=False,existing_tx=self.tx)
  self.state['activeNormalBlueGreenReleaseId']=RELEASE
  require(self.configuration_facts()==self.config_before,'MODEL_OR_BILLING_CONFIGURATION_CHANGED')
  self.phase('COMPLETE',completedAt=now(),paidOutputRecovered=False,historicalDrainReclassified=False)
  for identity in self.infra:self.tx.pin(identity)
  rows,held=self.incidents();policy.check_incidents(rows,held,self.incident_digest)
  self.tx.run(['systemctl','start','naumi47-recovery.timer'])
  result={'phase':'COMPLETE','historicalReleasePhase':self.state['phase'],'historicalDrainProven':False,'carriedIncidents':2,'paidOutputRecovered':False,'version':self.cfg['version'],'commit':self.cfg['commit'],'image':self.cfg['image'],'web':self.newweb,'worker':self.newworker,'at':now(),'supplierGenerationReplays':0,'databaseRestored':False}
  self.tx.save('PUBLICATION_RECEIPT.json',result);print('PUBLICATION_RESULT='+json.dumps(result),flush=True)


def main():
 import argparse
 global ROOT,RELEASE
 p=argparse.ArgumentParser();p.add_argument('--config',type=pathlib.Path,required=True);a=p.parse_args();cfg=json.loads(a.config.read_bytes());ctl.configure(cfg);ROOT=ctl.ROOT;RELEASE=ctl.RELEASE
 with ctl.transaction()as tx:
  op=Resumed(tx,cfg);op.succ=op.state['normalBlueGreenReleases'][cfg['releaseId']]
  require(op.succ['phase']in ['SWITCHED','WORKER_ACTIVE'] and all(x['phase']=='ACKNOWLEDGED'for x in op.succ['operations'].values()),'EXACT_SWITCHED_RESUME_REQUIRED')
  require(op.succ['phase']=='WORKER_ACTIVE' or 'new-worker-resume'not in op.succ['operations'],'NEW_WORKER_ALREADY_RESUMED')
  op.newweb=op.succ['operations']['web-start']['receipt'];op.newworker=op.succ['operations']['worker-start']['receipt'];op.switched=True;op.worker_paused=True;op.old_drained=True
  report=json.loads((ROOT/'gateway-forward/report.json').read_bytes());op.dump=(ROOT/'gateway-forward/nginx.before.txt').read_text();op.after_dump=(ROOT/'gateway-forward/nginx.after.txt').read_text()
  require(sha(tx.run(['nginx','-T']))==report['afterDumpSha256'],'RESUME_ENTRY_CHANGED')
  parsed=ctl.compat.Dump(op.dump);op.before={n:pathlib.Path(n).read_bytes()for n in parsed.files}
  for item in report['patches']:op.before[item['path']]=(ROOT/'gateway-forward'/item['before']).read_bytes()
  op.after={x['path']:(ROOT/'gateway-forward'/x['after']).read_bytes()for x in report['patches']};op.candidate_closure={**op.before,**op.after};op.real={n:str(pathlib.Path(n).resolve())for n in op.before};op.rollback=json.loads((tx.folder/'gateway-rollback.json').read_bytes())
  op.config_before=json.loads((tx.folder/'configuration-before.json').read_bytes());require(op.configuration_facts()==op.config_before,'FROZEN_CONFIG_CHANGED')
  op.incident_digest=json.loads((tx.folder/'preserved-incidents.json').read_bytes())['sha256']
  snapshots=sorted(tx.folder.glob('task-snapshot-*.json'),key=lambda p:p.stat().st_mtime);require(len(snapshots)==(2 if op.succ['phase']=='WORKER_ACTIVE' else 1),'EXACT_BASELINE_REQUIRED');private=json.loads(snapshots[0].read_bytes());op.pre=tasks.Snapshot(public=tasks.summarize(private),private=private)
  if len(snapshots)==2:
   private=json.loads(snapshots[1].read_bytes());op.post=tasks.Snapshot(public=tasks.summarize(private),private=private)
  drained=op.wait(lambda:op.drain_proof(),'OWNED_OLD_SLOT_DRAIN',120);tx.save('resumed-owned-current-drain-'+uuid.uuid4().hex+'.json',drained)
  op.finish_tail()
 print('THREE_LOCKS=RELEASED',flush=True)
if __name__=='__main__':main()
