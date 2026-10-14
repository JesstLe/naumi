import 'server-only';
import {mkdir,writeFile,rename,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {centralUrl} from './contracts';
import {verifyRelease,releaseResultSchema} from './release-wire';
export async function relayRelease(options:{central:string;instanceId:string;token:string;publicKey:string;inbox:string;outbox:string;isolated?:boolean}){
  const central=centralUrl(options.central,options.isolated);for(const p of [options.inbox,options.outbox])if(!path.isAbsolute(p))throw Error('RELEASE_PATH_REQUIRED');
  async function send(endpoint:string,body:unknown){const response=await fetch(central+'/api/fleet/releases/'+endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',authorization:'Bearer '+options.token,'x-naumi-instance':options.instanceId},body:JSON.stringify({nonce:randomUUID(),timestamp:Date.now(),...body as object})});if(!response.ok)throw Error('FLEET_RELEASE_STATUS_'+response.status);const reader=response.body?.getReader();if(!reader)throw Error('EMPTY');const chunks:Uint8Array[]=[];let bytes=0;try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>20000)throw Error('TOO_LARGE');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  let acknowledged=0;
  await mkdir(options.inbox,{recursive:true,mode:0o700});
  const results=await readdir(options.outbox).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;});
  for(const file of results.filter(f=>/^[a-f0-9-]{36}\.json$/i.test(f))){
    if(acknowledged>=20)break;
    const marker=path.join(options.inbox,file+'.ack');if(await readFile(marker).then(()=>true).catch(()=>false))continue;
    const raw=await readFile(path.join(options.outbox,file));if(raw.byteLength>2000)throw Error('RESULT_TOO_LARGE');const result=releaseResultSchema.parse(JSON.parse(raw.toString()));if(result.planId+'.json'!==file)throw Error('RESULT_ID_MISMATCH');await send('ack',{result});await writeFile(marker,'acknowledged',{mode:0o600});acknowledged++;
  }
  const data=await send('poll',{});if(!data.release)return {queued:0,acknowledged};const job=verifyRelease(data.release,options.publicKey,options.instanceId);
  await mkdir(options.inbox,{recursive:true,mode:0o700});const destination=path.join(options.inbox,job.id+'.json'),temp=destination+'.'+randomUUID()+'.tmp';
  const previous=await readFile(destination,'utf8').catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;});
  if(previous!==null){const saved=JSON.parse(previous);if(saved.payload!==data.release.payload||saved.signature!==data.release.signature)throw Error('RELEASE_LEASE_CONFLICT');return {queued:0,acknowledged};}
  // Signed bytes are the only input; the relay never opens Docker or an SSH socket.
  await writeFile(temp,JSON.stringify(data.release),{mode:0o600,flag:'wx'});await rename(temp,destination);return {queued:1,acknowledged};
}
