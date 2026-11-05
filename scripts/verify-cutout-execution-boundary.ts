/** Same actual-entry / PG scenarios run against the full pre-refactor tree and the candidate. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  const baseline=process.argv.includes("--baseline");
  let calls=0,checks=0,mode:"ok"|"unknown"|"reject"="ok",db:any;
  const check=(actual:unknown,expected:unknown,message:string)=>{assert.deepEqual(actual,expected,message);checks++;};
  const input=await sharp({create:{width:64,height:64,channels:4,background:"white"}}).png().toBuffer();
  const subject=await sharp({create:{width:32,height:32,channels:4,background:"blue"}}).png().toBuffer();
  const png=await sharp({create:{width:64,height:64,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:subject,left:16,top:16}]).png().toBuffer();
  const wire:any[]=[];
  const f=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    res.setHeader("content-type","application/json");
    if(req.url?.endsWith("/images/edits")){
      calls++;
      const form=await new Request(f.origin+req.url,{method:"POST",headers:{"content-type":req.headers["content-type"]!},body:Buffer.concat(chunks)}).formData();
      wire.push({model:form.get("model"),background:form.get("background"),inputs:form.getAll("image[]").length||form.getAll("image").length});
      if(mode==="unknown"){res.destroy();return;}
      if(mode==="reject"){res.statusCode=403;return res.end(JSON.stringify({error:{message:"fixture supplier rejected",type:"invalid_request_error"}}));}
      return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
    }
    res.statusCode=404;res.end("{}");
  });
  const media=await mkdtemp(join(tmpdir(),"naumi-cutout-r1a2-"));
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-independent-r1a2-20261024",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-envelope-independent-r1a2-20261024",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:f.origin+"/v1",REPLICATE_API_TOKEN:"",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media});
  try{
    f.config.upstreamModels[0].capabilities.transparent=true;f.config.upstreamModels[0].capabilities.preserveIdentity=true;
    f.config.bindings["image.cutout"]="image-a";
    await f.repo.current();db=await import("../src/lib/db");await db.ensureSchema();
    const billing=await import("../src/lib/billing/service"),service=billing.createBillingService();
    const user=async(amount:number)=>{const email=`cut-${randomUUID()}@example.test`;await db.getOrCreateUser(email,"R1A2 fixture");await billing.withBillingTransaction(db.getPool(),async tx=>{
      await tx.query("DELETE FROM app_ledger WHERE email=$1",[email]);await tx.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await tx.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[email]);
      if(amount)await service.grantTx(tx,{id:randomUUID(),email,amount,source:"admin",reason:"isolated cutout fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"});
    });return email;};
    const owner=await user(200),poor=await user(0);
    const {getBillingRuntime}=await import("../src/lib/billing/server"),runtime=await getBillingRuntime(),old=await runtime.config.current(),config=structuredClone(old.config);
    config.switches.metering="on";config.features["tool.cutout"].pricing={mode:"fixed",credits:3};config.features["tool.cutout"].rules=[];
    config.features["canvas.assistant"].pricing={mode:"fixed",credits:2};config.features["canvas.assistant"].rules=[];
    const snapshot=await runtime.config.publish({id:randomUUID(),expectedVersion:old.version,config,actor:"fixture",reason:"R1A2 frozen pricing"});
    const target=`target-${randomUUID()}`,poorTarget=`target-${randomUUID()}`;
    for(const [id,email]of [[target,owner],[poorTarget,poor]])await db.addArtworks(email,[{id,title:"Source",category:"main",prompt:"",status:"completed",image:`data:image/png;base64,${input.toString("base64")}`,gradient:"",origin:"canvas",ratio:"1:1",resolution:"1K"}]);
    const {imagegenRequestSchema}=await import("../src/lib/imagegen/schema"),{planImagegen,imagegenFingerprint}=await import("../src/lib/imagegen/plan"),{executeImagegenStep}=await import("../src/lib/imagegen/adapters");
    const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"edit",prompt:"去掉背景\n保留商品",modelId:"image-a",inputs:[{artworkId:target,role:"edit-target"}],parameters:{quality:"medium",resolution:"1K",ratio:"1:1"}});
    const original=await planImagegen(request,owner),step=original.steps[0];check([step.operation,step.credits],["cutout",3],"real cutout plan");
    const variant=()=>{const request={...original.request,operationId:randomUUID()};return {...original,request,fingerprint:imagegenFingerprint(request)};};
    const {imagegenStepId,imagegenStepIntent}=await import("../src/lib/imagegen/generation-core"),{compileImagegenPrompt}=await import("../src/lib/imagegen/prompt"),sync=await import("../src/lib/billing/synchronous"),{withImagegenStep}=await import("../src/lib/imagegen/context");
    const {signUserSession,USER_COOKIE}=await import("../src/lib/native-auth"),{signAcceptedModelContext}=await import("../src/lib/model-config/accepted-context");
    const http=async(p=original)=>{
      const form=new FormData();form.set("image",new File([new Uint8Array(input)],"target.png",{type:"image/png"}));
      for(const [key,value]of Object.entries({prompt:compileImagegenPrompt(p.request,imagegenStepIntent(p,step.key),p.skillInstructions),parentId:p.request.inputs[0].artworkId,quality:p.request.parameters.quality||"medium",resolution:String(step.parameters.resolution||"1K"),ratio:p.request.parameters.ratio||"1:1"}))form.set(key,value);
      const headers={cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,origin:"http://internal","x-naumi-billing-operation-id":imagegenStepId(p.request.operationId,step.key),"x-naumi-model-version":String(p.modelVersion),"x-naumi-billing-version":String(p.billingVersion),"x-naumi-billing-credits":String(step.credits),"x-naumi-feature-model":step.modelId||"","x-naumi-accepted-model-context":await signAcceptedModelContext(owner,{modelVersion:p.modelVersion,billingVersion:p.billingVersion})};
      return new Request("http://internal/api/cutout",{method:"POST",headers,body:form});
    };
    const invoke=(p=original,actor=owner)=>executeImagegenStep(p,step.key,actor);
    const seed=async(p:typeof original,done:boolean)=>{
      const id=`tool-${imagegenStepId(p.request.operationId,step.key)}`,identity=await sync.billingRequestIdentity(await http(p));
      const op={id,email:owner,quote:step.billingQuote!,reason:"Historical receipt",ledgerId:`led-${id}`,fingerprint:identity.hash};
      await billing.withBillingTransaction(db.getPool(),tx=>service.reserveTx(tx,op));
      if(done){await billing.withBillingTransaction(db.getPool(),tx=>service.settleTx(tx,op,{state:"succeeded",items:[{id,state:"succeeded",executedQuality:"medium"}]}));await db.getPool().query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1",[id,JSON.stringify({ok:true,id:"old-cutout-result",url:"/media/old-result.png"})]);}
      return id;
    };
    const saved=variant();await seed(saved,true);const savedResult=await invoke(saved);
    check([savedResult.status,savedResult.body.id,calls],[200,"old-cutout-result",0],"old multipart receipt reused without supplier");
    const pending=variant();await seed(pending,false);const pendingResult=await invoke(pending);check([pendingResult.status,pendingResult.body.code,calls],[409,"OPERATION_PENDING",0],"unknown historical receipt never resubmits");
    const conflict=await invoke({...saved,request:{...saved.request,prompt:"changed"}});check([conflict.status,conflict.body.code],[409,"OPERATION_CONFLICT"],"changed input preserves fingerprint conflict");
    await assert.rejects(()=>invoke(saved,poor),/不存在|无权/);checks++;
    const {withFrozenCreation}=await import("../src/lib/saas/creation-context");
    const conflictScope=await withFrozenCreation({actorEmail:poor,scopeKind:"personal",tenantId:null},()=>invoke(saved)).catch(e=>({status:e.status||409,body:{error:e.message}}));
    check(conflictScope.status,baseline?200:409,"injected in-process actor mismatch: baseline gap versus explicit typed ownership");
    await db.getPool().query("UPDATE app_users SET account_expires_at=now()-interval '1 minute' WHERE email=$1",[owner]);check((await invoke()).status,401,"expired account denied");
    await db.getPool().query("UPDATE app_users SET account_expires_at=NULL,banned=true WHERE email=$1",[owner]);check((await invoke()).status,401,"banned account denied");await db.getPool().query("UPDATE app_users SET banned=false WHERE email=$1",[owner]);
    const poorPlan={...original,request:{...original.request,operationId:randomUUID(),inputs:[{artworkId:poorTarget,role:"edit-target" as const}]}};const denied=await invoke(poorPlan,poor);
    check([denied.status,denied.body.code,calls],[402,"INSUFFICIENT_CREDITS",0],"real wallet insufficient before supplier");
    const updated=structuredClone(snapshot.config);updated.features["tool.cutout"].pricing={mode:"fixed",credits:19};await runtime.config.publish({id:randomUUID(),expectedVersion:snapshot.version,config:updated,actor:"fixture",reason:"current cutout price differs"});
    const models=await f.repo.current(),mc=structuredClone(models.config);mc.publicModels[0].label="Changed current model metadata";
    const draft=await f.repo.draft("fixture"),next=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:mc,actor:"fixture"});const pub=await f.repo.stage({id:randomUUID(),draftId:next.id,expectedRevision:next.revision,expectedVersion:models.version,actor:"fixture",reason:"current model changed"});await f.repo.markApplied(pub.id,pub.digest);
    const live=variant(),results=await Promise.all([invoke(live),invoke(live)]),winner=results.find(r=>r.status===200);
    assert.ok(winner?.body.id,JSON.stringify(results));checks++;
    check(results.every(r=>r.status===200||r.status===409||baseline&&r.status===503),true,"concurrent loser is pending, not a new execution or 503");
    check(calls,1,"concurrent cutout submits supplier once");check(wire[0],{model:"wire-image-one",background:"transparent",inputs:1},"frozen model wire");
    const id=`tool-${imagegenStepId(live.request.operationId,step.key)}`,row=(await db.getPool().query("SELECT quote,state,charged_credits FROM app_billing_operations WHERE id=$1",[id])).rows[0];
    check(row.quote,step.billingQuote,"full frozen quote survives current changes");check([row.state,Number(row.charged_credits)],["settled",3],"original price settled");
    check((await db.getPool().query("SELECT count(*)::int n FROM app_ledger WHERE id=$1",[`led-${id}`])).rows[0].n,1,"one consume");
    check((await db.listArtworksByIds(owner,[winner.body.id]))[0].parentId,target,"cutout remains source child");
    check((await invoke(live)).body.id,winner.body.id,"typed replay same result");
    const {POST}=await import("../src/app/api/cutout/route");const replay=await POST(await http(live));check([replay.status,(await replay.json()).id,calls],[200,winner.body.id,1],"HTTP and typed share one receipt");
    const fresh=variant(),legacyRequest=await http(fresh);const legacy=await withImagegenStep(fresh.request,imagegenStepIntent(fresh,step.key),()=>POST(legacyRequest),fresh.ratioContractVersion,fresh.requestedParameters,step.eligibleUpstreamIds,{owner,operationId:imagegenStepId(fresh.request.operationId,step.key),quote:step.billingQuote!});
    check(legacy.status,200,await legacy.clone().text());check(calls,2,"HTTP still executes common use case");
    const {saveImagegenInput}=await import("../src/lib/imagegen/input-assets"),asset=await saveImagegenInput(input,owner);
    const assetPlan={...variant(),request:{...variant().request,inputs:[{artworkId:asset.artworkId,role:"edit-target" as const}]}};
    check((await invoke(assetPlan)).status,200,"private asset target still accepted without artwork parent");check(calls,3,"asset submits once");
    const {issueImagegenQuote}=await import("../src/lib/imagegen/quotes"),{submitImagegen,getImagegenResult}=await import("../src/lib/imagegen/dispatch");
    const parentPlan=variant();await issueImagegenQuote(parentPlan.request,owner,parentPlan);
    let parent=await submitImagegen(parentPlan.request,owner);
    for(let i=0;i<200&&!['succeeded','failed','needs_attention'].includes(parent.status);i++){await new Promise(r=>setTimeout(r,20));parent=(await getImagegenResult(parentPlan.request.operationId,owner))!;}
    check(parent.status,"succeeded",JSON.stringify(parent));check(parent.artifacts.length,1,"parent receives cutout artwork");check(parent.chargedCredits,3,"parent reports one child charge");
    check(calls,4,"parent executes one cutout");await submitImagegen(parentPlan.request,owner);check(calls,4,"parent retry reuses completed cutout");
    mode="unknown";const uncertain=variant(),un=await invoke(uncertain);check(un.status>=400,true,"unknown transport is not success");const before=calls;
    const uncertainAgain=await invoke(uncertain);check([uncertainAgain.status,uncertainAgain.body.code,calls],[409,"OPERATION_PENDING",before],"unknown repeats never POST");
    mode="reject";const rejected=variant(),rej=await invoke(rejected);check(rej.status>=400,true,"known supplier rejection stays error");const rejectId=`tool-${imagegenStepId(rejected.request.operationId,step.key)}`;
    check(Number((await db.getPool().query("SELECT charged_credits FROM app_billing_operations WHERE id=$1",[rejectId])).rows[0].charged_credits),0,"confirmed rejection has zero debit");mode="ok";

    // The shared billing extraction must preserve original streaming response identity and replay format.
    const streamId=randomUUID(),{quote}=await import("../src/lib/billing/quote");
    const textQuote=quote(snapshot,{feature:"canvas.assistant",quantity:1,quality:"medium",resolution:"1K",byok:false,metered:true,paidFen:0,userGroup:"default"});
    const textRequest=()=>new Request("http://internal/api/canvas/assistant",{method:"POST",headers:{cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"content-type":"application/json","x-naumi-billing-operation-id":streamId,"x-naumi-billing-version":String(snapshot.version)},body:JSON.stringify({message:"fixture"})});
    let finish!:()=>void,settled!:Promise<void>,originalResponse:Response|undefined,streamActions=0;
    const gate=new Promise<void>(r=>finish=r);
    const streamAction=async()=>{streamActions++;await sync.configuredToolCost();originalResponse=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"fixture"}\n\n'));c.close();}}),{headers:{"content-type":"text/event-stream","x-fixture-header":"preserved"}});settled=gate.then(()=>sync.completeSynchronousStream({text:"saved reply",model:"fixture",agentFrames:[{type:"delta",data:{text:"saved reply"}}]}));return originalResponse;};
    const textContext=<T>(action:()=>Promise<T>)=>withImagegenStep(original.request,original.intent,action,original.ratioContractVersion,undefined,undefined,{owner,operationId:streamId,quote:textQuote});
    const stream=await textContext(()=>sync.withBillingRequest(textRequest(),"canvas.assistant",streamAction));check(stream===originalResponse,true,"stream not cloned or buffered");check(stream.headers.get("x-fixture-header"),"preserved","stream headers unchanged");
    finish();await settled;const streamReplay=await textContext(()=>sync.withBillingRequest(textRequest(),"canvas.assistant",streamAction));check(streamReplay.headers.get("content-type")?.startsWith("text/event-stream"),true,"settled assistant replay stays SSE");
    check((await streamReplay.text()).includes('"replayed":true'),true,"replay completion marker");check(streamActions,1,"assistant original action once");
    const plainResponse=new Response("unchanged plain body",{status:202,headers:{"content-type":"text/plain","x-fixture-header":"retained"}});
    const plain=await sync.withBillingRequest(new Request("http://internal/api/cutout",{method:"POST",headers:{cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"x-naumi-billing-operation-id":randomUUID()}}),"tool.cutout",async()=>plainResponse);
    check(plain===plainResponse,true,"non-JSON HTTP response is not reconstructed");check(await plain.text(),"unchanged plain body","non-JSON body preserved");

    const {JOBS}=await import("../src/lib/imagegen/generation-runtime"),{GET}=await import("../src/app/api/generate-image/route");
    const poll=async(job:string,email=owner)=>GET(new Request("http://internal/api/generate-image?job="+job,{headers:{cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`}}));
    const queryId=`query-${randomUUID()}`;await JOBS.create(queryId,owner,{status:"pending",createdAt:Date.now()}, {},3,true);
    check((await poll(queryId,poor)).status,403,"query enforces owner");check((await (await poll(queryId)).json()).status,"pending","pending query");
    await JOBS.patch(queryId,{status:"done",images:[{id:"query-art",url:"/media/query.png",gradient:"",prompt:"",ratio:"1:1",createdAt:"fixture",execution:{quality:"medium",upstream:"private-wire",reason:"fixture",platformFunded:false}}],creditsUsed:3});
    // Receipt charges now come from the real settlement/ledger, not an invented
    // snapshot amount on an unbilled job. Keep the compatibility expectation 3.
    await JOBS.settleResults(queryId,3,"fixture query settled",{state:"succeeded",items:[{id:"query-art",state:"succeeded",executedQuality:"medium"}]});
    const done=await (await poll(queryId)).json();check([done.status,done.creditsUsed],["done",3],"done query retains result");check("execution" in done.images[0],false,"query strips private execution");
    await JOBS.patch(queryId,{status:"needs_attention",error:"saved pending reason"});const review=await (await poll(queryId)).json();check([review.status,review.reviewRequired,review.error],["error",true,"saved pending reason"],"review query unchanged");
    check((await GET(new Request("http://internal/api/generate-image?active"))).status,401,"active requires login");
    const active=await GET(new Request("http://internal/api/generate-image?active",{headers:{cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`}}));check(Array.isArray((await active.json()).jobs),true,"active query remains compatible");
    check((await GET(new Request("http://internal/api/generate-image?job=imagegen-"+randomUUID()))).status,401,"parent query requires login");
    check((await poll("imagegen-"+randomUUID())).status,404,"missing parent remains not found");
    check(calls,before+1,"query and streaming never call image supplier");
    console.log(`CUTOUT_EXECUTION_BOUNDARY=PASS mode=${baseline?"BASELINE":"MODIFIED"} ACTOR_CONTEXT=${baseline?"LEGACY_GAP":"BOUND"} checks=${checks} REAL_PG=1 OLD_RECEIPT=1 RAW_MULTIPART_IDENTITY=1 FROZEN_QUOTE=FULL CURRENT_MODEL_CHANGED=1 CURRENT_PRICE=19 ORIGINAL_PRICE=3 CONCURRENT_SUPPLIER_POSTS=1 CONCURRENT_STATUS=${results.map(r=>r.status).sort().join('/')} UNKNOWN_REPOSTS=0 HTTP_TYPED_RECEIPT=SHARED SSE=UNCHANGED QUERY=COMPATIBLE EXTERNAL=0`);
  }finally{
    if(db){await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await db.getPool().end();}
    await f.cleanup();await rm(media,{recursive:true,force:true});
    console.log("CUTOUT_FIXTURE_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1 TEMP_MEDIA_REMOVED=1");
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
