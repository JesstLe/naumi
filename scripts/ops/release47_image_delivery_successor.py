"""Image-delivery successor. Reads existing real outputs during standby readiness."""
import json,pathlib
import release47_normal_controller as ctl
from release47_bi_successor import BiController
from release47_host import require

class ImageDeliveryController(BiController):
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
