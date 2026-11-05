/** Linux real Web-use-case process + actual separate direct scanner + PG.
 * Fixed old image provides Node/native libs only. Candidate source is mounted.
 * No stub claim/queue/billing/worker implementation; synthetic local supplier. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url),{Pool}=require('pg'),baseline=process.argv.includes('--baseline'),mode=baseline?'BASELINE':'MODIFIED';
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL).hostname,'r5c-db');assert.equal(process.platform,'linux');
const dir=await mkdtemp('/tmp/naumi-image-owner-'),schema='image_owner_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});await admin.query('CREATE SCHEMA '+schema);
let backend,child,logs='',provider=0,webPosts=0,checks=0,releaseFirst,holding=false,holdAt=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=a=>{assert.ok(a);checks++;},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pixels=require('sharp')({create:{width:1024,height:1024,channels:3,background:'#b1c4dc'}}).png().toBuffer();
const web=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/api/')){webPosts++;res.writeHead(503);res.end('Web intentionally unavailable');return;}
  if(/\/images\/(generations|edits)$/.test(req.url)){provider++;for await(const part of req){void part;}if(holding&&provider===holdAt)await new Promise(resolve=>{releaseFirst=resolve;});res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{b64_json:(await pixels).toString('base64')}]}));return;}
  res.writeHead(500);res.end('Unexpected fixture endpoint '+req.url);
 }catch(error){res.writeHead(500);res.end(String(error));}
});await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+web.address().port;
const media=path.join(dir,'media');await mkdir(media);const secret='image-owner-fixture-secret-01234567890123456789',commit='d'.repeat(40);
Object.assign(process.env,{PGOPTIONS:'-c search_path='+schema,NODE_OPTIONS:'',SETTINGS_SECRET:'image-owner-fixture-settings-01234567890123456789',NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_DIR:media,MEDIA_PRIVATE:'0',OPENAI_API_KEY:'fixture-no-external',OPENAI_BASE_URL:origin+'/v1',OPENAI_IMAGE_MODEL:'gpt-image-2',OPENAI_IMAGE_MODELS:'gpt-image-2',NEW_API_IMAGE_API_KEY:'',NAUMI_ROUTER_MANAGEMENT_URL:'',NAUMI_ROUTER_MANAGEMENT_TOKEN:'',VIDEO_PROVIDERS_JSON:'[]',VIDEO_API_KEY:'',MEDIA_WORKER_ORIGIN:'',NAUMI_VIDEO_WORKER:'0',VIDEO_WORKER_SECRET:secret,SOURCE_COMMIT:commit,NAUMI_INSTANCE_ID:'fixture-web',NAUMI_RELEASE_RUNTIME:'0',NAUMI_APPLICATION_TASK_EXECUTION:'worker',NAUMI_WORKER_EXECUTION:'',INTERNAL_APP_ORIGIN:origin});
const until=async(read,accept,timeout=45000)=>{const end=Date.now()+timeout;let value;while(Date.now()<end){value=await read();if(accept(value))return value;if(child?.exitCode!==null&&child?.exitCode!==undefined)throw Error('Scanner exited '+child.exitCode+' '+logs);await sleep(35);}throw Error('Timeout '+JSON.stringify(value)+' '+logs);};
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const status=async()=>{try{const r=await fetch(`http://127.0.0.1:${port}/status`,{headers:{'x-video-worker-secret':secret},signal:AbortSignal.timeout(2000)});return await r.json();}catch{return null;}};
const control=async(action)=>{const s=await status(),r=await fetch(`http://127.0.0.1:${port}/control`,{method:'POST',headers:{'x-video-worker-secret':secret,'content-type':'application/json'},body:JSON.stringify({action,bootId:s.bootId,operationId:randomUUID(),expectedRevision:s.revision})});eq(r.status,200);return r.json();};
try{
 backend=require('/app/fixture/'+mode.toLowerCase()+'-ownership.cjs');const data=await backend.seed(),sql=backend.pool(),row=async id=>(await sql.query('SELECT snapshot,payload,lease_token,billing_settled FROM app_image_jobs WHERE id=$1',[id])).rows[0];
 eq(await backend.kickHttp(data),[200,200,200,200]);await sleep(250);
 if(baseline){await until(async()=>Promise.all(Object.values(data.ids).map(row)),rows=>rows.every(r=>r.snapshot.status==='done'));eq((await sql.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,3);}
 else{for(const id of Object.values(data.ids)){eq((await row(id)).snapshot.status,'pending');eq((await row(id)).lease_token,null);}eq(backend.backgroundWorkCount(),0);}
 const newId=await backend.submitNewGeneration(data);ok(typeof newId==='string');
 if(baseline){await until(()=>row(newId),r=>r.snapshot.status==='done');eq(provider,1);}else{eq((await row(newId)).snapshot.status,'pending');eq((await row(newId)).lease_token,null);eq(provider,0);eq((await row(newId)).payload.billingQuote,data.quotes.generate);}
 const post=await backend.submitPostprocess(data),postId='imagegen-'+post.request.operationId,batch=await backend.submitBatch(data);
 await backend.postprocessResult(data,post);eq((await backend.readBatch(data,batch)).status,200);eq((await backend.readBatch(data,batch,'other@fixture.test')).status,404);
 const wb=await backend.newWorkbench(data);eq(wb.cancelStatus,400);eq(wb.cancelState,'preview');
 const stored=await backend.newStored(data);eq((await backend.requestStored(data,stored.id,'other@fixture.test')).status,409);
 const mixed=await backend.newStored(data);await backend.addUnknownStoredAttempt(mixed);eq((await backend.requestStored(data,mixed.id)).status,409);eq((await row(mixed.id)).snapshot.deliveryRecoveryRequested,undefined);
 const storedReply=await backend.requestStored(data,stored.id);eq(storedReply.status,200);
 if(baseline){
  eq(storedReply.body.complete,true);eq((await row(stored.id)).snapshot.status,'done');
  try{await backend.recoverImagegenBatches();}catch{ /* Real old HTTP503 is expected. */ }ok(webPosts>0);eq(provider,1);
  console.log(`IMAGE_WORKER_OWNERSHIP=PASS mode=BASELINE checks=${checks} WEB_EXECUTION=REPRODUCED BATCH_WEB_POSTS=${webPosts} SUPPLIER_POSTS=${provider} REAL_PG=1 REAL_HANDLERS=1`);
 }else{
  eq(storedReply.body.queued,true);eq((await row(stored.id)).snapshot.deliveryRecoveryRequested,true);eq((await row(postId)).snapshot.status,'pending');eq((await sql.query('SELECT count(*)::int n FROM app_imagegen_batches WHERE id=$1',[wb.id])).rows[0].n,0);eq(provider,0);eq(webPosts,0);
  const env={...process.env,NAUMI_WORKER_EXECUTION:'direct',NAUMI_INSTANCE_ID:'fixture-independent-worker',NAUMI_RELEASE_RUNTIME:'1',NAUMI_RELEASE_ADMISSION_START:'open',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'0',NAUMI_WORKER_STATE_FILE:path.join(dir,'worker.json'),NAUMI_WORKER_CONTROL_PORT:String(port),NAUMI_APP_ORIGIN:origin,VIDEO_WORKER_INTERVAL_MS:'60000'};
  const start=()=>{child=spawn(process.execPath,['/app/scripts/video-worker.mjs'],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);child.done=new Promise(resolve=>child.once('close',resolve));};start();
  await until(status,s=>s?.wakeupConnected===true);await until(async()=>Promise.all([...Object.values(data.ids),newId,postId,stored.id].map(row)),rows=>rows.every(r=>r.snapshot.status==='done'));
  await until(async()=>({a:(await backend.readBatch(data,batch)).body,b:await backend.workbenchResult(data,wb.id)}),s=>s.a.status==='succeeded'&&s.b.status==='done');
  eq(provider,1);eq(webPosts,0);eq((await sql.query("SELECT count(*)::int n,(-sum(delta))::int amount FROM app_ledger WHERE kind='consume'")).rows[0],{n:5,amount:30});
  for(const id of [data.ids.generate,data.ids.suite,data.ids.aplus,newId])eq((await row(id)).billing_settled,true);eq((await row(newId)).payload.billingQuote,data.quotes.generate);eq((await row(stored.id)).snapshot.deliveryRecoveryRequested,undefined);
  eq((await row(data.live)).lease_token,data.token);eq((await row(data.unknown)).snapshot.status,'needs_attention');eq((await row(data.unknown)).snapshot.paidOperations[data.unknown].state,'started');
  await control('drain');await until(status,s=>s?.tickDrainComplete===true);const nested=await backend.submitNested(data),cancelled=await backend.submitNested(data,true);await control('resume');await backend.kickHttp(data);
  const nestedResult=await until(()=>backend.postprocessResult(data,nested),r=>r.status==='succeeded',30000);eq(nestedResult.chargedCredits,6);eq(nestedResult.artifacts.length,1);eq(provider,2);
  const cancelledResult=await until(()=>backend.postprocessResult(data,cancelled),r=>r.status==='cancelled',30000);eq(cancelledResult.artifacts.length,0);eq(cancelledResult.chargedCredits,0);eq(provider,2);
  await until(status,s=>s?.activeTicks===0);
  const beforeNoise=(await status()).lastTick.id;await sql.query("SELECT pg_notify('naumi_application_work','not-this-schema')");await sleep(120);eq((await status()).lastTick.id,beforeNoise);
  // A slow callback may not block another user's newly persisted request.
  holding=true;holdAt=3;const first=await backend.submitNewGeneration(data);await until(async()=>provider,n=>n===3,12000);
  const second=await backend.submitNewGeneration(data);await until(async()=>provider,n=>n===4,12000);await until(()=>row(second),r=>r.snapshot.status==='done',12000);eq((await row(first)).snapshot.status,'pending');
  const drained=await control('drain');eq(drained.state.phase,'DRAINING');const third=await backend.submitNewGeneration(data);await sleep(200);eq(provider,4);eq((await row(third)).lease_token,null);
  releaseFirst();releaseFirst=undefined;holding=false;await until(status,s=>s?.tickDrainComplete===true);eq((await row(third)).snapshot.status,'pending');
  await control('resume');await backend.kickHttp(data);await until(()=>row(third),r=>r.snapshot.status==='done',12000);eq(provider,5);
  // Real LISTEN disconnect/reconnect; it owns no business lease or task state.
  await until(status,s=>s?.activeTicks===0);const pids=(await sql.query("SELECT pid FROM pg_stat_activity WHERE application_name='naumi-worker-wakeup' AND datname=current_database()")).rows;eq(pids.length,1);
  await sql.query('SELECT pg_terminate_backend($1)',[pids[0].pid]);await until(async()=>(await sql.query("SELECT pid FROM pg_stat_activity WHERE application_name='naumi-worker-wakeup' AND datname=current_database() AND pid<>$1",[pids[0].pid])).rows,rows=>rows.length===1,10000);await until(status,s=>s?.wakeupConnected===true);
  const fourth=await backend.submitNewGeneration(data);await until(()=>row(fourth),r=>r.snapshot.status==='done',12000);eq(provider,6);eq(webPosts,0);
  await control('drain');await until(status,s=>s?.tickDrainComplete===true);child.kill('SIGTERM');eq(await child.done,0);
  const missed=await backend.submitNewGeneration(data);eq((await row(missed)).snapshot.status,'pending');eq(provider,6);
  // The original notification has no listener. Restart paused, then resume;
  // the real periodic timer (no extra hint or task mutation) finds the saved row.
  env.VIDEO_WORKER_INTERVAL_MS='5000';start();await until(status,s=>s?.paused===true);await control('resume');await until(()=>row(missed),r=>r.snapshot.status==='done',12000);eq(provider,7);
  await control('drain');await until(status,s=>s?.tickDrainComplete===true);child.kill('SIGTERM');eq(await child.done,0);
  eq((await sql.query("SELECT count(*)::int n,(-sum(delta))::int amount FROM app_ledger WHERE kind='consume'")).rows[0],{n:11,amount:66});
  eq((await sql.query("SELECT count(*)::int n FROM app_release_activities WHERE state IN ('active','unknown')")).rows[0].n,0);
  console.log(`IMAGE_WORKER_OWNERSHIP=PASS mode=MODIFIED checks=${checks} WEB_EXECUTION=0 BATCH_WEB_POSTS=0 SUPPLIER_POSTS=${provider} REAL_PG=1 REAL_HANDLERS=1 REAL_CHILD=1 FROZEN_UNIT6_CURRENT17=1 CONSUME=11 CREDITS=66 NESTED_ONCE=1 CANCEL_NO_POST=1 WAKE_WITHIN12S=1 SLOW_CALLBACK_FAIRNESS=1 DRAIN_PENDING=1 RECONNECT=1 MISSED_HINT_PERIODIC_RECOVERY=1`);
 }
}finally{
 releaseFirst?.();if(child?.exitCode===null){child.kill('SIGTERM');await child.done;}
 await writeFile('/evidence/'+mode+'_OWNERSHIP_CHILD.log',logs);await backend?.waitForBackgroundWork();await backend?.closeImageCoordinationPool();await backend?.pool().end();web.closeAllConnections();await new Promise(resolve=>web.close(resolve));await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();await rm(dir,{recursive:true,force:true});console.log('IMAGE_WORKER_OWNERSHIP_CLEANUP=PASS CHILD_STOPPED=1 RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 TEMP_MEDIA_REMOVED=1');
}
