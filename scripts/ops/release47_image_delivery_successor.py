"""Image-delivery successor. Reads existing real outputs during standby readiness."""
import json,pathlib,uuid,copy
import release47_controls as controls
import release47_normal_policy as normal
import release47_normal_controller as ctl
from release47_bi_successor import BiController
from release47_host import require

class ImageDeliveryController(BiController):
 def drain_proof(self):
  app=controls.app_status(self.tx,self.web);domain=self.request(self.web,'/api/video/worker/drain-status')
  worker=self.worker_control(self.worker,'status',str(uuid.uuid4()))['state'];rows,held=self.incidents()
  proof=None
  # The endpoint is shared-DB. New-slot image jobs must not be mistaken for
  # old-slot work. Exclude ONLY exact fresh new-boot claims; unknown fences,
  # other domains, transactions and advisory locks still prevent retirement.
  if domain.get('counts',{}).get('imageJobs',0)>0:
   live=controls.app_status(self.tx,self.newweb)['identity'];name=live['instanceId'];boot=live['bootId']
   require(name==self.cfg['newWebName'] and live['commit']==self.cfg['commit'],'NEW_SLOT_CLAIM_IDENTITY_CHANGED')
   proof=self.sql("SELECT json_build_object('total',count(*),'unowned',count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM app_release_activities a WHERE a.instance_id='"+name+"' AND a.boot_id='"+boot+"' AND a.state='active' AND a.claim_token=j.lease_token AND a.work_key=j.kind||':'||j.id AND a.heartbeat_at>now()-interval '35 seconds'))) FROM app_image_jobs j WHERE j.lease_token IS NOT NULL AND j.snapshot->>'status' NOT IN ('done','error','needs_attention') AND NOT EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows h WHERE h.table_name='app_image_jobs' AND h.row_key=j.id);")[0]
   if proof['total']==domain['counts']['imageJobs'] and proof['unowned']==0:
    raw=copy.deepcopy(domain);domain=copy.deepcopy(domain);domain['counts']['imageJobs']=0;domain['activeFences']=sum(domain['counts'].values());domain['drained']=domain['activeFences']==0 and domain['activeTransactions']==0 and domain['advisoryLocks']==0
    proof={'newBootClaims':proof,'rawSharedDomain':raw,'newWebIdentity':live}
  result=normal.current_drained(app,domain,worker,self.owners(),rows,held,self.incident_digest,self.cfg.get('preservedWorkerTick'))
  if proof:result['excludedProvenNewSlotImageWork']=proof
  return result

 def ready(self):
  result=super().ready()
  proof=[]
  for operation in self.cfg['imageAcceptanceOperations']:
   receipt=self.request(self.newweb,'/api/imagegen?operationId='+operation)
   require(receipt.get('status')=='succeeded' and receipt.get('artifacts'),'EXISTING_IMAGE_RECEIPT_NOT_DELIVERED')
   for artifact in receipt['artifacts']:
    js="""const fs=require('fs'),crypto=require('crypto');(async()=>{const p=JSON.parse(fs.readFileSync(0,'utf8'));const r=await fetch('http://127.0.0.1:3000'+p.url,{headers:{cookie:p.cookie}});if(!r.ok)throw Error('MEDIA_HTTP_'+r.status);const b=Buffer.from(await r.arrayBuffer());const m=await require('sharp')(b).metadata();await require('sharp')(b).resize(1,1).raw().toBuffer();console.log(JSON.stringify({status:r.status,bytes:b.length,width:m.width,height:m.height,sha256:crypto.createHash('sha256').update(b).digest('hex')}));})().catch(e=>{console.error(e.message);process.exit(1)});"""
    media=json.loads(self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',self.newweb['id'],'node','-e',js],stdin=json.dumps({'url':artifact['url'],'cookie':self.cookie}).encode(),timeout=45))
    require(media['width']==artifact['width'] and media['height']==artifact['height'] and media['bytes']>1000,'ACTUAL_IMAGE_DECODE_FAILED')
    proof.append({'operationId':operation,'artworkId':artifact['artworkId'],**media})
  self.tx.save('IMAGE_DELIVERY_HTTP_ACCEPTANCE.json',{'images':proof,'newSupplierPosts':0,'kind':'existing-real-image-readback'})
  result['imageDelivery']=proof
  return result

def main():
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--config',required=True,type=pathlib.Path);a=p.parse_args()
 cfg=json.loads(a.config.read_bytes());ctl.configure(cfg)
 with ctl.transaction() as tx:
  print('THREE_LOCKS=ACQUIRED',flush=True);op=ImageDeliveryController(tx,cfg)
  try:op.run()
  except BaseException as e:op.recover_failure(e);raise
 print('THREE_LOCKS=RELEASED',flush=True)
if __name__=='__main__':main()
