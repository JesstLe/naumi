/**
 * Isolated PostgreSQL + original HTTP-handler regression, not supplier acceptance.
 * Run: tsx --conditions react-server scripts/verify-imagegen-confirmation-pg.ts [--baseline]
 * Requires NAUMI_VERIFY_ISOLATED_DB=1 and a 127.0.0.1 DATABASE_URL.
 * The only HTTP supplier is a loopback server creating real PNG bytes with sharp.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import type {ImagegenPlan,ImagegenRequest,ImagegenResult} from "../src/lib/imagegen/types";
import type {BillingConfig} from "../src/lib/billing/types";

const baseline=process.argv.includes("--baseline");
type Receipt={response:Response;body:Record<string,any>};
type Wire={path:string;body:Record<string,any>;width:number;height:number};
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

async function main(){
  const database=new URL(process.env.DATABASE_URL||"http://invalid");
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1","explicit isolated database flag required");
  assert.equal(database.hostname,"127.0.0.1","this verifier only connects to loopback PostgreSQL");
  // Do not inherit a production Supabase or optional supplier connection.
  for(const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","REPLICATE_API_TOKEN","NEW_API_FLOW_KEY","FLEET_PORTAL_ONLY","NAUMI_AUTH_LOGIN_ONLY"])delete process.env[key];
  const wires:Wire[]=[],networkUrls:string[]=[],blockedUrls:string[]=[],pngs=new Map<string,Buffer>();
  let supplierOrigin="",supplierSecret="",routerDigest="";
  const f=await createModelFixture(async(req,res)=>{
    try{
      const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
      const bytes=Buffer.concat(chunks),contentType=req.headers["content-type"]||"";
      let body:Record<string,any>={};
      if(bytes.length){
        if(contentType.includes("multipart")){
          const form=await new Request(supplierOrigin+(req.url||"/"),{method:"POST",headers:{"content-type":contentType},body:bytes}).formData();
          body=Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==="string"));
        }else body=JSON.parse(bytes.toString("utf8"));
      }
      res.setHeader("content-type","application/json");
      if(req.url?.startsWith("/internal/config")){
        if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
        if(req.url.endsWith("activate")){routerDigest=body.digest;return res.end(JSON.stringify({id:body.id,digest:routerDigest,phase:"applied"}));}
        return res.end(JSON.stringify({digest:routerDigest}));
      }
      assert.equal(req.method,"POST");
      assert.match(req.url||"",/^\/v1\/images\/(generations|edits)$/);
      assert.equal(req.headers.authorization,`Bearer ${supplierSecret}`);
      assert.equal(body.model,"wire-image-one");
      assert.equal(Number(body.n??1),1,"the real adapter sends one paid POST per output");
      const size=String(body.size||"");assert.match(size,/^(1024|2048|4096)x\1$/,"wire must carry the published exact resolution mapping");
      const [width,height]=size.split("x").map(Number);
      if(!pngs.has(size))pngs.set(size,await sharp({create:{width,height,channels:3,background:{r:31,g:137,b:211}}}).png().toBuffer());
      wires.push({path:req.url!,body,width,height});
      res.end(JSON.stringify({created:1,data:[{b64_json:pngs.get(size)!.toString("base64")}]}));
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error instanceof Error?error.message:String(error)}));}
  });
  supplierOrigin=f.origin;supplierSecret=f.marker;
  const mediaDir=await mkdtemp(join(tmpdir(),"naumi-imagegen-confirmation-"));
  const originalFetch=globalThis.fetch;
  // All application transports go through the real fetch, with a hard loopback guard.
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
    networkUrls.push(url.href);
    if(url.origin!==supplierOrigin){blockedUrls.push(url.href);throw new Error(`Non-fixture network request blocked: ${url.origin}`);}
    return originalFetch(input,init);
  }) as typeof fetch;
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,
    NAUMI_ROUTER_MANAGEMENT_TOKEN:"confirmation-local-router-token-123456789",MODEL_CONFIG_ENVELOPE_SECRET:"confirmation-local-envelope-key-123456789",
    MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"confirmation-local-only",OPENAI_BASE_URL:f.origin+"/v1",OPENAI_IMAGE_QUALITY:"medium",
    STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:mediaDir,VIDEO_WORKER_SECRET:"confirmation-local-worker-secret-123456789"});
  f.config.upstreamModels[0].capabilities.nativeResolutions=["1K","2K","4K"];
  f.config.upstreamModels[0].capabilities.preserveIdentity=true;
  f.config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:"map",field:"size",values:{"1K":"1024x1024","2K":"2048x2048","4K":"4096x4096"}}};
  f.config.publicModels[0].displayResolutions=["1K","2K","4K"];
  let db:typeof import("../src/lib/db")|undefined;
  try{
    await f.repo.current();
    db=await import("../src/lib/db");await db.ensureSchema();
    const pool=db.getPool(),owner=`confirmation-${randomUUID()}@example.test`,other=`confirmation-other-${randomUUID()}@example.test`;
    await db.getOrCreateUser(owner,"Native fixture user");await db.getOrCreateUser(other,"Other native user");
    const {getModelAdministration}=await import("../src/lib/model-config/server"),admin=await getModelAdministration();
    const initial=await admin.billing.current(),billingConfig:BillingConfig=structuredClone(initial.config);
    billingConfig.switches.metering="on";
    for(const feature of ["canvas.image","image.generate"] as const){
      billingConfig.features[feature].enabled=true;billingConfig.features[feature].unit="image";billingConfig.features[feature].rules=[];
      billingConfig.features[feature].pricing={mode:"quality-resolution",quality:{low:4,medium:6,high:10,xhigh:14,max:18,auto:6},resolutionExtra:{"1K":0,"2K":2,"4K":6,"5K":10}};
      billingConfig.features[feature].settlement={qualityBasis:"requested",successBasis:"successful-units",failureBps:0,byokBps:0,reserveBps:10000,unknown:"hold"};
    }
    await admin.billing.publish({id:randomUUID(),actor:"fixture",reason:"distinct confirmation regression tariffs",expectedVersion:initial.version,config:billingConfig});
    const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");
    await withBillingTransaction(pool,tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:1000,source:"admin",reason:"isolated confirmation test",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
    const api=await import("../src/app/api/imagegen/route"),plans=await import("../src/app/api/imagegen/plan/route");
    const {USER_COOKIE,signUserSession,activeNativeUserEmail}=await import("../src/lib/native-auth");
    const {imagegenRequestSchema}=await import("../src/lib/imagegen/schema");
    const {planImagegen}=await import("../src/lib/imagegen/plan");
    const {withModelRequest}=await import("../src/lib/model-config/requests");
    const {currentModelExecution}=await import("../src/lib/model-config/context");
    function headers(email:string|null=owner){const h=new Headers({"content-type":"application/json",origin:f.origin,"sec-fetch-site":"same-origin"});if(email)h.set("cookie",`${USER_COOKIE}=${signUserSession(email,Date.now())}`);return h;}
    function request(resolution="4K",variants=1):ImagegenRequest{return imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"Draw an opaque blue ceramic bottle on a white table",parameters:{quality:"medium",resolution,ratio:"1:1"},variants,output:{format:"png"}});}
    async function post(path:"plan"|"submit",body:unknown,email:string|null=owner,extra?:HeadersInit):Promise<Receipt>{const h=headers(email);if(extra)new Headers(extra).forEach((v,k)=>h.set(k,v));const r=new Request(f.origin+"/api/imagegen"+(path==="plan"?"/plan":""),{method:"POST",headers:h,body:JSON.stringify(body)});const response=await(path==="plan"?plans.POST(r):api.POST(r));return {response,body:await response.json()};}
    async function get(operationId:string,email:string|null=owner):Promise<Receipt>{const response=await api.GET(new Request(f.origin+"/api/imagegen?operationId="+operationId,{headers:headers(email)}));return {response,body:await response.json()};}
    async function preview(r:ImagegenRequest){const p=await post("plan",r);assert.equal(p.response.status,200,JSON.stringify(p.body));return p.body as ImagegenPlan;}
    const confirmation=(p:ImagegenPlan)=>({billingVersion:p.billingVersion,modelVersion:p.modelVersion,credits:p.totalCredits,confirmed:true});
    async function counts(){return (await pool.query("SELECT (SELECT count(*)::int FROM app_image_jobs WHERE kind='imagegen') parents,(SELECT count(*)::int FROM app_image_jobs WHERE kind='generate') children,(SELECT count(*)::int FROM app_ledger WHERE kind='consume') ledgers,(SELECT count(*)::int FROM app_gen_reservations) reservations,(SELECT count(*)::int FROM app_billing_operations WHERE feature IN ('image.generate','canvas.image')) billed")).rows[0];}
    const assertNoNetwork=()=>{assert.equal(wires.length,0);assert.equal(networkUrls.length,0);assert.deepEqual(blockedUrls,[]);};
    async function assertUntouched(){assert.deepEqual(await counts(),{parents:0,children:0,ledgers:0,reservations:0,billed:0});assertNoNetwork();}

    assert.equal(await activeNativeUserEmail(new Request(f.origin,{headers:headers()})),owner,"native HMAC session resolves the real PG user");
    for(const path of ["plan","submit"] as const){
      assert.equal((await post(path,request(),null)).response.status,401,"anonymous user");
      assert.equal((await post(path,request(),owner,{cookie:`${USER_COOKIE}=invalid-signature`})).response.status,401,"forged native session");
      const originRejected=await post(path,request(),owner,{origin:"https://cross-site.invalid","sec-fetch-site":"cross-site"});
      assert.equal(originRejected.response.status,403);assert.equal(originRejected.body.error,"请求来源无效");
      assert.equal((await post(path,request(),owner,{origin:"http://127.0.0.1:1"})).response.status,403,"mismatched origin is rejected without sec-fetch-site help");
    }
    assert.equal((await get(randomUUID(),null)).response.status,401);
    assert.equal((await get(randomUUID(),other)).response.status,404);
    const r1=request("1K"),r2=request("2K"),r4=request("4K"),rVariants=request("4K",2);
    const p1=await preview(r1),p2=await preview(r2),p4=await preview(r4),pVariants=await preview(rVariants);
    assert.deepEqual([p1.totalCredits,p2.totalCredits,p4.totalCredits,pVariants.totalCredits],[6,8,12,24],"tier and quantity pricing must be genuinely distinct");
    assert.equal(pVariants.request.variants,2);assert.equal(pVariants.steps.length,1);assert.equal(pVariants.steps[0].credits,24);
    await assertUntouched();

    if(baseline){
      const rejected=await post("submit",{...r4,confirmation:confirmation(p4)});
      assert.ok([400,409].includes(rejected.response.status),`same valid 4K preview must reproduce definite submit rejection, got ${rejected.response.status} ${JSON.stringify(rejected.body)}`);
      assert.equal(rejected.body.accepted,false,"receipt lookup proves pre-acceptance rejection");
      assert.match(rejected.body.error,/报价.*更新|计划.*更新|重新确认|请确认最新执行计划和积分报价后提交/);
      await assertUntouched();
      console.log(`BASELINE=REPRODUCED HTTP_HANDLERS=ORIGINAL NATIVE_SESSION=PASS TIERS=6,8,12 VARIANTS2=24 REQUEST=4K PREVIEW=12 SUBMIT_STATUS=${rejected.response.status} ACCEPTED=false SUPPLIER_POSTS=0 PARENTS=0 CHILDREN=0 BILLED_OPERATIONS=0 CONSUMPTION_LEDGERS=0 EXTERNAL_CALLS=0`);
      return;
    }

    // A direct domain planner must not inherit the price selected by an old,
    // unrelated outer generic image scope. This fails even without the HTTP fix.
    const hostilePlan=await withModelRequest(new Request(f.origin+"/api/generate-image",{method:"POST",headers:headers(),body:JSON.stringify({model:"image-a",origin:"canvas",prompt:"old outer 1K scope",quality:"medium",resolution:"1K",ratio:"1:1"})}),async()=>{
      const outer=currentModelExecution("image");assert.ok(outer);assert.equal(outer.frozen.requestedParameters?.resolution,"1K");
      const value=await planImagegen(r4,owner);assert.equal(currentModelExecution("image"),outer,"planner leaves the old outer scope unchanged");return value;
    });
    assert.equal(hostilePlan.totalCredits,12,"explicit planner effectiveResolution wins over hostile outer requested 1K price");
    assert.equal(hostilePlan.request.parameters.resolution,"4K");assert.equal(hostilePlan.steps[0].credits,p4.totalCredits);

    const tiny=await sharp({create:{width:64,height:64,channels:3,background:"white"}}).png().toBuffer();
    const ownedId=`owned-${randomUUID()}`,foreignId=`foreign-${randomUUID()}`;
    for(const [id,email] of [[ownedId,owner],[foreignId,other]])await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','fixture','completed',$3,'from-white','canvas')",[id,email,`data:image/png;base64,${tiny.toString("base64")}`]);
    const owned={...request("1K"),inputs:[{artworkId:ownedId,role:"reference" as const}]};
    assert.equal((await preview(owned)).totalCredits,6,"owned input is actually readable by the planner");
    for(const path of ["plan","submit"] as const){const noAccess=await post(path,{...request("1K"),inputs:[{artworkId:foreignId,role:"reference"}]});assert.equal(noAccess.response.status,400);assert.match(noAccess.body.error,/素材不存在或无权访问/);if(path==="submit")assert.equal(noAccess.body.accepted,false);}
    async function expectChanged(r:ImagegenRequest,c:Record<string,unknown>|undefined){const before=await counts(),calls=wires.length;const result=await post("submit",{...r,...(c?{confirmation:c}:{})});assert.equal(result.response.status,409,JSON.stringify(result.body));assert.equal(result.body.code,"IMAGEGEN_PLAN_CHANGED");assert.equal(result.body.accepted,false);assert.deepEqual(await counts(),before,"confirmation conflict creates no parent or billing operation");assert.equal(wires.length,calls);}
    await expectChanged(request(),undefined);
    await expectChanged(request(),{...confirmation(p4),confirmed:false});
    await expectChanged(request(),{...confirmation(p4),credits:p1.totalCredits});
    await expectChanged(request(),{...confirmation(p4),modelVersion:p4.modelVersion+100});
    await expectChanged(request(),{...confirmation(p4),billingVersion:p4.billingVersion+100});
    const batchRequest=imagegenRequestSchema.parse({...request(),mode:"batch",batch:{items:[{key:"front",name:"正面",prompt:"Draw a front view bottle"},{key:"back",name:"背面",prompt:"Draw a back view bottle"}],concurrency:1,maxAttempts:1,failFast:false}});
    const batchPlan=await preview(batchRequest);assert.equal(batchPlan.totalCredits,24);
    await expectChanged(batchRequest,{...confirmation(batchPlan),credits:0});
    assert.equal(Number((await pool.query("SELECT count(*)::int n FROM app_imagegen_batches WHERE id=$1",[batchRequest.operationId])).rows[0].n),0,"batch confirmation conflict creates no batch row");
    await assertUntouched();

    async function finish(r:ImagegenRequest,p:ImagegenPlan,dimension:number){
      const startCalls=wires.length,before=await counts(),accepted=await post("submit",{...r,confirmation:confirmation(p)});
      assert.equal(accepted.response.status,200,JSON.stringify(accepted.body));assert.equal(accepted.body.operationId,r.operationId);
      const replay=await post("submit",r);assert.equal(replay.response.status,200,JSON.stringify(replay.body));assert.equal(replay.body.jobId,accepted.body.jobId,"same operation while pending returns the same parent");
      let result=accepted.body as ImagegenResult;
      const deadline=Date.now()+90000;
      while(!["succeeded","failed","needs_attention","cancelled"].includes(result.status)&&Date.now()<deadline){await wait(75);const poll=await get(r.operationId);assert.equal(poll.response.status,200,JSON.stringify(poll.body));result=poll.body as ImagegenResult;}
      assert.equal(result.status,"succeeded",JSON.stringify(result));assert.equal(result.artifacts.length,r.variants);assert.equal(result.chargedCredits,p.totalCredits);assert.equal(result.billingStatus,"confirmed");
      assert.equal(wires.length-startCalls,r.variants,"exactly one actual supplier POST per output, including retries");
      for(const wire of wires.slice(startCalls)){assert.equal(wire.width,dimension);assert.equal(wire.height,dimension);}
      const {readCanvasOutput}=await import("../src/lib/canvas-image-input");
      for(const artifact of result.artifacts){
        assert.equal(artifact.width,dimension);assert.equal(artifact.height,dimension);
        const stored=await readCanvasOutput(artifact.url,"http://internal",owner),metadata=await sharp(stored.buffer).metadata();
        assert.equal(metadata.width,dimension,"decode persisted result bytes, not just receipt metadata");assert.equal(metadata.height,dimension);assert.equal(metadata.format,"png");
        const work=(await pool.query("SELECT email,status FROM app_artworks WHERE id=$1",[artifact.artworkId])).rows[0];assert.equal(work.email,owner);assert.equal(work.status,"completed");
      }
      const parent=(await pool.query("SELECT metered,reserved_cost,snapshot,payload FROM app_image_jobs WHERE id=$1 AND kind='imagegen'",[result.jobId])).rows[0];
      assert.equal(Number(parent.reserved_cost),0,"parent reserves zero; its metered flag is not evidence of a charge");
      assert.equal(Number((await pool.query("SELECT count(*)::int n FROM app_billing_operations WHERE id=$1 OR id=$2",[result.jobId,`tool-${r.operationId}`])).rows[0].n),0,"orchestrator has no separate billed operation");
      const childIds=Object.values(parent.snapshot.children as Record<string,{jobId?:string}>).map(c=>c.jobId).filter(Boolean);
      assert.equal(childIds.length,1);
      const child=(await pool.query("SELECT payload,snapshot FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='generate'",[childIds[0],owner])).rows[0];
      assert.equal(child.snapshot.status,"done");assert.equal(child.snapshot.images.length,r.variants);assert.equal(child.payload.p.resolution,dimension===4096?"4K":dimension===2048?"2K":"1K");
      assert.equal(child.payload.billingQuote.facts.quantity,r.variants);assert.equal(child.payload.billingQuote.facts.resolution,r.parameters.resolution);assert.equal(child.payload.billingQuote.requestedCredits,p.totalCredits);
      const bills=(await pool.query("SELECT o.id,o.state,o.charged_credits,o.quote,o.ledger_id,l.delta,l.kind FROM app_billing_operations o LEFT JOIN app_ledger l ON l.id=o.ledger_id WHERE o.id=ANY($1::text[]) AND o.email=$2",[childIds,owner])).rows;
      assert.equal(bills.length,1,"one real child billing operation, no parent billing");assert.equal(bills[0].state,"settled");assert.equal(Number(bills[0].charged_credits),p.totalCredits);assert.equal(bills[0].kind,"consume");assert.equal(Number(bills[0].delta),-p.totalCredits);assert.equal(bills[0].quote.facts.quantity,r.variants);
      const after=await counts();assert.equal(after.parents-before.parents,1);assert.equal(after.children-before.children,1);assert.equal(after.ledgers-before.ledgers,1,"single image has one ledger; variants=2 has one quantity=2 aggregate child ledger");assert.equal(after.billed-before.billed,1);assert.equal(after.reservations,0);
      const repeated=await post("submit",{...r,confirmation:{...confirmation(p),credits:0,confirmed:false}});assert.equal(repeated.response.status,200,JSON.stringify(repeated.body));assert.equal(repeated.body.jobId,result.jobId);assert.equal((await get(r.operationId,other)).response.status,404,"native foreign user cannot read another receipt");
      assert.equal(wires.length,startCalls+r.variants);assert.deepEqual(await counts(),after,"old receipt never reserves or settles again");
      return {result,child};
    }
    await finish(r1,p1,1024);await finish(r2,p2,2048);await finish(r4,p4,4096);await finish(rVariants,pVariants,4096);

    // Publish a real new fixture model version whose available maximum is 2K.
    const current=await f.repo.current(),fallbackConfig=structuredClone(current.config);
    fallbackConfig.upstreamModels[0].capabilities.nativeResolutions=["1K","2K"];
    fallbackConfig.upstreamModels[0].parameterMap={resolutionPolicy:{mode:"map",field:"size",values:{"1K":"1024x1024","2K":"2048x2048"}}};
    fallbackConfig.publicModels[0].displayResolutions=["1K","2K"];
    const draft=await f.repo.draft("fixture"),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:fallbackConfig,actor:"fixture"});
    const publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:"fixture",reason:"controlled 4K to 2K delivery fallback"});await f.repo.markApplied(publication.id,publication.digest);
    const oldCounts=await counts(),oldCalls=wires.length;
    const oldReceipt=await post("submit",{...r4,confirmation:confirmation(p4)});assert.equal(oldReceipt.response.status,200,JSON.stringify(oldReceipt.body));assert.equal(oldReceipt.body.jobId,`imagegen-${r4.operationId}`);assert.equal(wires.length,oldCalls);assert.deepEqual(await counts(),oldCounts,"historical accepted 4K receipt survives changed model configuration without new paid POST");
    await expectChanged(request(),confirmation(p4));
    const fallbackRequest=request("4K"),fallback=await preview(fallbackRequest);
    assert.equal(fallback.totalCredits,p4.totalCredits,"requested 4K price is unchanged when actual delivery falls back to 2K");assert.equal(fallback.requestedParameters?.resolution,"4K");assert.equal(fallback.request.parameters.resolution,"2K");assert.equal(fallback.steps[0].parameters.resolution,"2K");assert.match(fallback.warnings.join(" "),/4K.*2K/);
    const delivered=await finish(fallbackRequest,fallback,2048);assert.equal(delivered.child.payload.billingQuote.requestedParameters.resolution,"4K");assert.equal(delivered.child.payload.billingQuote.effectiveParameters.resolution,"2K");assert.match(delivered.result.warnings!.join(" "),/4K.*2K/);

    // A genuine billing publication invalidates only NEW submissions, not receipts.
    const now=await admin.billing.current(),repriced=structuredClone(now.config);
    for(const feature of ["canvas.image","image.generate"] as const){const pricing=repriced.features[feature].pricing;assert.equal(pricing.mode,"quality-resolution");if(pricing.mode==="quality-resolution")pricing.resolutionExtra["4K"]=8;}
    await admin.billing.publish({id:randomUUID(),actor:"fixture",reason:"stale billing preview regression",expectedVersion:now.version,config:repriced});
    const unchanged=await counts(),paid=wires.length;
    const historical=await post("submit",{...fallbackRequest,confirmation:confirmation(fallback)});assert.equal(historical.response.status,200);assert.equal(historical.body.chargedCredits,12);assert.equal(wires.length,paid);assert.deepEqual(await counts(),unchanged);
    const repricedRequest=request("4K");await expectChanged(repricedRequest,confirmation(fallback));assert.equal((await preview(repricedRequest)).totalCredits,14,"fresh preview returns the new selected-tier quote");
    const changedContent=await post("submit",{...r4,prompt:"Changed content must not reuse a paid operation"});assert.equal(changedContent.response.status,400);assert.equal(changedContent.body.accepted,true);assert.match(changedContent.body.error,/冲突/);assert.equal(wires.length,paid);assert.deepEqual(await counts(),unchanged);
    const finalCounts=await counts(),totals=(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int charged FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0];
    assert.deepEqual(finalCounts,{parents:5,children:5,ledgers:5,reservations:0,billed:5});assert.deepEqual(totals,{n:5,charged:62});assert.equal(wires.length,6);assert.deepEqual(blockedUrls,[]);
    console.log("MODIFIED=PASS HTTP_HANDLERS=ORIGINAL NATIVE_SESSION=PASS AUTH_SOURCE_INPUT_OWNERSHIP=PASS TIERS=6,8,12 VARIANTS2_CREDITS=24 VARIANTS2_OUTPUTS=2 VARIANTS2_AGGREGATE_LEDGERS=1 HOSTILE_OUTER_1K_PLAN_4K=12 REQUESTED_4K_EFFECTIVE_2K=12 CONFIRMATION_409_IMAGEGEN_PLAN_CHANGED_ACCEPTED_FALSE=PASS ACTUAL_PNG_PIXELS=1024,2048,4096 SINGLE_OUTPUT_SINGLE_LEDGER=PASS PARENTS=5 CHILDREN=5 ARTIFACTS=6 BILLED_OPERATIONS=5 CONSUMPTION_LEDGERS=5 CHARGED_CREDITS=62 RESERVATIONS=0 LOOPBACK_SUPPLIER_POSTS=6 OLD_RECEIPT_NO_REPOST=PASS EXTERNAL_CALLS=0");
    console.log("BOUNDARY=local isolated PostgreSQL + original Request/Response handlers + loopback sharp PNG supplier; not production, external supplier, browser or nginx acceptance");
  }finally{
    if(db){const {closeImageCoordinationPool}=await import("../src/lib/imagegen/coordination-pool");await closeImageCoordinationPool();await db.getPool().end();}
    await f.cleanup();globalThis.fetch=originalFetch;
    assert.equal(dirname(resolve(mediaDir)),resolve(tmpdir()));await rm(mediaDir,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
