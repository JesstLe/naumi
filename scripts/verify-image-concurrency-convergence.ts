/** Offline fixture: real local PostgreSQL, route handlers, provider HTTP and job leases.
 * Never point this at a business database or supplier. --baseline captures 05598fe behaviour.
 * --review-regressions covers the three 9f049b07 recovery regressions;
 * add --review-baseline only on its original source copy. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,readFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {createProviderCapacity,capacityFetch,providerCapacitySummary} from "../src/lib/model-config/capacity";
import * as gateway from "../src/lib/image-gateway";
import {DurableImageJobs} from "../src/lib/durable-image-jobs";
import {modelEndpointFetch} from "../src/lib/model-config/transport";
import {claimChannel} from "../src/lib/model-config/channel-scheduler";
import {channelOperationKey} from "../src/lib/model-config/channel-availability";

const baseline=process.argv.includes("--baseline");
const reviewRegressions=process.argv.includes("--review-regressions"),reviewBaseline=process.argv.includes("--review-baseline");
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until<T>(read:()=>Promise<T>,accept:(v:T)=>boolean,ms=15000):Promise<T>{
 const end=Date.now()+ms;let value:T;do{value=await read();if(accept(value))return value;await sleep(25);}while(Date.now()<end);throw Error("fixture-timeout: "+JSON.stringify(value));
}
async function main(){
 let posts=0,active=0,peak=0,latency=0;
 let asyncSupplier=false,rejectSupplier=false,fixtureOrigin="",onReject:(()=>Promise<void>)|undefined;
 const png=await sharp({create:{width:256,height:256,channels:3,background:"#82bda1"}}).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{
  for await(const _ of req){};
  if(req.url?.startsWith("/media/")){res.setHeader("content-type","image/png");res.end(png);return;}
  if(req.url==="/v1/uploads/images"){res.setHeader("content-type","application/json");res.end(JSON.stringify({url:"https://fixture.invalid/reference.png"}));return;}
  if(req.url?.startsWith("/v1/tasks/")){res.setHeader("content-type","application/json");res.end(JSON.stringify({data:{id:req.url.split("/").pop(),status:"completed",result:{images:[{url:[fixtureOrigin+"/media/accepted.png"]}]}}}));return;}
  if(req.url?.includes("/images/")){posts++;active++;peak=Math.max(peak,active);await sleep(latency);active--;res.setHeader("content-type","application/json");if(rejectSupplier){rejectSupplier=false;await onReject?.();res.statusCode=422;res.end(JSON.stringify({error:{code:"invalid_image",param:"image",billing_status:"not_charged"}}));return;}res.end(JSON.stringify(asyncSupplier?{data:{id:"accepted-fixture-"+posts,status:"submitted"}}:{data:[{b64_json:png.toString("base64")}]}));return;}
  res.writeHead(404);res.end("{}");
 });
 fixtureOrigin=f.origin;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-concurrency-router-token-long",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-concurrency-envelope-key-long",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:f.origin+"/v1",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"naumi-concurrency-")),VIDEO_WORKER_SECRET:"fixture-concurrency-worker-token-long-long",NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE:"2",GEN_MAX_CONCURRENT:"1"});
 delete process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS;
 f.config.providers[0].maxConcurrent=1;f.config.upstreamModels[0].model="gpt-image-2";f.config.upstreamModels[0].parameterMap.resolution={};f.config.upstreamModels[0].capabilities.nativeResolutions=[];
 await f.repo.current();
 const db=await import("../src/lib/db"),repo=await import("../src/lib/image-job-repository");await db.ensureSchema();
 const imagegen=await import("../src/app/api/imagegen/route"),planRoute=await import("../src/app/api/imagegen/plan/route"),gen=await import("../src/app/api/generate-image/route");
 const {USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
 const owner="concurrency@fixture.test";await db.getOrCreateUser(owner);await db.addCreditBatch(owner,10000,{source:"admin",reason:"isolated fixture"});await db.setSetting("multi_user_enabled","1");
 await f.sql.query(`CREATE TABLE fixture_job_events(id text,snapshot jsonb,token text);
  CREATE FUNCTION fixture_record_job() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO fixture_job_events VALUES(NEW.id,NEW.snapshot,NEW.lease_token);RETURN NEW;END$$;
  CREATE TRIGGER fixture_jobs AFTER UPDATE OF snapshot ON app_image_jobs FOR EACH ROW EXECUTE FUNCTION fixture_record_job()`);
 const req=(path:string,body?:unknown)=>new Request(f.origin+path,{method:body?"POST":"GET",headers:{origin:f.origin,cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const row=async(id:string)=>(await f.sql.query("SELECT * FROM app_image_jobs WHERE id=$1",[id])).rows[0];
 const worker=(id:string)=>gen.POST(new Request(f.origin+"/api/generate-image",{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:id})}));
 const limit={providerId:"p1",baseUrl:f.origin+"/v1",maxConcurrent:1,timeoutMs:120000};
 const leases=new Set<Awaited<ReturnType<ReturnType<typeof createProviderCapacity>["acquire"]>>>();
 const hold=async()=>{const lease=await createProviderCapacity(f.sql).acquire(limit);leases.add(lease);return lease;};
 const release=async(lease:Awaited<ReturnType<typeof hold>>)=>{await lease.release();leases.delete(lease);};
 try{
  if(reviewRegressions){
   const {createModelExecutor}=await import("../src/lib/model-config/execution"),{getBillingRuntime}=await import("../src/lib/billing/server");
   const {channelRoutingFetch}=await import("../src/lib/model-config/channel-fetch"),{ModelConfigError}=await import("../src/lib/model-config/types");
   const billing=await(await getBillingRuntime()).config.current(),baseSnapshot=await f.repo.current();
   const executor=createModelExecutor({runtime:{byVersion:v=>f.repo.byVersion(v),prepareExecution:async()=>{throw Error("unexpected Router");}},credentials:f.credentials,billingByVersion:async()=>billing,trustedOrigins:[f.origin],gateway:()=>({baseUrl:f.origin,apiKey:"fixture"})});
   const freeze=async(snapshot:typeof baseSnapshot)=>executor.resolve({snapshot,billing,binding:"image.edit",requestedModelId:"image-a",facts:{task:"product",quality:"medium",resolution:"1K",ratio:"1:1",needsEdit:true,preserveIdentity:false,needsText:false,nativeResolution:false,references:1}});
   const publish=async(config:typeof f.config)=>{const actor="fixture-review",current=await f.repo.current(),draft=await f.repo.draft(actor),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor}),p=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor,reason:"local review regression"});return f.repo.markApplied(p.id,p.digest);};
   const frozen=await freeze(baseSnapshot),bundle={modelVersion:baseSnapshot.version,billingVersion:billing.version,primary:"image" as const,image:frozen};
   const aplus=await import("../src/app/api/aplus/route"),ajobs=new DurableImageJobs<any>("aplus");
   const aWorker=(id:string)=>aplus.POST(new Request(f.origin+"/api/aplus",{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:id})}));
   const makeAplus=async(status="awaiting_review",second=false)=>{
    const id="fixture-aplus-review-"+randomUUID(),url="data:image/png;base64,"+png.toString("base64"),source=(i:number)=>({id:id+":"+i,label:"fixture",status:"review",url,version:1});
    await ajobs.create(id,owner,{status,stage:"reviewing",imageQuality:"medium",sources:second?[source(0),source(1)]:[source(0)],sourceInputs:second?[{buf:png,type:"image/png"},{buf:png,type:"image/png"}]:[{buf:png,type:"image/png"}],sourceBuffers:second?[png,png]:[png],sourceHistory:second?[[],[]]:[[]],shots:[],done:0,total:1,extra:"",platform:"amazon",lang:"zh",format:"1:1",modules:["hero"],email:owner,model:"image-a",textModel:"fixture",useDb:true,cost:0,generationStarted:false,reserved:false,parentId:"",parentIds:[],origin:"canvas",createdAt:Date.now()},{modelExecutions:bundle},0,false);return id;
   };
   for(const initial of ["awaiting_review","pending"]){
    const id=await makeAplus(initial),held=await hold(),before=posts;
    const redo=await aplus.POST(req("/api/aplus",{jobId:id,action:"redo_source",sourceIndex:0,feedback:"保留商品，调整白底"}));assert.equal(redo.status,200,await redo.clone().text());
    const deferred=await until(()=>row(id),r=>!r.lease_token&&r.snapshot.queueState==="execution");
    assert.equal(deferred.snapshot.status,"pending");assert.equal(deferred.snapshot.sources[0].status,"redoing");assert.equal(posts,before);
    const op=deferred.snapshot.sources[0].redoOperationId;assert.equal(deferred.snapshot.paidOperations[op].state,"queued");await release(held);
    await f.sql.query("UPDATE app_image_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);await aWorker(id);
    const done=await until(()=>row(id),r=>!r.lease_token&&r.snapshot.sources[0].status==="review");
    assert.equal(done.snapshot.paidOperations[op].state,"done");assert.equal(posts,before+1);assert.equal(done.snapshot.sources[0].version,2);
    assert.equal(done.snapshot.status,reviewBaseline?"pending":"awaiting_review");assert.equal(done.lease_until===null,!reviewBaseline);
    await f.sql.query("UPDATE app_image_jobs SET lease_until=NULL WHERE id=$1",[id]);
    assert.equal((await repo.dueImageJobs()).some(j=>j.id===id),reviewBaseline);
    const poll=await(await aplus.GET(req("/api/aplus?job="+id))).json();assert.equal(poll.operationStatus,reviewBaseline?"pending":"awaiting_review");
    await aWorker(id);await until(()=>row(id),r=>!r.lease_token);assert.equal(posts,before+1,"idle recovery must not re-POST");
    // End this fixture job so it does not consume later admission capacity.
    await f.sql.query("UPDATE app_image_jobs SET snapshot=snapshot||'{\"status\":\"done\"}'::jsonb WHERE id=$1",[id]);
   }
   console.log((reviewBaseline?"BASELINE":"MODIFIED")+"_APLUS_REDO=PASS ACTUAL_HANDLERS=POST+WORKER+GET INITIAL_STATES=2 BUSY_POSTS=0 RECOVERY_POSTS=1 FINAL="+(reviewBaseline?"pending DUE_AGAIN=1":"awaiting_review DUE_AGAIN=0"));

   // Inject state changes in PostgreSQL at source completion, after kickoff's
   // snapshot was captured. The route must read the latest state at finalization.
   await f.sql.query(`CREATE TABLE fixture_review_override(id text PRIMARY KEY,action text);
    CREATE FUNCTION fixture_override_review() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE action text;BEGIN
     SELECT o.action INTO action FROM fixture_review_override o WHERE o.id=NEW.id;
     IF action IS NOT NULL AND OLD.snapshot->'sources'->0->>'status'='redoing' AND NEW.snapshot->'sources'->0->>'status'='review' THEN
      IF action='redoing' THEN NEW.snapshot=jsonb_set(NEW.snapshot,'{sources,1,status}','"redoing"'::jsonb);
      ELSIF action='generating' THEN NEW.snapshot=NEW.snapshot||'{"status":"pending","stage":"generating"}'::jsonb;
      ELSE NEW.snapshot=jsonb_set(NEW.snapshot,'{status}',to_jsonb(action));END IF;
     END IF;RETURN NEW;END$$;
    CREATE TRIGGER fixture_override_review BEFORE UPDATE OF snapshot ON app_image_jobs FOR EACH ROW EXECUTE FUNCTION fixture_override_review()`);
   for(const action of ["done","error","needs_attention","redoing","generating"]){
    const id=await makeAplus("pending",action==="redoing");await f.sql.query("INSERT INTO fixture_review_override VALUES($1,$2)",[id,action]);
    const response=await aplus.POST(req("/api/aplus",{jobId:id,action:"redo_source",sourceIndex:0,feedback:"fixture latest checkpoint"}));assert.equal(response.status,200,await response.clone().text());
    const latest=await until(()=>row(id),r=>!r.lease_token&&r.snapshot.sources[0].status==="review");
    if(action==="redoing"){assert.equal(latest.snapshot.status,"pending");assert.equal(latest.snapshot.sources[1].status,"redoing");}
    else if(action==="generating"){assert.equal(latest.snapshot.status,"pending");assert.equal(latest.snapshot.stage,"generating");}
    else assert.equal(latest.snapshot.status,action);
    await f.sql.query("UPDATE app_image_jobs SET snapshot=snapshot||'{\"status\":\"done\"}'::jsonb WHERE id=$1",[id]);
   }
   console.log("APLUS_LATEST=PASS PG_COMPLETION_RACES=5 TERMINAL_OVERWRITES=0 REMAINING_REDO_OVERWRITES=0 STAGE_OVERWRITES=0");

   const familyConfig=structuredClone(baseSnapshot.config),credential=await f.credentials.importPlain({providerId:"p2",plain:"fixture-backup",actor:"fixture"});
   familyConfig.providers.push({...familyConfig.providers[0],id:"p2",name:"Backup",credentialRef:credential.id});
   familyConfig.upstreamModels.push({...structuredClone(familyConfig.upstreamModels[0]),id:"u2",providerId:"p2",model:"fixture-image-backup"});
   familyConfig.publicModels[0].supplierRouting={mode:"priority",channels:[{upstreamId:"u1",enabled:true,priority:1,weight:1},{upstreamId:"u2",enabled:true,priority:2,weight:1}]};
   const familySnapshot=await publish(familyConfig),familyScope=await executor.describe(await freeze(familySnapshot));
   const off=structuredClone(familyConfig);off.publicModels[0].supplierRouting!.channels[1].enabled=false;
   rejectSupplier=true;onReject=async()=>{await publish(off);};
   const beforeExhausted=posts,started=Date.now();let exhausted:Response|undefined,exhaustion:unknown;
   try{exhausted=await gateway.withImageOperation("image-a",{id:"exhausted-review",durable:true},()=>channelRoutingFetch(familyScope,{trustedOrigins:[f.origin]})(f.origin+"/v1/images/generations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:"image-a",prompt:"fixture rejected image",n:1}),signal:AbortSignal.timeout(900)}));}catch(e){exhaustion=e;}
   assert.equal(posts,beforeExhausted+1);
   if(reviewBaseline){assert.ok(exhaustion instanceof gateway.ImageOperationPending);assert.equal(exhausted,undefined);}
   else{assert.equal(exhaustion,undefined);assert.equal(exhausted!.status,422);assert.equal((await exhausted!.json()).error.code,"IMAGE_INPUT_REJECTED");assert.ok(Date.now()-started<900);}
   let emptyError:unknown;try{await gateway.withImageOperation("image-a",{id:"no-candidates",durable:true},()=>claimChannel(f.sql,"image-a",familyScope.supplierRouting!.policy,familyScope.supplierRouting!.targets,new Set(["u1"])));}catch(e){emptyError=e;}
   assert.ok(reviewBaseline?emptyError instanceof gateway.ImageOperationDeferred:emptyError instanceof ModelConfigError&&emptyError.code==="PROVIDER_BUSY");
   console.log((reviewBaseline?"BASELINE":"MODIFIED")+"_EXHAUSTED=PASS ACTUAL_CHANNEL_FETCH=1 A_POSTS=1 B_DISABLED_POSTS=0 SORTED=0 RESULT="+(reviewBaseline?"Pending_TIMEOUT ORIGINAL_FAILURE_LOST=1":"422_IMAGE_INPUT_REJECTED ORIGINAL_FAILURE_RETAINED=1"));

   const mixed=structuredClone(familyConfig);mixed.providers[0].protocol="apimart-images";
   mixed.upstreamModels[0].parameterMap={apimartImages:{schemaVersion:1,maxOutputs:1,supportsMask:true,ratios:["1:1"]},qualityPolicy:{mode:"omit",choices:[{id:"medium",label:"标准"}]},resolutionPolicy:{mode:"map",field:"resolution",values:{"1K":"1K"}}};
   mixed.upstreamModels[0].capabilities.nativeResolutions=["1K"];
   const mixedSnapshot=await publish(mixed),mixedFrozen=await freeze(mixedSnapshot),mixedScope=await executor.describe(mixedFrozen);
   const pinId="accepted-durable-review",pinKey=channelOperationKey(mixedScope,pinId)!,call=()=>channelRoutingFetch(mixedScope,{trustedOrigins:[f.origin]})(f.origin+"/v1/images/generations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:"accepted fixture",n:1}),signal:AbortSignal.timeout(4000)});
   asyncSupplier=true;const beforeAccepted=posts;assert.equal((await gateway.withImageOperation("image-a",{id:pinId},call)).status,200);assert.equal(posts,beforeAccepted+1);
   assert.equal((await f.sql.query("SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1",[pinKey])).rows[0].upstream_id,"u1");
   const held=await hold();let pinError:unknown,pinResponse:Response|undefined;try{pinResponse=await gateway.withImageOperation("image-a",{id:pinId},call);}catch(e){pinError=e;}
   if(reviewBaseline){assert.equal(pinError,undefined);assert.equal(pinResponse!.status,429);assert.equal((await pinResponse!.json()).error.billing_status,"not_charged");}else assert.ok(pinError instanceof gateway.ImageOperationPending&&!(pinError instanceof gateway.ImageOperationDeferred));
   await gateway.withImageOperation("image-a",{id:pinId,durable:true},async()=>{await assert.rejects(claimChannel(f.sql,"image-a",mixedScope.supplierRouting!.policy,mixedScope.supplierRouting!.targets,new Set(),pinKey),gateway.ImageOperationDeferred);});
   // Same accepted pin, now in a durable dispatched root: Deferred must reach
   // the low-level wait, then query the same task without a second paid POST.
   let completed=false;const waiting=gateway.withImageOperation("image-a",{id:pinId,durable:true,dispatchState:{attempted:true}},call).then(r=>{completed=true;return r;});
   await sleep(100);assert.equal(completed,false);assert.equal(posts,beforeAccepted+1);await release(held);assert.equal((await waiting).status,200);assert.equal(posts,beforeAccepted+1);
   console.log((reviewBaseline?"BASELINE":"MODIFIED")+"_PIN=PASS ACCEPTED_APIMART_POSTS=1 NONDURABLE_BUSY="+(reviewBaseline?"429_NOT_CHARGED":"Pending")+" DURABLE_DISPATCHED_LOW_LEVEL_WAIT=1 RECOVERY_EXTRA_POSTS=0 PIN_PRESERVED=1");

   // The original canvas domain processor must hold a previously accepted edit,
   // not fail/release its real reservation after the non-durable SDK boundary.
   const artworkId="fixture-canvas-source-"+randomUUID();await db.addArtworks(owner,[{id:artworkId,title:"fixture",category:"fixture",prompt:"fixture",status:"completed",image:"data:image/png;base64,"+png.toString("base64"),gradient:"",width:256,height:256}],artworkId);
   const id="fixture-canvas-pin-"+randomUUID(),unit=id+":quality:medium",key=channelOperationKey(mixedScope,unit)!;
   const {editImage}=await import("../src/lib/image-edit");
   const original=await sharp(png).rotate().png().toBuffer(),clear=await sharp({create:{width:24,height:24,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).png().toBuffer();
   const mask=await sharp({create:{width:256,height:256,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).composite([{input:clear,left:0,top:0,blend:"dest-out"}]).png().toBuffer();
   const edit=()=>executor.run(mixedFrozen,()=>editImage({operationId:id,images:[original],mask,prompt:["任务：编辑图片，只修改指定区域的文字，图片其余所有画面100%保持原样，不要改动产品、光影、材质、背景。","要求：字体风格、颜色、光影、质感、透视和原图完全匹配。","需要修改的区域：原图 256×256 像素中的矩形区域：x=0, y=0, width=24, height=24","旧文字：旧","新文字：新","禁止改动其他任何元素，不要增加物体，不要改变背景、产品包装、3D数字。"].join("\n"),size:"1024x1024",quality:{requested:"medium",executed:"medium",fallbackReason:null}}));
   assert.deepEqual(await edit(),png);
   const acceptedMarker=(await f.sql.query("SELECT id,task_id,parameters FROM app_supplier_calls WHERE billing_unit_id=$1",[unit])).rows[0];assert.ok(acceptedMarker.task_id);
   await db.createCanvasImageTaskWithReservation({id,email:owner,sourceArtworkId:artworkId,cost:6,metered:true,parameters:{artworkId,oldText:"旧",newText:"新",box:{x:0,y:0,width:20,height:20},paidOperationVersion:1,upstreamStarted:true,qualityAudit:{requested:"medium",executed:"medium",fallbackReason:null},modelExecutions:{modelVersion:mixedSnapshot.version,billingVersion:billing.version,primary:"image",image:mixedFrozen}}});
   const task=await db.claimNextCanvasImageTask();assert.equal(task!.id,id);const heldCanvas=await hold(),canvasPosts=posts;
   await(await import("../src/lib/canvas-image-tasks")).processCanvasImageTask(task!);
   const saved=await db.getCanvasImageTask(owner,id);assert.equal(saved!.status,reviewBaseline?"failed":"needs_attention");assert.equal(posts,canvasPosts);
   assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_gen_reservations WHERE job_id=$1",[id])).rows[0].n),reviewBaseline?0:1);
   assert.equal((await f.sql.query("SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1",[key])).rows[0].upstream_id,"u1");
   assert.deepEqual((await f.sql.query("SELECT id,task_id,parameters FROM app_supplier_calls WHERE id=$1",[acceptedMarker.id])).rows[0],acceptedMarker);
   assert.equal(await db.getCanvasImageTaskChargedCredits(id),0);await release(heldCanvas);assert.deepEqual(await edit(),png);assert.equal(posts,canvasPosts,"accepted canvas request hash resumes the same task");
   console.log((reviewBaseline?"BASELINE":"MODIFIED")+"_CANVAS_PIN=PASS ORIGINAL_PROCESSOR=1 NONDURABLE_SDK=1 BUSY_POSTS=0 CHARGED=0 STATUS="+saved!.status+" RESERVATION="+(reviewBaseline?0:1)+" PIN_PRESERVED=1");
   console.log((reviewBaseline?"REVIEW_BASELINE":"REVIEW_MODIFIED")+"=PASS REAL_LOCAL_POSTGRES=1 REAL_HANDLERS=1 EXTERNAL_SUPPLIER_CALLS=0");return;
  }
  const input={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"隔离验收绿色产品图",inputs:[],modelId:"image-a",variants:1,parameters:{quality:"medium",resolution:"1K",ratio:"1:1"},output:{format:"png"}};
  const preview=await planRoute.POST(req("/api/imagegen/plan",input));assert.equal(preview.status,200,await preview.clone().text());const plan=await preview.json();
  const held=await hold();
  const submitted=await imagegen.POST(req("/api/imagegen",{...input,confirmation:{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true}}));assert.equal(submitted.status,200,await submitted.clone().text());const accepted=await submitted.json();
  const child=await until(async()=>(await f.sql.query("SELECT * FROM app_image_jobs WHERE kind='generate' ORDER BY created_at DESC LIMIT 1")).rows[0],r=>r&&(!r.lease_token&&(baseline?r.snapshot.status==="error":r.snapshot.queueState==="execution"&&Object.values(r.snapshot.paidOperations||{}).some((a:any)=>a.state==="queued"))));
  assert.equal(posts,0,"busy is before any supplier POST");
  const attempt:any=Object.values(child.snapshot.paidOperations||{})[0];
  if(baseline){
   assert.equal(child.snapshot.status,"error");assert.equal(attempt.state,"rejected");assert.equal(await db.getImageJobChargedCredits(child.id),0);
   console.log("BASELINE=PASS BUSY_POSTS=0 BUSY_STATUS=error PAID_STATE=rejected CHARGED=0 GEN_ENV_SLOT=present");return;
  }
  assert.equal(child.snapshot.status,"pending");assert.equal(attempt.state,"queued");assert.ok(attempt.attemptToken);assert.ok(child.reserved_cost>0);assert.equal(child.billing_settled,false);
  const events=(await f.sql.query("SELECT * FROM fixture_job_events WHERE id=$1",[child.id])).rows;
  assert.ok(events.some(e=>e.snapshot.paidOperations?.[child.id]?.state==="started"&&e.token));
  assert.ok(events.some(e=>e.snapshot.paidOperations?.[child.id]?.state==="queued"&&e.token&&e.snapshot.paidOperations[child.id].attemptToken===attempt.attemptToken),"new started-to-queued write is lease-bound and carries the same token");
  const dup=await imagegen.POST(req("/api/imagegen",input));assert.equal(dup.status,200,await dup.clone().text());assert.equal((await dup.json()).jobId,accepted.jobId);
  await Promise.all([worker(child.id),worker(child.id)]);assert.equal(posts,0);assert.equal(await db.getImageJobChargedCredits(child.id),0);
  assert.ok(!(await repo.dueImageJobs()).some(j=>j.id===child.id),"10s backoff is retained");
  await release(held);
  await until(()=>row(child.id),r=>new Date(r.lease_until).getTime()<Date.now(),12000);
  await Promise.all([worker(child.id),worker(child.id),worker(child.id)]);
  await until(()=>row(child.id),r=>r.snapshot.status==="done"&&!r.lease_token);
  const done=await until(async()=>await(await imagegen.GET(req("/api/imagegen?operationId="+input.operationId))).json(),r=>r.status==="succeeded");
  assert.equal(posts,1);assert.equal(done.artifacts.length,1);assert.equal(done.chargedCredits,plan.totalCredits);
  await worker(child.id);await imagegen.POST(req("/api/imagegen",input));assert.equal(posts,1);
  assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_ledger WHERE id=$1",["led-image-"+child.id])).rows[0].n),1);
  assert.equal(await db.getImageJobChargedCredits(child.id),plan.totalCredits);
  console.log("ROUTE=PASS BUSY_POSTS=0 QUEUED=pending NEW_ATTEMPT_TOKEN_LEASE=1 DB_BACKOFF_SECONDS=10 SAME_OP_POSTS=1 LEDGER=1 CHARGED="+done.chargedCredits);

  // Real DB admission: six concurrent claim calls, two execution leases, no memory semaphore.
  const jobs=new DurableImageJobs<{status:string}>("generate");let executing=0,jobPeak=0;
  const ids=Array.from({length:6},()=>"fixture-lane-"+randomUUID());
  for(const id of ids)await jobs.create(id,owner,{status:"pending"},{},0,false);
  const run=(id:string)=>jobs.kick(id,async()=>{executing++;jobPeak=Math.max(jobPeak,executing);await sleep(120);executing--;await jobs.patch(id,{status:"done"});});
  await Promise.all(ids.map(run));await until(async()=>Number((await f.sql.query("SELECT count(*) n FROM app_image_jobs WHERE id=ANY($1) AND lease_token IS NOT NULL",[ids])).rows[0].n),n=>n===0);
  assert.equal(jobPeak,2);assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_image_jobs WHERE id=ANY($1) AND snapshot->>'status'='done'",[ids])).rows[0].n,2);
  await Promise.all(ids.map(run));await sleep(180);await Promise.all(ids.map(run));await sleep(180);assert.equal(jobPeak,2);
  console.log("DB_LANES=PASS CONCURRENT_CLAIMS=6 ACTIVE_MAX=2 WAITING_IN_DB=4");

  // Explicit persisted provider budget wins over obsolete unlimited env and old snapshots.
  process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS="p1";
  const capHeld=await hold();await assert.rejects(createProviderCapacity(f.sql).acquire({...limit,maxConcurrent:99}),(e:any)=>e.code==="PROVIDER_BUSY");
  const summary=await providerCapacitySummary(f.sql,f.config);assert.equal(summary.p1.maxConcurrent,1);assert.equal(summary.p1.unlimited,false);
  const snapshot=await f.repo.current(),u=snapshot.config.upstreamModels[0],provider=snapshot.config.providers[0];
  const scope:any={frozen:{modelVersion:snapshot.version,modelDigest:snapshot.digest,billingVersion:plan.billingVersion,publicModelId:"image-a",binding:"image.generate",modality:"image",target:{type:"upstream",id:"u1"},facts:{quality:"medium",resolution:"1K",ratio:"1:1"}},connection:{...limit,protocol:"openai-images",wireModel:"gpt-image-2",apiKey:f.marker,credentialRef:provider.credentialRef},capabilities:u.capabilities,parameterMap:{},audited:true};
  const target={upstreamId:"u1",enabled:true,priority:1,weight:1,scope},policy={mode:"priority" as const,channels:[target]};
  const healthBefore=JSON.stringify((await f.sql.query("SELECT * FROM app_model_channel_health ORDER BY key")).rows);
  await gateway.withImageOperation("image-a",{id:"scheduler-capacity",durable:true},async()=>{await assert.rejects(claimChannel(f.sql,"image-a",policy,[target],new Set()),(e:any)=>e instanceof gateway.ImageOperationDeferred);});
  const {channelRoutingFetch}=await import("../src/lib/model-config/channel-fetch");
  await assert.rejects(gateway.withImageOperation("image-a",{id:"scheduler-fetch-capacity",durable:true},()=>channelRoutingFetch({...scope,supplierRouting:{policy,targets:[target]}},{trustedOrigins:[f.origin]})(f.origin+"/v1/images/generations",{method:"POST",body:"{}"})),(e:any)=>e instanceof gateway.ImageOperationDeferred);
  assert.equal(JSON.stringify((await f.sql.query("SELECT * FROM app_model_channel_health ORDER BY key")).rows),healthBefore);
  assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_model_provider_leases")).rows[0].n),1);
  const pinId="preserve-prior-pin",pinKey=channelOperationKey(scope,pinId)!;
  await f.sql.query("INSERT INTO app_model_channel_operations(operation_key,upstream_id) VALUES($1,'u1')",[pinKey]);
  await assert.rejects(gateway.withImageOperation("image-a",{id:pinId,durable:true,dispatchState:{attempted:true}},()=>claimChannel(f.sql,"image-a",policy,[target],new Set(),pinKey)),(e:any)=>e instanceof gateway.ImageOperationPending&&!(e instanceof gateway.ImageOperationDeferred));
  assert.equal((await f.sql.query("SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1",[pinKey])).rows[0].upstream_id,"u1");
  const {stageRoutingFetch}=await import("../src/lib/model-config/stage-routing");
  const procurement={currency:"CNY",basis:"task",amountMicros:"1000",source:"fixture",updatedAt:"2026-10-23T00:00:00.000Z"};
  const stageScope:any={...scope,procurement,routing:{spentMicros:BigInt(0),targets:{},policy:{maxAttempts:1,costCapCnyMicros:"1000",rules:[]}}};
  for(let n=0;n<2;n++)await assert.rejects(gateway.withImageOperation("image-a",{id:"stage-never-sent",durable:true},()=>stageRoutingFetch({...stageScope,routing:{...stageScope.routing,spentMicros:BigInt(0)}},{trustedOrigins:[f.origin]})(f.origin+"/v1/images/generations",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})),(e:any)=>e instanceof gateway.ImageOperationDeferred);
  const auditRows=(await f.sql.query("SELECT state,cost_cny_micros::text,cost_status FROM app_model_execution_stages WHERE operation_id='stage-never-sent'")).rows;
  assert.equal(auditRows.length,2);assert.ok(auditRows.every(r=>r.state==="not-submitted"&&r.cost_cny_micros==="0"&&r.cost_status==="confirmed-not-charged"));

  // Direct APIMart clears only the marker claimed by THIS unsent attempt, never an old marker/pin.
  const {apimartImagesFetch}=await import("../src/lib/model-config/apimart-preset"),{healthObservedFetch}=await import("../src/lib/model-health/observe");
  const {ensureHealthSchema}=await import("../src/lib/model-health/schema");await ensureHealthSchema(f.sql);
  const observationsBefore=JSON.stringify((await f.sql.query("SELECT * FROM app_model_health_observations ORDER BY key")).rows);
  const apiscope:any={...scope,connection:{...scope.connection,protocol:"apimart-images",wireModel:"local-apimart-model"},capabilities:{...u.capabilities,nativeResolutions:["1K"]},parameterMap:{apimartImages:{schemaVersion:1,maxOutputs:1,ratios:["1:1"],supportsMask:false},resolutionPolicy:{mode:"map",field:"resolution",values:{"1K":"1K"}},qualityPolicy:{mode:"omit",choices:[{id:"medium",label:"standard"}]}},channelGuard:{upstreamId:"u1"}};
  const adapter=healthObservedFetch(apiscope,apimartImagesFetch(apiscope,{trustedOrigins:[f.origin]}),{trustedOrigins:[f.origin]});
  const apiCall=()=>adapter(f.origin+"/v1/images/generations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:"fixture local capacity",n:1})});
  await assert.rejects(gateway.withImageOperation("local-apimart-model",{id:"apimart-never-sent",durable:true},apiCall),(e:any)=>e instanceof gateway.ImageOperationDeferred);
  let marker=(await f.sql.query("SELECT * FROM app_supplier_calls WHERE billing_unit_id='apimart-never-sent'")).rows[0];assert.equal(marker.parameters,null);assert.equal(marker.task_id,null);assert.equal(marker.state,"pre-submission-failed");
  assert.equal(JSON.stringify((await f.sql.query("SELECT * FROM app_model_health_observations ORDER BY key")).rows),observationsBefore,"local capacity must not record a supplier health failure");
  // Obtain the adapter's own marker/hash, then turn it into a prior unconfirmed claim.
  await f.sql.query("UPDATE app_supplier_calls SET parameters=$2::jsonb,state='unknown' WHERE id=$1",[marker.id,JSON.stringify({requestHash:"prior-unknown-marker"})]);
  await assert.rejects(gateway.withImageOperation("local-apimart-model",{id:"apimart-never-sent",durable:true},apiCall));
  marker=(await f.sql.query("SELECT * FROM app_supplier_calls WHERE id=$1",[marker.id])).rows[0];assert.equal(marker.parameters.requestHash,"prior-unknown-marker");assert.equal(marker.state,"unknown");
  console.log("PROVIDER_BUSY=PASS EXPLICIT_BUDGET=1 ENV_BYPASS=0 FAILURE_COOLDOWN_DELTA=0 APIMART_OWN_MARKER_CLEAR=1 OLD_MARKER_PIN_PRESERVED=1");

  const postBefore=posts;
  const local=capacityFetch(async()=>{throw Error("must-not-dispatch");},f.sql,{...limit,timeoutMs:1000});
  const cancelled=new AbortController();setTimeout(()=>cancelled.abort(),40);
  await assert.rejects(gateway.withImageOperation("image-a",{id:"cancel-started",durable:true,dispatchState:{attempted:true}},()=>local(f.origin+"/v1/images/generations",{method:"POST",signal:cancelled.signal})),(e:any)=>e instanceof gateway.ImageOperationPending&&!(e instanceof gateway.ImageOperationDeferred));
  const timed=capacityFetch(async()=>{throw Error("must-not-dispatch");},f.sql,{...limit,timeoutMs:50});
  await assert.rejects(gateway.withImageOperation("image-a",{id:"timeout-started",durable:true,dispatchState:{attempted:true}},()=>timed(f.origin+"/v1/images/generations",{method:"POST"})),(e:any)=>e instanceof gateway.ImageOperationPending&&!(e instanceof gateway.ImageOperationDeferred));
  assert.equal(posts,postBefore);assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_model_provider_leases")).rows[0].n),1);await release(capHeld);
  await gateway.withImageOperation("image-a",{id:"stage-never-sent",durable:true},async()=>{const response=await stageRoutingFetch({...stageScope,routing:{...stageScope.routing,spentMicros:BigInt(0)}},{trustedOrigins:[f.origin]})(f.origin+"/v1/images/generations",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});assert.equal(response.status,200);await response.arrayBuffer();});
  console.log("STAGE_AUDIT=PASS BUSY_RECORDS=2 NOT_SUBMITTED_COST=0 MAX_ATTEMPTS=1 RECOVERY_POSTS=1");
  // Holding a response body retains the lease; cancel/error/EOF release it.
  const stream=capacityFetch(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));}})),f.sql,limit);
  const response=await stream(f.origin+"/v1/hold");assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_model_provider_leases")).rows[0].n),1);await response.body!.cancel();
  assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_model_provider_leases")).rows[0].n),0);
  console.log("CANCEL_TIMEOUT=PASS NEW_POSTS=0 OLD_STARTED_NOT_REQUEUED=1 STREAM_CANCEL_LEASES=0");

  // After one fan-out POST, a later local busy waits only at acquire and resumes once.
  const fetcher=modelEndpointFetch(f.origin+"/v1",{trustedOrigins:[f.origin]},limit);
  const beforeFan=posts;
  await gateway.withImageOperation("image-a",{id:"fanout",durable:true},async()=>{
   await gateway.withImageIndex("image-a",0,async()=>{await(await fetcher(f.origin+"/v1/images/generations",{method:"POST",body:"{}"})).arrayBuffer();});
   const held=await hold();const waiting=gateway.withImageIndex("image-a",1,async()=>{await(await fetcher(f.origin+"/v1/images/generations",{method:"POST",body:"{}"})).arrayBuffer();});
   await sleep(60);assert.equal(posts,beforeFan+1);await release(held);await waiting;
  });assert.equal(posts,beforeFan+2);
  await assert.rejects(gateway.withImageOperation("image-a",{id:"fanout-unknown",durable:true},async()=>{gateway.noteImageSupplierDispatch();throw new gateway.ImageOperationDeferred("fanout-unknown:image:1");}),(e:any)=>e instanceof gateway.ImageOperationPending&&!(e instanceof gateway.ImageOperationDeferred));
  await assert.rejects(gateway.withImageOperation("image-a",{id:"nested-root",durable:true},async()=>{await gateway.withImageOperation("image-a",{id:"nested-other"},async()=>gateway.noteImageSupplierDispatch());throw new gateway.ImageOperationDeferred("nested-root");}),(e:any)=>e instanceof gateway.ImageOperationPending&&!(e instanceof gateway.ImageOperationDeferred));
  const old="fixture-old-started-"+randomUUID();await jobs.create(old,owner,{status:"pending"},{},0,false);
  await f.sql.query("UPDATE app_image_jobs SET snapshot=snapshot||$2::jsonb WHERE id=$1",[old,JSON.stringify({paidOperations:{[old]:{model:"direct",replayable:false,state:"started"}}})]);
  let reruns=0;await jobs.kick(old,async()=>{try{await jobs.paidOperation(old,"direct",{id:old},async()=>{reruns++;return [];});}catch(e){assert.ok(e instanceof gateway.ImageOperationPending);await jobs.handlePending(old,e);}});
  await until(()=>row(old),r=>!r.lease_token&&r.snapshot.status==="error");assert.equal(reruns,0);assert.equal((await row(old)).snapshot.paidOperations[old].state,"started");
  console.log("ANTI_REPLAY=PASS FANOUT_TWO_INDICES_POSTS=2 BUSY_RECOVERY_AT_ACQUIRE=1 UNKNOWN_REPLAYS=0 OLD_STARTED_PRESERVED=1");
  const acceptedTimeout="fixture-accepted-timeout-"+randomUUID();await jobs.create(acceptedTimeout,owner,{status:"pending"},{},0,false);latency=250;
  const timeoutFetch=modelEndpointFetch(f.origin+"/v1",{trustedOrigins:[f.origin]},{...limit,timeoutMs:40}),beforeTimeout=posts;
  await jobs.kick(acceptedTimeout,async()=>{try{await jobs.paidOperation(acceptedTimeout,"direct",{id:acceptedTimeout,managedGateway:false},async()=>{await(await timeoutFetch(f.origin+"/v1/images/generations",{method:"POST",body:"{}"})).arrayBuffer();return [];});}catch(e){assert.ok(e instanceof gateway.ImageOperationPending);await jobs.handlePending(acceptedTimeout,e);}});
  const unknown=await until(()=>row(acceptedTimeout),r=>r.snapshot.status==="error"&&!r.lease_token);assert.equal(posts,beforeTimeout+1);assert.equal(unknown.snapshot.paidOperations[acceptedTimeout].state,"started");
  await jobs.kick(acceptedTimeout,async()=>{throw Error("unknown task must not run");});assert.equal(posts,beforeTimeout+1);assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_model_provider_leases")).rows[0].n),0);await sleep(260);latency=0;
  await assert.rejects(gateway.withImageOperation("image-a",{id:"unrelated-signal",durable:true},async()=>{throw new gateway.ImageOperationDeferred("another-operation");}),(e:any)=>e instanceof gateway.ImageOperationPending&&!(e instanceof gateway.ImageOperationDeferred));
  console.log("ACCEPTED_TIMEOUT=PASS ACTUAL_POSTS=1 PAID_STATE=started REPLAYS=0 PROVIDER_LEASES=0 FOREIGN_SIGNAL_REQUEUES=0");
  for(const mode of ["expired-lease","changed-attempt"]){
   const id="fixture-cas-"+mode+"-"+randomUUID();await jobs.create(id,owner,{status:"pending"},{},0,false);let checked=false;
   await jobs.kick(id,async()=>{try{await jobs.paidOperation(id,"direct",{id},async()=>{
    if(mode==="expired-lease")await f.sql.query("UPDATE app_image_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);
    else await f.sql.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,ARRAY['paidOperations',$1,'attemptToken'],'\"other-attempt\"'::jsonb) WHERE id=$1",[id]);
    throw gateway.imageCapacityBusy();
   });}catch(e){assert.ok(!(e instanceof gateway.ImageOperationDeferred));checked=true;}});
   await until(()=>row(id),r=>!r.lease_token);assert.equal(checked,true);const saved=await row(id);assert.equal(saved.snapshot.paidOperations[id].state,"started");assert.equal(saved.snapshot.queueState,undefined);
  }
  console.log("DEFER_CAS=PASS EXPIRED_LEASE_REQUEUE=0 CHANGED_ATTEMPT_REQUEUE=0 STARTED_PRESERVED=1");
  const {modelAwareOpenAI}=await import("../src/lib/model-config/clients");
  const byok=modelAwareOpenAI({apiKey:"fixture-byok",baseURL:f.origin+"/v1"},false),beforeByok=posts;
  await assert.rejects(gateway.withImageOperation("direct-byok",{id:"legacy-byok-root",managedGateway:false,durable:true},async()=>{await byok.images.generate({model:"fixture-byok",prompt:"fixture",n:1});throw new gateway.ImageOperationDeferred("legacy-byok-root");}),(e:any)=>e instanceof gateway.ImageOperationPending&&!(e instanceof gateway.ImageOperationDeferred));
  assert.equal(posts,beforeByok+1);
  console.log("LEGACY_DISPATCH=PASS ACTUAL_BYOK_HTTP_POSTS=1 LATER_DEFER_REQUEUE=0 CAPACITY_BEFORE_DISPATCH=1");

  // Six actual supplier requests can run together when DB AND admin both allow six.
  process.env.NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE="6";await f.sql.query("UPDATE app_model_provider_budgets SET max_concurrent=6");latency=180;peak=0;
  const parallel=Array.from({length:6},()=>"fixture-parallel-"+randomUUID());for(const id of parallel)await jobs.create(id,owner,{status:"pending"},{},0,false);
  const parallelFetch=modelEndpointFetch(f.origin+"/v1",{trustedOrigins:[f.origin]},{...limit,maxConcurrent:6});const beforeParallel=posts;
  await Promise.all(parallel.map(id=>jobs.kick(id,async()=>{await jobs.paidOperation(id,"direct",{id},async()=>{await(await parallelFetch(f.origin+"/v1/images/generations",{method:"POST",body:"{}"})).arrayBuffer();return [];});await jobs.patch(id,{status:"done"});})));
  await until(async()=>(await f.sql.query("SELECT count(*)::int n FROM app_image_jobs WHERE id=ANY($1) AND snapshot->>'status'='done' AND lease_token IS NULL",[parallel])).rows[0].n,n=>n===6);assert.equal(posts,beforeParallel+6);assert.equal(peak,6);
  const route=await readFile("src/app/api/generate-image/route.ts","utf8"),batch=await readFile("src/lib/imagegen/batch.ts","utf8");assert.ok(!route.includes("GEN_MAX_CONCURRENT"));assert.ok(!batch.includes("GEN_MAX_CONCURRENT"));
  assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_model_provider_leases")).rows[0].n),0);
  console.log("CONCURRENCY=PASS DB_CAP=6 PROVIDER_CAP=6 ACTUAL_HTTP_PEAK=6 OBSOLETE_GEN_ENV=1 PROVIDER_LEASES=0");
  // The legacy route itself no longer serializes through GEN_MAX_CONCURRENT=1.
  latency=400;peak=0;const routeIds:string[]=[],routeBefore=posts;
  for(let i=0;i<6;i++){
   const next={...input,operationId:randomUUID()},nextPlan=await(await planRoute.POST(req("/api/imagegen/plan",next))).json();
   const accepted=await imagegen.POST(req("/api/imagegen",{...next,confirmation:{billingVersion:nextPlan.billingVersion,modelVersion:nextPlan.modelVersion,credits:nextPlan.totalCredits,confirmed:true}}));assert.equal(accepted.status,200,await accepted.clone().text());routeIds.push(next.operationId);
  }
  await until(async()=>{
   const results=[];for(const id of routeIds)results.push(await(await imagegen.GET(req("/api/imagegen?operationId="+id))).json());return results;
  },results=>results.every(r=>r.status==="succeeded"));
  assert.equal(posts,routeBefore+6);assert.ok(peak>4,"route HTTP concurrency must exceed the obsolete default four: "+peak);
  console.log("LEGACY_ROUTE=PASS SIX_OPERATIONS=6 ACTUAL_HTTP_PEAK="+peak+" GEN_ENV_SLOT_IGNORED=1");

  // The user's batch scheduling count also wins over obsolete GEN env=1.
  const batchModule=await import("../src/lib/imagegen/batch"),{imagegenRequestSchema}=await import("../src/lib/imagegen/schema");
  const request=imagegenRequestSchema.parse({...input,operationId:randomUUID(),mode:"batch",batch:{items:Array.from({length:5},(_,i)=>({key:"batch-"+i,name:"fixture",prompt:"fixture batch "+i})),concurrency:5,maxAttempts:1,failFast:false}});
  const batchPlan=await batchModule.planImagegenBatch(request,owner),batchAccepted=await batchModule.submitImagegenBatch(request,owner,{billingVersion:batchPlan.billingVersion,modelVersion:batchPlan.modelVersion,credits:batchPlan.totalCredits,confirmed:true});
  const batchPosts=posts;latency=150;await batchModule.runImagegenBatchTick(batchAccepted.id);
  assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_imagegen_batch_items WHERE batch_id=$1 AND state='submitted'",[batchAccepted.id])).rows[0].n,5);
  const batchResult=await until(async()=>{await batchModule.runImagegenBatchTick(batchAccepted.id);return batchModule.readImagegenBatch(batchAccepted.id,owner);},r=>r?.status==="succeeded");
  assert.equal(posts,batchPosts+5);assert.equal(batchResult!.items.length,5);
  const cancelledRequest=imagegenRequestSchema.parse({...request,operationId:randomUUID()}),cancelPlan=await batchModule.planImagegenBatch(cancelledRequest,owner),cancelledBatch=await batchModule.submitImagegenBatch(cancelledRequest,owner,{billingVersion:cancelPlan.billingVersion,modelVersion:cancelPlan.modelVersion,credits:cancelPlan.totalCredits,confirmed:true});
  const beforeCancel=posts;await batchModule.cancelImagegenBatch(cancelledBatch.id,owner);await batchModule.runImagegenBatchTick(cancelledBatch.id);assert.equal((await batchModule.readImagegenBatch(cancelledBatch.id,owner))?.status,"cancelled");assert.equal(posts,beforeCancel);
  console.log("BATCH=PASS EXPLICIT_CONCURRENCY=5 FIRST_TICK_SUBMITTED=5 GEN_ENV_IGNORED=1 CANCEL_POSTS=0");
  console.log("MODIFIED=PASS REAL_LOCAL_POSTGRES=1 REAL_HTTP_FIXTURE=1 REAL_ROUTE_BILLING=1 EXTERNAL_SUPPLIER_CALLS=0");
 }finally{
  for(const lease of leases)await lease.release();
  await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await db.getPool().end();await f.cleanup();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
