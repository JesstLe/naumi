/** Real Web application entries + real separate Linux Worker + isolated PG.
 * Supplier and media inspection are explicit loopback HTTP fixtures. Native
 * movie decode/sandbox/capacity is not claimed; task/quote/lease/billing is real. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url),{Pool}=require('pg'),local=process.argv.includes('--local'),baseline=process.argv.includes('--baseline')||local,mode=local?'LOCAL':baseline?'BASELINE':'MODIFIED';
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL).hostname,'r5e-db');assert.equal(process.platform,'linux');
const dir=await mkdtemp('/tmp/naumi-video-owner-'),schema='video_owner_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});await admin.query('CREATE SCHEMA '+schema);
let backend,child,logs='',checks=0,webPosts=0,inspection=0,holding=false,releaseHeld,heldStarted=false;
const calls=[],polls=[],jobs=new Map(),resultBytes=Buffer.from('explicit-synthetic-video-bytes-not-a-native-decoding-test');
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=(value,label)=>{assert.ok(value,label);checks++;},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://fixture'),parts=[];for await(const part of req)parts.push(Buffer.from(part));const bytes=Buffer.concat(parts),raw=bytes.toString();
  const body=String(req.headers['content-type']).startsWith('multipart/form-data')?Object.fromEntries(await new Response(bytes,{headers:{'content-type':req.headers['content-type']}}).formData()):raw?JSON.parse(raw):{};
  const send=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
  if(url.pathname.startsWith('/api/')){webPosts++;res.writeHead(503);return send({error:'Web intentionally unavailable to Worker'});}
  if(url.pathname.startsWith('/internal/config/'))return send({digest:body.digest||'',id:body.id,phase:'applied'});
  if(url.pathname==='/health')return send({ok:true,sandbox:false,version:'explicit-media-transport-fixture',draining:false,running:0,queued:0,terminal:0,maxActive:8});
  if(url.pathname.startsWith('/jobs/')){if(req.method==='POST')inspection++;return send({id:url.pathname.split('/').at(-1),status:'completed',processedSeconds:0,result:{outputs:[],probes:[{durationSeconds:5,width:1280,height:720,videoCodec:'h264',audioCodecs:[],formatName:'mov,mp4',frameRate:24}],stdout:''}});}
  if(url.pathname==='/result.mp4'||url.pathname==='/comfy/view'){res.setHeader('content-type','video/mp4');return res.end(resultBytes);}
  if(url.pathname.endsWith('/object_info'))return send({CLIPTextEncode:{},SaveVideo:{}});
  if(req.method==='POST'&&(url.pathname.endsWith('/v1/videos')||url.pathname.endsWith('/prompt'))){
   const prompt=String(body.prompt&&typeof body.prompt==='object'?Object.values(body.prompt).map(n=>n.inputs?.text||'').join(' '):body.prompt||'');
   const record={path:url.pathname,prompt,model:body.model,authorization:req.headers.authorization,body};calls.push(record);const id='supplier-'+calls.length;
   if(prompt.includes('UNKNOWN_ACCEPTANCE'))return res.destroy();
   if(holding&&prompt.includes('HOLD_CREATE')){heldStarted=true;await new Promise(resolve=>{releaseHeld=resolve;});}
   jobs.set(id,record);return send(url.pathname.endsWith('/prompt')?{prompt_id:id}:{id,status:'processing'});
  }
  if(req.method==='GET'&&(url.pathname.includes('/v1/videos/')||url.pathname.includes('/history/'))){
   const id=decodeURIComponent(url.pathname.split('/').at(-1)),job=jobs.get(id);polls.push({path:url.pathname,authorization:req.headers.authorization,id});
   if(!job){res.statusCode=404;return send({error:'not found'});}
   if(url.pathname.includes('/history/'))return send({[id]:{status:{completed:true,status_str:'success'},outputs:{'2':{videos:[{filename:'result.mp4',subfolder:'',type:'output'}]}}}});
   return send({status:'completed',video_url:origin+'/result.mp4',progress:100});
  }
  console.error('FIXTURE_UNEXPECTED',req.method,url.pathname);res.statusCode=404;return send({error:'Unexpected fixture path '+url.pathname});
 }catch(error){res.statusCode=500;res.end(String(error));}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const media=path.join(dir,'media');await mkdir(media);const secret='video-owner-worker-fixture-01234567890123456789',commit='e'.repeat(40);
Object.assign(process.env,{PGOPTIONS:'-c search_path='+schema,NODE_OPTIONS:'',NAUMI_MULTI_USER:'1',NAUMI_MODEL_CONFIG_ONLY:'1',NAUMI_AUTH_LOGIN_ONLY:'0',FLEET_PORTAL_ONLY:'0',SETTINGS_SECRET:'video-owner-settings-fixture-01234567890123456789',NAUMI_ROUTER_MANAGEMENT_URL:origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-video-owner-router-token-01234567890123456789',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-video-owner-router-envelope-98765432109876543210',MODEL_CONFIG_TRUSTED_ORIGINS:origin,USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK:'true',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'0',MEDIA_DIR:media,MEDIA_JOB_DIR:path.join(dir,'media-jobs'),MEDIA_WORKER_ORIGIN:origin,MEDIA_WORKER_SECRET:'video-owner-media-fixture-01234567890123456789',VIDEO_WORKER_SECRET:secret,VIDEO_PROVIDERS_JSON:'[]',VIDEO_API_KEY:'',NAUMI_VIDEO_WORKER:'0',NAUMI_RELEASE_RUNTIME:'0',NAUMI_APPLICATION_TASK_EXECUTION:'worker',NAUMI_WORKER_EXECUTION:'',NAUMI_INSTANCE_ID:'fixture-video-web',SOURCE_COMMIT:commit,INTERNAL_APP_ORIGIN:origin,OPENAI_API_KEY:'',NEW_API_IMAGE_API_KEY:''});
if(local)process.env.NAUMI_APPLICATION_TASK_EXECUTION='local';
const status=async()=>{try{return await(await fetch(`http://127.0.0.1:${port}/status`,{headers:{'x-video-worker-secret':secret},signal:AbortSignal.timeout(2000)})).json();}catch{return null;}};
const until=async(read,accept,timeout=45000)=>{const end=Date.now()+timeout;let value;while(Date.now()<end){value=await read();if(accept(value))return value;if(child?.exitCode!==null&&child?.exitCode!==undefined)throw Error('Worker exited '+child.exitCode+' '+logs);await sleep(40);}throw Error('Timeout '+JSON.stringify(value)+' '+logs);};
async function control(action){const s=await status(),r=await fetch(`http://127.0.0.1:${port}/control`,{method:'POST',headers:{'x-video-worker-secret':secret,'content-type':'application/json'},body:JSON.stringify({action,bootId:s.bootId,operationId:randomUUID(),expectedRevision:s.revision})});const body=await r.json();eq(r.status,200);return body;}
const start=()=>{const env={...process.env,NAUMI_WORKER_EXECUTION:'direct',NAUMI_INSTANCE_ID:'fixture-independent-video-worker',NAUMI_RELEASE_RUNTIME:'1',NAUMI_RELEASE_ADMISSION_START:'open',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'0',NAUMI_WORKER_STATE_FILE:path.join(dir,'worker.json'),NAUMI_WORKER_CONTROL_PORT:String(port),NAUMI_APP_ORIGIN:origin,VIDEO_WORKER_INTERVAL_MS:'5000'};child=spawn(process.execPath,['/app/scripts/video-worker.mjs'],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);child.done=new Promise(resolve=>child.once('close',resolve));};
try{
 backend=require('/app/fixture/video-ownership.cjs');const data=await backend.seed(origin),sql=backend.pool(),row=async id=>(await sql.query('SELECT status,upstream_id,parameters,poll_lock_until,billing_quote,error_code,error FROM app_video_tasks WHERE id=$1',[id])).rows[0];
 const native=await backend.submitHttp(data,'initial-native');eq(native.status,200);const nativeId=native.body.taskId;ok(nativeId);eq(native.body.cost,6);
 eq((await backend.submitHttp(data,'initial-native')).body.taskId,nativeId);
 if(calls.length!==(baseline?1:0)){const state=await backend.task(data,nativeId);console.error('INITIAL_NATIVE_STATE',JSON.stringify({status:state.status,error:state.error,errorCode:state.errorCode,parametersVersion:state.parameters.version,submissionState:state.parameters.submissionState}));}
 eq(calls.length,baseline?1:0);
 const byoc=await backend.submitByoc(data,'initial-byoc');eq(byoc.cost,0);eq(calls.length,baseline?2:0);
 const wf=await backend.submitWorkflow(data);eq(wf.taskIds.length,baseline?1:0);eq(calls.length,baseline?3:0);
 const beforeRead=calls.length,beforePoll=polls.length;eq((await backend.readSingleHttp(data,nativeId)).status,200);eq((await backend.readHttp(data,nativeId,data.other)).status,404);eq(calls.length,beforeRead);eq(polls.length,beforePoll);
 if(baseline){
  ok((await row(nativeId)).upstream_id);eq((await row(nativeId)).parameters.submissionState,'sending');
  await backend.readHttp(data,nativeId);ok(polls.length>beforePoll);if((await row(nativeId)).status!=='completed')console.error('BASELINE_COMPLETION_STATE',JSON.stringify(await backend.task(data,nativeId)));eq((await row(nativeId)).status,'completed');
  eq((await sql.query("SELECT count(*)::int n,(-sum(delta))::int credits FROM app_ledger WHERE kind='consume'")).rows[0],{n:1,credits:6});
  console.log(`VIDEO_WORKER_OWNERSHIP=PASS mode=${mode} checks=${checks} REAL_PG=1 REAL_HTTP_HANDLERS=1 WEB_CREATE_POSTS=${calls.length} WEB_POLL_EXECUTION=REPRODUCED CONSUME=1 CREDITS=6 REAL_SUPPLIER=0 MEDIA_INSPECTION=FIXTURE`);
 }else{
  eq((await row(nativeId)).upstream_id,'');eq((await row(nativeId)).parameters.submissionState,'prepared');eq((await row(nativeId)).poll_lock_until,null);
  await backend.readHttp(data,nativeId);eq(polls.length,0);eq(calls.length,0);
  const cancelled=await backend.submit(data,'cancel-before-worker');eq((await backend.cancel(data,cancelled.taskId)).status,'cancelled');
  const byocCancelled=await backend.submitByoc(data,'cancel-byoc-before-worker');eq((await backend.cancel(data,byocCancelled.taskId)).status,'cancelled');
  const byocRetry=await backend.retryHttp(data,byocCancelled.taskId,'fixture-byoc-retry');eq(byocRetry.status,202);eq((await row(byocRetry.body.taskId)).poll_lock_until,null);eq((await row(byocRetry.body.taskId)).parameters.submissionState,'prepared');
  eq((await backend.retryHttp(data,byocCancelled.taskId,'fixture-byoc-retry')).body.taskId,byocRetry.body.taskId);
  const sending=await backend.submit(data,'already-sending');await backend.markSending(data,sending.taskId);
  const live=await backend.submit(data,'live-lease');await backend.markLive(data,live.taskId);
  await assert.rejects(backend.submit(data,'insufficient',data.other),error=>error.code==='INSUFFICIENT_CREDITS');checks++;
  eq(calls.length,0);eq((await sql.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
  await backend.publishCurrent(data);start();await until(status,s=>s?.wakeupConnected===true);
  const initial=await until(()=>Promise.all([row(nativeId),row(byoc.taskId),row(byocRetry.body.taskId)]),rows=>rows.every(r=>r.status==='completed'));
  eq(initial[0].billing_quote.requestedCredits,6);eq(initial[0].billing_quote.facts.modelId,'video-a');eq((await row(live.taskId)).status,'queued');
  await until(()=>row(sending.taskId),r=>r.status==='needs_attention');eq((await row(sending.taskId)).error_code,'creation_unknown');
  const finished=await until(()=>backend.readWorkflow(data,wf.runId),value=>value.nodes.every(n=>n.status==='completed'));
  const workflowIds=finished.nodes.map(n=>n.taskId);eq(workflowIds.length,2);for(const id of workflowIds)eq((await row(id)).billing_quote.requestedCredits,6);
  const originalCalls=calls.filter(c=>['initial-native','workflow-A','workflow-B'].includes(c.prompt));eq(originalCalls.length,3);ok(originalCalls.every(c=>c.path==='/native/v1/videos'&&c.authorization==='Bearer original-video-key'&&c.model==='original-wire-video'));
  const comfyCall=calls.find(c=>c.path==='/comfy/prompt');ok(comfyCall);eq(comfyCall.authorization,'Bearer original-byoc-key');
  eq((await sql.query("SELECT count(*)::int n,(-sum(delta))::int credits FROM app_ledger WHERE kind='consume'")).rows[0],{n:3,credits:18});
  eq((await backend.submit(data,'initial-native')).taskId,nativeId);eq(calls.length,5);
  holding=true;const held=await backend.submit(data,'HOLD_CREATE');await until(async()=>heldStarted,v=>v);
  const fast=await backend.fastImage(data);await until(()=>backend.imageResult(data,fast),v=>v.status==='succeeded');ok(releaseHeld);eq((await row(held.taskId)).upstream_id,'');
  const fresh=await backend.submit(data,'fresh-while-video-slow');await until(()=>row(fresh.taskId),r=>r.status==='completed');eq((await row(fresh.taskId)).billing_quote.requestedCredits,17);ok(!calls.some(c=>c.prompt==='live-lease'));
  await control('drain');const pending=await backend.submit(data,'submitted-during-drain');await sleep(250);eq((await row(pending.taskId)).parameters.submissionState,'prepared');ok(!(await status()).tickDrainComplete);
  releaseHeld();holding=false;await until(status,s=>s?.tickDrainComplete===true);ok(!calls.some(c=>c.prompt==='submitted-during-drain'));
  await control('resume');await until(()=>Promise.all([row(pending.taskId),row(held.taskId)]),rows=>rows.every(r=>r.status==='completed'));
  const unknown=await backend.submit(data,'UNKNOWN_ACCEPTANCE');await until(()=>row(unknown.taskId),r=>r.status==='needs_attention');eq((await row(unknown.taskId)).error_code,'creation_unknown');
  const unknownCalls=calls.filter(c=>c.prompt.includes('UNKNOWN_ACCEPTANCE')).length;eq(unknownCalls,1);await backend.readHttp(data,unknown.taskId);await sleep(300);eq(calls.filter(c=>c.prompt.includes('UNKNOWN_ACCEPTANCE')).length,1);
  await control('drain');await until(status,s=>s?.tickDrainComplete===true);child.kill('SIGTERM');eq(await child.done,0);child=undefined;
  start();await until(status,s=>s?.phase==='QUIESCENT');await control('resume');await sleep(600);eq(calls.filter(c=>c.prompt.includes('UNKNOWN_ACCEPTANCE')).length,1);eq((await row(live.taskId)).status,'queued');
  eq((await sql.query("SELECT count(*)::int n,(-sum(delta))::int credits FROM app_ledger WHERE kind='consume'")).rows[0],{n:6,credits:69});eq(webPosts,0);
  const nativeSaved=await backend.task(data,nativeId),asset=nativeSaved.parameters.resultAssets[0];eq(asset.sha256,createHash('sha256').update(resultBytes).digest('hex'));ok(asset.storageKey);eq(nativeSaved.status,'completed');
  await control('drain');await until(status,s=>s?.tickDrainComplete===true);child.kill('SIGTERM');eq(await child.done,0);child=undefined;
  console.log(`VIDEO_WORKER_OWNERSHIP=PASS mode=MODIFIED checks=${checks} REAL_PG=1 REAL_HTTP_HANDLERS=1 REAL_CHILD=1 WEB_CREATE_POSTS=0 WEB_POLL_EXECUTION=0 ORIGINAL_PRICE6_CURRENT17=1 NATIVE_BYOC_WORKFLOW=1 BYOC_RETRY_READY=1 SUPPLIER_POSTS=${calls.length} CONSUME=6 CREDITS=69 UNKNOWN_NO_REPOST=1 SENDING_NO_POST=1 LIVE_LEASE_PRESERVED=1 CANCEL_NO_POST=1 SLOW_VIDEO_IMAGE_FAIRNESS=1 DRAIN_PENDING=1 RESTART=1 WEB_HTTP_REENTRY=0 RESULT_HASH=1 REAL_SUPPLIER=0 MEDIA_INSPECTION=FIXTURE`);
 }
}finally{
 releaseHeld?.();if(child?.exitCode===null){child.kill('SIGTERM');await child.done;}
 await writeFile('/evidence/'+mode+'_VIDEO_CHILD.log',logs);await backend?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();await rm(dir,{recursive:true,force:true});console.log('VIDEO_WORKER_OWNERSHIP_CLEANUP=PASS CHILD_STOPPED=1 RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_HTTP_CLOSED=1 TEMP_MEDIA_REMOVED=1');
}
