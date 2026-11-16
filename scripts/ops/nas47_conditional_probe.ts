import {createHash,randomUUID} from 'node:crypto';
import {createObjectStorage} from '../../src/lib/object-storage/adapter';
import {storageConfiguration} from '../../src/lib/object-storage/config';
async function main(){
 const b=createObjectStorage(storageConfiguration(process.env)),key='qa/nas47-backfill-conditional-'+randomUUID()+'.bin';
 const first=Buffer.from('nas47-original-'+randomUUID()),other=Buffer.from('nas47-replacement-'+randomUUID());let created=false,status=0;
 try{
  await b.put(key,first,'application/octet-stream','private, max-age=0',{ifAbsent:true});created=true;
  try{await b.put(key,other,'application/octet-stream','private, max-age=0',{ifAbsent:true});}catch(e){status=(e as any).status;}
  const response=await b.get(key),bytes=Buffer.from(await response.arrayBuffer());
  if(status!==412||response.status!==200||!bytes.equals(first)){console.log(JSON.stringify({test:'REAL_GARAGE_CONDITIONAL_CREATE',secondPutStatus:status,getStatus:response.status,originalPreserved:bytes.equals(first)}));throw Error('CONDITIONAL_CREATE_NOT_ENFORCED');}
  console.log(JSON.stringify({test:'REAL_GARAGE_CONDITIONAL_CREATE',secondPutStatus:status,getStatus:response.status,originalPreserved:true,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}));
 }finally{if(created){await b.delete(key);console.log('OWN_QA_KEY_REMOVED=1');}}
}
main().catch(e=>{console.error(JSON.stringify({error:'CONDITIONAL_PROBE_FAILED',status:e.status||null,code:e.code||null}));process.exitCode=1;});
