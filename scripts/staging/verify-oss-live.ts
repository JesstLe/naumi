// Live probe of the exact candidate storage module and standalone media route.
// No model call, DB, existing object write, or staging app configuration change.
import assert from 'node:assert/strict';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {writeFile, rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

const root='/evidence';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const started=new Date().toISOString();
const key='naumi-staging-preflight/'+randomUUID()+'.bin';
const bytes=randomBytes(1024);
const receipt:any={version:1,started,key,commit:process.env.NAUMI_PROBE_COMMIT,image:process.env.NAUMI_PROBE_IMAGE,configSha256:process.env.NAUMI_PROBE_CONFIG_HASH,payloadSha256:sha(bytes),passed:false,putAttempted:false,cleanup:'NOT_ATTEMPTED'};
let storage:any,app:ReturnType<typeof spawn>|undefined;
let phase='IMPORT';
async function saveReceipt(){
 await writeFile(root+'/receipt.json.tmp',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 await rename(root+'/receipt.json.tmp',root+'/receipt.json');
}
try{
 await saveReceipt(); // Keep the exact key before any real network write.
 storage=await import(pathToFileURL('/source/src/lib/storage.ts').href);
 assert.equal(storage.storageDriver,'s3');assert.equal(storage.storageEnabled,true);
 phase='PUT';receipt.putAttempted=true;
 await saveReceipt();
 const url=await storage.uploadImage(bytes,'application/octet-stream',key);
 assert.equal(url,'/media/'+key);
 phase='HEAD';assert.equal(await storage.managedObjectExists(url),true);
 phase='GET';const read=await storage.readManagedObject(url);assert.deepEqual(read.bytes,bytes);
 phase='RANGE';const partial=await storage.fetchStoredObject(key,'bytes=0-127');assert.equal(partial.status,206);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(0,128));
 phase='PRIVATE_READ';
 const anonymous=new URL(process.env.S3_ENDPOINT!);anonymous.hostname=process.env.S3_BUCKET+'.'+anonymous.hostname;anonymous.pathname='/'+key;
 const anon=await fetch(anonymous,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 assert.equal(anon.status,403);await anon.body?.cancel();
 phase='FIXED_MEDIA';
 app=spawn(process.execPath,['/app/server.js'],{env:{...process.env,PORT:'18033',HOSTNAME:'127.0.0.1',DATABASE_URL:''},stdio:'ignore'});
 const origin='http://127.0.0.1:18033';
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,150));}
 assert.equal(ready,true);
 const media=await fetch(origin+url,{signal:AbortSignal.timeout(120000)});assert.equal(media.status,200);assert.deepEqual(Buffer.from(await media.arrayBuffer()),bytes);
 const mediaRange=await fetch(origin+url,{headers:{Range:'bytes=0-127'},signal:AbortSignal.timeout(120000)});assert.equal(mediaRange.status,206);assert.deepEqual(Buffer.from(await mediaRange.arrayBuffer()),bytes.subarray(0,128));
 receipt.passed=true;
 console.log('OSS_LIVE_READWRITE=PASS PUT=1 HEAD=1 GET_HASH=IDENTICAL RANGE=206 ANONYMOUS=403 FIXED_MEDIA=200 FIXED_RANGE=206 MODEL_CALLS=0 DB=NONE');
}catch{
 receipt.failedPhase=phase;
 console.log('OSS_LIVE_READWRITE=FAIL PHASE='+phase+' CONFIG_REDACTED=1');
 process.exitCode=2;
}finally{
 if(app){app.kill('SIGTERM');await new Promise<void>(r=>{if(app!.exitCode!==null)r();else app!.once('exit',()=>r())});}
 if(storage&&receipt.putAttempted){
  phase='CLEANUP';
  // A timed-out PUT may have reached OSS, so deletion is attempted even on failure.
  try{
   const deleted=await storage.deleteImageByUrl('/media/'+key);
   const response=await storage.fetchStoredObject(key);
   receipt.cleanup=deleted&&response.status===404?'PASS':'FAIL';await response.body?.cancel();
  }catch{receipt.cleanup='FAIL';}
  console.log('OSS_LIVE_CLEANUP='+receipt.cleanup+' EXISTING_OBJECTS_CHANGED=0');
 }
 if(receipt.cleanup!=='PASS'){receipt.passed=false;process.exitCode=74;}
 receipt.ended=new Date().toISOString();receipt.exitStatus=process.exitCode||0;
 await saveReceipt();
 console.log('OSS_LIVE_RECEIPT=PERSISTED STAGING_DRIVER_UNCHANGED=1');
}
