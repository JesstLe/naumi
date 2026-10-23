/**
 * Isolated PostgreSQL + original HTTP-handler regression, not supplier acceptance.
 * Run: tsx --conditions react-server scripts/verify-imagegen-frozen-quote-pg.ts [--baseline]
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
const simplify=process.argv.includes("--simplify");
type Receipt={response:Response;body:Record<string,any>};
type QuotedPlan=ImagegenPlan&{quote?:{id:string;expiresAt:string}};
type Wire={path:string;body:Record<string,any>;width:number;height:number;inputs:number};
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
      let body:Record<string,any>={},inputs=0;
      if(bytes.length){
        if(contentType.includes("multipart")){
          const form=await new Request(supplierOrigin+(req.url||"/"),{method:"POST",headers:{"content-type":contentType},body:bytes}).formData();
          body=Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==="string"));inputs=[...form.values()].filter(v=>v instanceof File).length;
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
      wires.push({path:req.url!,body,width,height,inputs});
      res.end(JSON.stringify({created:1,data:[{b64_json:pngs.get(size)!.toString("base64")}]}));
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error instanceof Error?error.message:String(error)}));}
  });
  supplierOrigin=f.origin;supplierSecret=f.marker;
  const mediaDir=await mkdtemp(join(tmpdir(),"naumi-imagegen-frozen-quote-"));
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
  f.config.publicModels[0].supplierRouting={mode:"balanced",channels:[{upstreamId:"u1",enabled:true,priority:1,weight:1}]};
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
      billingConfig.features[feature].enabled=true;billingConfig.features[feature].unit="image";
      // Re-reading even the OLD config against newly changed paidFen would price
      // this at 2; preserving just configVersion is not a frozen billing quote.
      billingConfig.features[feature].rules=[{id:"paid-fixture-discount",priority:1,when:{minPaidFen:1},pricing:{mode:"fixed",credits:2}}];
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
    const batchApi=await import("../src/app/api/imagegen/batches/[id]/route");
    const {ensureImagegenBatches}=await import("../src/lib/imagegen/batch-repository");await ensureImagegenBatches();

    function headers(email:string|null=owner){const h=new Headers({"content-type":"application/json",origin:f.origin,"sec-fetch-site":"same-origin"});if(email)h.set("cookie",`${USER_COOKIE}=${signUserSession(email,Date.now())}`);return h;}
    function request(resolution="4K",variants=1):ImagegenRequest{return imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"Draw an opaque blue ceramic bottle on a white table",parameters:{quality:"medium",resolution,ratio:"1:1"},variants,output:{format:"png"}});}
    async function post(path:"plan"|"submit",body:unknown,email:string|null=owner,extra?:HeadersInit):Promise<Receipt>{const h=headers(email);if(extra)new Headers(extra).forEach((v,k)=>h.set(k,v));const r=new Request(f.origin+"/api/imagegen"+(path==="plan"?"/plan":""),{method:"POST",headers:h,body:JSON.stringify(body)});const response=await(path==="plan"?plans.POST(r):api.POST(r));return {response,body:await response.json()};}
    async function get(operationId:string,email:string|null=owner,extra?:HeadersInit):Promise<Receipt>{const h=headers(email);if(extra)new Headers(extra).forEach((v,k)=>h.set(k,v));const response=await api.GET(new Request(f.origin+"/api/imagegen?operationId="+operationId,{headers:h}));return {response,body:await response.json()};}
    async function preview(r:ImagegenRequest,extra?:HeadersInit){const p=await post("plan",r,owner,extra);assert.equal(p.response.status,200,JSON.stringify(p.body));return p.body as QuotedPlan;}
    const confirmation=(p:ImagegenPlan)=>({billingVersion:p.billingVersion,modelVersion:p.modelVersion,credits:p.totalCredits,confirmed:true});
    async function counts(){return (await pool.query(`SELECT (SELECT count(*)::int FROM app_image_jobs WHERE kind='imagegen') parents,(SELECT count(*)::int FROM app_image_jobs WHERE kind='generate') children,(SELECT count(*)::int FROM app_ledger WHERE kind='consume') ledgers,(SELECT count(*)::int FROM app_gen_reservations) reservations,(SELECT count(*)::int FROM app_billing_operations WHERE feature IN ('image.generate','canvas.image')) billed,(SELECT count(*)::int FROM app_imagegen_batches) batches,(SELECT count(*)::int FROM app_imagegen_batch_items) "batchItems"`)).rows[0];}
    const assertNoNetwork=()=>{assert.equal(wires.length,0);assert.equal(networkUrls.length,0);assert.deepEqual(blockedUrls,[]);};
    async function assertUntouched(){assert.deepEqual(await counts(),{parents:0,children:0,ledgers:0,reservations:0,billed:0,batches:0,batchItems:0});assertNoNetwork();}

    const cases:Record<string,unknown>[]=[];
    const record=(name:string,evidence:Record<string,unknown>={})=>{const row={case:name,result:"PASS",...evidence};cases.push(row);console.log(JSON.stringify(row));};
    const minimal=(r:ImagegenRequest,p:QuotedPlan,confirmed=true)=>{assert.ok(p.quote?.id);return {operationId:r.operationId,quoteId:p.quote.id,confirmed};};
    async function expire(p:QuotedPlan){assert.ok(p.quote);const updated=await pool.query("UPDATE app_imagegen_quotes SET expires_at=now()-interval '1 minute' WHERE id=$1 RETURNING expires_at",[p.quote.id]);assert.equal(updated.rowCount,1);}
    async function expectReject(body:unknown,expectedStatus:number,code?:string,email=owner,extra?:HeadersInit){
      const before=await counts(),calls=wires.length,value=await post("submit",body,email,extra);
      assert.equal(value.response.status,expectedStatus,JSON.stringify(value.body));
      if(code)assert.equal(value.body.code,code,JSON.stringify(value.body));
      assert.deepEqual(await counts(),before,"rejected submit changes no job, batch or financial row");assert.equal(wires.length,calls,"rejected submit makes zero new supplier POSTs");return value;
    }
    async function publishPrice(credits:number,metering:BillingConfig["switches"]["metering"]="on"){
      const now=await admin.billing.current(),config=structuredClone(now.config);config.switches.metering=metering;
      for(const feature of ["canvas.image","image.generate"] as const){const pricing=config.features[feature].pricing;assert.equal(pricing.mode,"quality-resolution");if(pricing.mode==="quality-resolution")pricing.resolutionExtra["4K"]=credits-6;config.features[feature].rules=[];}
      return admin.billing.publish({id:randomUUID(),actor:"fixture",reason:`frozen quote tariff ${credits} metering ${metering}`,expectedVersion:now.version,config});
    }
    async function publishModel(){
      const now=await f.repo.current(),config=structuredClone(now.config);config.publicModels[0].label="Published label after preview";config.publicModels[0].supplierRouting!.channels[0].weight=77;
      config.upstreamModels[0].label="Published supplier label after preview";
      const draft=await f.repo.draft("fixture"),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor:"fixture"});
      const publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:now.version,actor:"fixture",reason:"real model publication retaining legal u1 channel"});
      const result=await f.repo.markApplied(publication.id,publication.digest);assert.ok(result.version>now.version);assert.equal(result.config.publicModels[0].supplierRouting!.channels[0].weight,77);return result;
    }
    async function waitResult(r:ImagegenRequest,accepted:Receipt,extra?:HeadersInit){
      assert.equal(accepted.response.status,200,JSON.stringify(accepted.body));assert.equal(accepted.body.operationId,r.operationId);
      let result=accepted.body as ImagegenResult;const deadline=Date.now()+90000;
      while(!["succeeded","failed","needs_attention","cancelled"].includes(result.status)&&Date.now()<deadline){await wait(80);const polled=await get(r.operationId,owner,extra);assert.equal(polled.response.status,200,JSON.stringify(polled.body));result=polled.body as ImagegenResult;}
      assert.equal(result.status,"succeeded",JSON.stringify(result));assert.equal(result.billingStatus,"confirmed");return result;
    }
    async function inspectGenerated(r:ImagegenRequest,p:QuotedPlan,result:ImagegenResult,paidFen=0){
      assert.equal(result.chargedCredits,p.totalCredits);assert.equal(result.artifacts.length,r.variants);
      const {readCanvasOutput}=await import("../src/lib/canvas-image-input");
      for(const artifact of result.artifacts){const stored=await readCanvasOutput(artifact.url,"http://internal",owner),metadata=await sharp(stored.buffer).metadata();assert.equal(metadata.width,4096);assert.equal(metadata.height,4096);assert.equal(metadata.format,"png");const row=(await pool.query("SELECT email,status FROM app_artworks WHERE id=$1",[artifact.artworkId])).rows[0];assert.equal(row.email,owner);assert.equal(row.status,"completed");}
      const parent=(await pool.query("SELECT reserved_cost,payload,snapshot FROM app_image_jobs WHERE id=$1 AND kind='imagegen'",[result.jobId])).rows[0];
      assert.equal(Number(parent.reserved_cost),0);assert.equal(parent.payload.plan.totalCredits,p.totalCredits);assert.equal(parent.payload.plan.modelVersion,p.modelVersion);assert.equal(parent.payload.plan.billingVersion,p.billingVersion);
      assert.deepEqual(parent.payload.plan.request.inputs,r.inputs,"frozen native source IDs remain on parent");
      const childIds=Object.values(parent.snapshot.children as Record<string,{jobId?:string}>).map(c=>c.jobId).filter(Boolean);assert.equal(childIds.length,1);
      const child=(await pool.query("SELECT payload,snapshot FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='generate'",[childIds[0],owner])).rows[0];assert.equal(child.snapshot.status,"done");assert.equal(child.payload.p.resolution,"4K");assert.equal(child.payload.p.imagegen.request.operationId,r.operationId);assert.deepEqual(child.payload.p.imagegen.request.inputs,r.inputs);
      assert.equal(child.payload.billingQuote.requestedCredits,p.totalCredits);assert.equal(child.payload.billingQuote.configVersion,p.billingVersion);assert.equal(child.payload.billingQuote.modelVersion,p.modelVersion);
      assert.equal(child.payload.billingQuote.facts.paidFen,paidFen,"execution uses the preview billing facts");assert.equal(child.payload.billingQuote.facts.metered,true);
      assert.equal(child.payload.modelExecutions.modelVersion,p.modelVersion);assert.equal(child.payload.modelExecutions.billingVersion,p.billingVersion);
      const billing=(await pool.query("SELECT o.id,o.state,o.charged_credits,o.quote,l.delta,l.kind FROM app_billing_operations o LEFT JOIN app_ledger l ON l.id=o.ledger_id WHERE o.id=ANY($1::text[]) AND o.email=$2",[childIds,owner])).rows;
      assert.equal(billing.length,1);assert.equal(billing[0].state,"settled");assert.equal(Number(billing[0].charged_credits),p.totalCredits);assert.equal(Number(billing[0].delta),-p.totalCredits);assert.equal(billing[0].kind,"consume");assert.equal(billing[0].quote.configVersion,p.billingVersion);
      assert.deepEqual(billing[0].quote,child.payload.billingQuote,"settled ledger operation retains exact original quote");
      const originalPlan=(await pool.query("SELECT plan FROM app_imagegen_quotes WHERE id=$1",[p.quote!.id])).rows[0].plan;
      assert.deepEqual(child.payload.billingQuote,originalPlan.steps[0].billingQuote,"whole saved step billingQuote, not a fresh quote with old version numbers");return {parent,child,billing:billing[0]};
    }

    assert.equal(await activeNativeUserEmail(new Request(f.origin,{headers:headers()})),owner);
    for(const path of ["plan","submit"] as const){
      assert.equal((await post(path,request(),null)).response.status,401);assert.equal((await post(path,request(),owner,{cookie:`${USER_COOKIE}=invalid-signature`})).response.status,401);
      assert.equal((await post(path,request(),owner,{origin:"https://cross-site.invalid","sec-fetch-site":"cross-site"})).response.status,403);
    }
    record("original_handlers_native_auth_source_guard",{schema:f.schemaName,nativeSession:true});
    const tiny=await sharp({create:{width:64,height:64,channels:3,background:"white"}}).png().toBuffer(),ownedId=`owned-${randomUUID()}`,foreignId=`foreign-${randomUUID()}`;
    for(const [id,email] of [[ownedId,owner],[foreignId,other]])await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','fixture','completed',$3,'from-white','canvas')",[id,email,`data:image/png;base64,${tiny.toString("base64")}`]);
    const r4=imagegenRequestSchema.parse({...request(),inputs:[{artworkId:ownedId,role:"reference"}]}),p4=await preview(r4);
    assert.equal(p4.totalCredits,12);await assertUntouched();

    if(baseline&&!simplify){
      assert.equal(p4.quote,undefined,"f9 preview has no persisted quote credential");
      const billing=await publishPrice(14),model=await publishModel();
      const rejected=await expectReject({...r4,confirmation:confirmation(p4)},409,"IMAGEGEN_PLAN_CHANGED");assert.equal(rejected.body.accepted,false);await assertUntouched();
      const fresh=await preview(request());assert.equal(fresh.totalCredits,14);assert.ok(billing.version>p4.billingVersion);assert.ok(model.version>p4.modelVersion);
      console.log(`BASELINE=REPRODUCED PLAN_QUOTE=ABSENT PREVIEW_4K=12 BILLING_PUBLICATION_4K=14 MODEL_PUBLICATION=LABEL_WEIGHT_CHANGED OLD_CONFIRMATION_STATUS=${rejected.response.status} CODE=${rejected.body.code} ACCEPTED=false SUPPLIER_POSTS=0 PARENTS=0 CHILDREN=0 RESERVATIONS=0 EXTERNAL_CALLS=0`);return;
    }

    assert.ok(p4.quote?.id);assert.ok(Date.parse(p4.quote.expiresAt)>Date.now());
    const stored4=(await pool.query("SELECT *,extract(epoch FROM expires_at-created_at)::int ttl FROM app_imagegen_quotes WHERE id=$1",[p4.quote.id])).rows[0];
    assert.equal(stored4.owner,owner);assert.equal(stored4.operation_id,r4.operationId);assert.deepEqual(stored4.request,r4);assert.equal(stored4.plan.totalCredits,12);assert.equal(stored4.ttl,900);assert.equal(stored4.context_key,JSON.stringify(["personal",null,null]));
    assert.equal(stored4.plan.steps[0].billingQuote.requestedCredits,12);assert.equal(stored4.plan.steps[0].billingQuote.facts.paidFen,0);assert.equal((p4.steps[0] as unknown as Record<string,unknown>).billingQuote,undefined,"HTTP preview strips server-only tariff/facts");
    const rTamper=request(),pTamper=await preview(rTamper),rExpired=request(),pExpired=await preview(rExpired),rDenied=request(),pDenied=await preview(rDenied);
    const rBatch=imagegenRequestSchema.parse({...request(),mode:"batch",batch:{items:[{key:"front",name:"Front",prompt:"Draw a front view opaque blue ceramic bottle"},{key:"back",name:"Back",prompt:"Draw a back view opaque blue ceramic bottle"}],concurrency:1,maxAttempts:1,failFast:false}}),pBatch=await preview(rBatch);
    assert.equal(pBatch.totalCredits,24);assert.equal(pBatch.children?.length,2);
    assert.ok(pBatch.children!.every(child=>child.plan.steps.every(step=>(step as unknown as Record<string,unknown>).billingQuote===undefined)),"batch HTTP children also strip server-only billing quotes");await assertUntouched();
    record("quote_preview_no_accept_no_reserve",{credits:12,batchCredits:24,ttlSeconds:stored4.ttl,counts:await counts(),supplierPosts:wires.length});
    let genericPreview:Record<string,any>|undefined;
    if(simplify){
      const quoteApi=await import("../src/app/api/billing/quote/route");
      const stalePreview=headers();stalePreview.set("x-naumi-model-version","999999");
      const response=await quoteApi.POST(new Request(f.origin+"/api/billing/quote",{method:"POST",headers:baseline?headers():stalePreview,body:JSON.stringify({feature:"canvas.image",quantity:1,quality:"medium",resolution:"4K",ratio:"1:1",modelId:"image-a"})}));
      genericPreview=await response.json();assert.equal(response.status,200,JSON.stringify(genericPreview));assert.equal(genericPreview!.credits,12);
    }
    const billing14=await publishPrice(14),model2=await publishModel();
    if(simplify){
      const raw={...r4,confirmation:{confirmed:true,billingVersion:999999,modelVersion:999999,credits:0}};
      const accepted=await post("submit",raw);
      if(baseline){assert.equal(accepted.response.status,409,JSON.stringify(accepted.body));assert.equal(accepted.body.code,"IMAGEGEN_PLAN_CHANGED");await assertUntouched();console.log("SIMPLIFY_BASELINE=REPRODUCED RAW_STALE_HEADERS_409=1 PARENTS=0 SUPPLIER_POSTS=0 CHARGES=0");return;}
      const result=await waitResult(r4,accepted);await inspectGenerated(r4,p4,result);
      const replayCalls=wires.length;assert.equal((await post("submit",raw)).body.jobId,result.jobId);assert.equal(wires.length,replayCalls);
      const batchAccepted=await post("submit",{...rBatch,confirmation:{confirmed:true,billingVersion:999999,modelVersion:999999,credits:0}});
      assert.equal(batchAccepted.response.status,200,JSON.stringify(batchAccepted.body));
      const batchSaved=(await pool.query("SELECT plan FROM app_imagegen_batches WHERE id=$1",[rBatch.operationId])).rows[0];assert.equal(batchSaved.plan.totalCredits,24);
      assert.ok(genericPreview!.quote?.id);assert.equal(genericPreview!.selection.resolution,"4K");
      assert.equal(JSON.stringify(genericPreview).includes('costRates'),false);
      const oldQuoteHeaders=headers();oldQuoteHeaders.set("x-naumi-image-quote",genericPreview!.quote.id);oldQuoteHeaders.set("x-naumi-model-version","999999");oldQuoteHeaders.set("x-naumi-billing-version","999999");oldQuoteHeaders.set("x-naumi-billing-credits","0");oldQuoteHeaders.set("x-naumi-billing-operation-id",randomUUID());
      const legacyApi=await import("../src/app/api/generate-image/route");
      const legacyBody={origin:"canvas",prompt:"Draw an opaque blue ceramic bottle",model:"image-a",quality:"medium",resolution:"4K",ratio:"1:1",count:1};
      const legacyStart=await legacyApi.POST(new Request(f.origin+"/api/generate-image",{method:"POST",headers:oldQuoteHeaders,body:JSON.stringify(legacyBody)}));
      const started=await legacyStart.json();assert.equal(legacyStart.status,200,JSON.stringify(started));assert.match(started.jobId,/^job-/);
      let delivery:Record<string,any>={};for(let i=0;i<600;i++){await wait(80);const response=await legacyApi.GET(new Request(f.origin+"/api/generate-image?job="+started.jobId,{headers:headers()}));delivery=await response.json();if(["done","error","needs_attention"].includes(delivery.status))break;}
      assert.equal(delivery.status,"done",JSON.stringify(delivery));assert.equal(delivery.images.length,1);assert.equal(delivery.creditsUsed,12);
      const saved=(await pool.query("SELECT quote,charged_credits,state FROM app_billing_operations WHERE id=$1",[started.jobId])).rows[0];
      assert.equal(saved.state,"settled");assert.equal(Number(saved.charged_credits),12);assert.equal(saved.quote.configVersion,genericPreview!.version);
      const h=headers(other);h.set("x-naumi-image-quote",genericPreview!.quote.id);
      const foreign=await legacyApi.POST(new Request(f.origin+"/api/generate-image",{method:"POST",headers:h,body:JSON.stringify(legacyBody)}));assert.equal(foreign.status,400);
      const mismatch=await legacyApi.POST(new Request(f.origin+"/api/generate-image",{method:"POST",headers:oldQuoteHeaders,body:JSON.stringify({...legacyBody,count:2})}));assert.notEqual(mismatch.status,200);
      await pool.query("UPDATE app_image_billing_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",[genericPreview!.quote.id]);
      const oldReceipt=await legacyApi.POST(new Request(f.origin+"/api/generate-image",{method:"POST",headers:oldQuoteHeaders,body:JSON.stringify(legacyBody)}));assert.equal(oldReceipt.status,200);assert.equal((await oldReceipt.json()).jobId,started.jobId,"accepted intent is returned before expired quote validation");
      const expiredHeaders=new Headers(oldQuoteHeaders);expiredHeaders.set("x-naumi-billing-operation-id",randomUUID());
      const expiredNew=await legacyApi.POST(new Request(f.origin+"/api/generate-image",{method:"POST",headers:expiredHeaders,body:JSON.stringify(legacyBody)}));assert.equal(expiredNew.status,409);assert.equal((await expiredNew.json()).code,"IMAGE_QUOTE_EXPIRED");
      await expire(pExpired);const rawExpired=await post("submit",{...rExpired,confirmation:{confirmed:true,credits:12}});assert.equal(rawExpired.response.status,409);assert.equal(rawExpired.body.accepted,false,"expired legacy preview must not silently accept current 14");
      const expiredBatchRequest=imagegenRequestSchema.parse({...rBatch,operationId:randomUUID()}),expiredBatchPreview=await preview(expiredBatchRequest);await expire(expiredBatchPreview);
      const rawExpiredBatch=await post("submit",{...expiredBatchRequest,confirmation:{confirmed:true,credits:24}});assert.equal(rawExpiredBatch.response.status,409);assert.equal(rawExpiredBatch.body.accepted,false);
      const {assertQuotedVersion}=await import("../src/lib/billing/request");assert.doesNotThrow(()=>assertQuotedVersion({version:999999,credits:0},saved.quote));
      assert.throws(()=>assertQuotedVersion({version:999999,credits:0},{...saved.quote,facts:{...saved.quote.facts,feature:"video.generate"}}));
      assert.equal(wires.length,2);assert.equal(Number((await pool.query("SELECT count(*) n FROM app_ledger WHERE kind='consume'")).rows[0].n),2);
      const {assertImageBillingSelection}=await import("../src/lib/billing/image-quotes");
      assert.doesNotThrow(()=>assertImageBillingSelection({...saved.quote,facts:{...saved.quote.facts,feature:"image.aplus",ratio:undefined}},{feature:"image.aplus",quantity:1,ratio:"3:2"}),"unquoted legacy ratio is resolved by the handler, not a new fabricated 1:1 constraint");
      const implicitQuoteId=randomUUID(),implicitQuote={...saved.quote,facts:{...saved.quote.facts,ratio:undefined},requestedParameters:{quality:"medium",resolution:"4K",ratio:"1:1"},effectiveParameters:{quality:"medium",resolution:"4K",ratio:"1:1"}};
      await pool.query("INSERT INTO app_image_billing_quotes(id,owner,scope_key,quote,expires_at) VALUES($1,$2,$3,$4::jsonb,now()+interval '15 minutes')",[implicitQuoteId,owner,JSON.stringify(["personal",null]),JSON.stringify(implicitQuote)]);
      const implicitHeaders=headers();implicitHeaders.set("x-naumi-image-quote",implicitQuoteId);
      const {quoteForRequest}=await import("../src/lib/billing/server"),implicitBound=await quoteForRequest(new Request(f.origin+"/api/canvas/expand",{headers:implicitHeaders}),{feature:"canvas.image",quantity:1,ratio:"3:2"});
      assert.equal(implicitBound.facts.ratio,"3:2");assert.equal(implicitBound.requestedParameters!.ratio,"3:2");assert.equal(implicitBound.effectiveParameters!.ratio,"3:2");assert.equal(implicitBound.requestedCredits,12);assert.equal((await pool.query("SELECT quote#>>'{facts,ratio}' ratio FROM app_image_billing_quotes WHERE id=$1",[implicitQuoteId])).rows[0].ratio,null,"original stored quote never changes");
      const currentModels=await admin.repo.current(),maximum2k=structuredClone(currentModels.config);maximum2k.upstreamModels[0].capabilities.nativeResolutions=["1K","2K"];maximum2k.upstreamModels[0].parameterMap={resolutionPolicy:{mode:"map",field:"size",values:{"1K":"1024x1024","2K":"2048x2048"}}};maximum2k.publicModels[0].displayResolutions=["1K","2K"];
      const fallbackDraft=await admin.repo.draft("fixture"),fallbackSaved=await admin.repo.saveDraft({id:fallbackDraft.id,expectedRevision:fallbackDraft.revision,config:maximum2k,actor:"fixture"});const fallbackPublication=await admin.repo.stage({id:randomUUID(),draftId:fallbackSaved.id,expectedRevision:fallbackSaved.revision,expectedVersion:currentModels.version,actor:"fixture",reason:"generic frozen effective tier"});await admin.repo.markApplied(fallbackPublication.id,fallbackPublication.digest);
      const fallbackQuoteApi=await import("../src/app/api/billing/quote/route");const fallbackPreviewResponse=await fallbackQuoteApi.POST(new Request(f.origin+"/api/billing/quote",{method:"POST",headers:headers(),body:JSON.stringify(genericPreview!.selection)})),fallbackPreview=await fallbackPreviewResponse.json();assert.equal(fallbackPreviewResponse.status,200,JSON.stringify(fallbackPreview));assert.equal(fallbackPreview.credits,14);assert.equal(fallbackPreview.requestedParameters.resolution,"4K");assert.equal(fallbackPreview.effectiveParameters.resolution,"2K");
      const fallbackHeaders=headers();fallbackHeaders.set("x-naumi-image-quote",fallbackPreview.quote.id);fallbackHeaders.set("x-naumi-billing-operation-id",randomUUID());
      const fallbackAccepted=await legacyApi.POST(new Request(f.origin+"/api/generate-image",{method:"POST",headers:fallbackHeaders,body:JSON.stringify(legacyBody)})),fallbackJob=await fallbackAccepted.json();assert.equal(fallbackAccepted.status,200,JSON.stringify(fallbackJob));
      let fallbackDelivery:any;for(let i=0;i<600;i++){await wait(80);fallbackDelivery=await(await legacyApi.GET(new Request(f.origin+"/api/generate-image?job="+fallbackJob.jobId,{headers:headers()}))).json();if(["done","error","needs_attention"].includes(fallbackDelivery.status))break;}assert.equal(fallbackDelivery.status,"done",JSON.stringify(fallbackDelivery));assert.equal(fallbackDelivery.creditsUsed,14);assert.equal(wires.at(-1)!.width,2048);assert.equal(wires.length,3);
      const fallbackBill=(await pool.query("SELECT quote,charged_credits FROM app_billing_operations WHERE id=$1",[fallbackJob.jobId])).rows[0];assert.equal(Number(fallbackBill.charged_credits),14);assert.equal(fallbackBill.quote.requestedParameters.resolution,"4K");assert.equal(fallbackBill.quote.effectiveParameters.resolution,"2K");
      console.log("SIMPLIFY_MODIFIED=PASS RAW_OLD_CLIENT_SAVED_PLAN=12 GENERIC_QUOTE_FROZEN=12 STALE_MODEL_BILLING_VERSIONS_IGNORED=1 CLIENT_ZERO_NOT_TRUSTED=1 FOREIGN_DENIED=1 COUNT_TAMPER_DENIED=1 GENERIC_EXPIRED_RECEIPT_FIRST=1 GENERIC_EXPIRED_NEW_NOT_ACCEPTED=1 RAW_EXPIRED_SINGLE_BATCH_NOT_REPRICED=1 GENERIC_4K_TO_2K_FROZEN_PRICE=14 LEGACY_UNQUOTED_RATIO_ALLOWED=1 TEXT_VIDEO_GUARDS_RETAINED=1 SUPPLIER_POSTS=3 LEDGERS=3 CHARGED=38 EXTERNAL_CALLS=0");return;
    }

    const oldModels=await admin.repo.byVersion(p4.modelVersion),oldBilling=await admin.billing.byVersion(p4.billingVersion);
    assert.equal(oldModels.config.publicModels[0].supplierRouting!.channels[0].weight,1);assert.notEqual(oldModels.config.publicModels[0].label,model2.config.publicModels[0].label);
    const oldPricing=oldBilling.config.features["canvas.image"].pricing;assert.equal(oldPricing.mode,"quality-resolution");if(oldPricing.mode==="quality-resolution")assert.equal(oldPricing.resolutionExtra["4K"],6);
    assert.ok(billing14.version>p4.billingVersion);assert.ok(model2.version>p4.modelVersion);assert.equal((await preview(request())).totalCredits,14);
    // A local paid-order fact and grant occur AFTER every old quote preview.
    await pool.query("INSERT INTO app_orders(id,email,kind,item_id,title,credits,amount,status,paid_at) VALUES($1,$2,'pack','fixture','Local recharge fact',100,100,'paid',now())",[randomUUID(),owner]);
    await withBillingTransaction(pool,tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:100,source:"admin",reason:"post-preview recharge fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));assert.equal(await db.totalPaidCents(owner),100);

    for(const extra of [{credits:0},{plan:{...p4,totalCredits:0}},{request:r4},{prompt:"Client replacement"},{confirmation:{confirmed:true}},{billingVersion:billing14.version}])await expectReject({...minimal(r4,p4),...extra},400,"IMAGEGEN_QUOTE_INVALID");
    await expectReject(minimal(r4,p4),400,"IMAGEGEN_QUOTE_INVALID",other);
    await expectReject({...minimal(r4,p4),operationId:randomUUID()},400,"IMAGEGEN_QUOTE_INVALID");
    const contextId=`tree:${ownedId}`;await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,'personal',NULL)",[owner,contextId]);
    await expectReject(minimal(r4,p4),400,"IMAGEGEN_QUOTE_INVALID",owner,{"x-naumi-project-context":contextId});
    for(const changed of [{...r4,prompt:"Changed actual request"},{...r4,parameters:{...r4.parameters,resolution:"1K"}},{...r4,inputs:[]}]){const rejected=await expectReject({...changed,confirmation:{quoteId:p4.quote!.id,confirmed:true}},400,"IMAGEGEN_QUOTE_INVALID");assert.equal(rejected.body.accepted,false);}
    const unconfirmed=await expectReject(minimal(r4,p4,false),409,"IMAGEGEN_PLAN_CHANGED");assert.equal(unconfirmed.body.accepted,false);await assertUntouched();
    record("quote_owner_operation_context_request_and_minimal_extra_rejected",{minimalExtras:6,requestChanges:3,supplierPosts:0});

    const billingOff=await publishPrice(14,"off");assert.equal((await admin.billing.current()).config.switches.metering,"off");
    const before4=await counts(),calls4=wires.length,result4=await waitResult(r4,await post("submit",minimal(r4,p4))),generated4=await inspectGenerated(r4,p4,result4);
    assert.equal(wires.length,calls4+1);assert.equal(wires[calls4].path,"/v1/images/edits");assert.equal(wires[calls4].inputs,1,"native owned reference reaches real multipart adapter");assert.equal(wires[calls4].width,4096);
    const after4=await counts();assert.equal(after4.parents-before4.parents,1);assert.equal(after4.children-before4.children,1);assert.equal(after4.ledgers-before4.ledgers,1);assert.equal(after4.reservations,0);
    record("frozen_12_executes_after_billing_model_recharge_and_metering_change",{operationId:r4.operationId,jobId:result4.jobId,previewCredits:12,currentPrice:14,chargedCredits:result4.chargedCredits,previewBillingVersion:p4.billingVersion,currentBillingVersion:billingOff.version,previewModelVersion:p4.modelVersion,currentModelVersion:model2.version,oldPaidFen:generated4.child.payload.billingQuote.facts.paidFen,newPaidFen:100,currentMetering:"off",oldMetered:generated4.child.payload.billingQuote.facts.metered,actualPng:[4096,4096],nativeInputs:1,ledgerDelta:generated4.billing.delta,supplierPosts:1});
    await publishPrice(14,"on");

    const tamperCalls=wires.length,tamperResult=await waitResult(rTamper,await post("submit",{...rTamper,confirmation:{quoteId:pTamper.quote!.id,confirmed:true,credits:0,billingVersion:999999,modelVersion:999999}}));await inspectGenerated(rTamper,pTamper,tamperResult);assert.equal(wires.length,tamperCalls+1);
    record("client_amount_and_versions_do_not_replace_server_quote",{chargedCredits:tamperResult.chargedCredits});
    await expire(pExpired);const expired=await expectReject(minimal(rExpired,pExpired),409,"IMAGEGEN_PLAN_CHANGED");assert.equal(expired.body.accepted,false);
    const refreshed=await preview(rExpired);assert.equal(refreshed.totalCredits,14);assert.notEqual(refreshed.quote!.id,pExpired.quote!.id);
    // The refresh changes the future quote, not the already accepted old operation.
    record("expired_unaccepted_quote_rejected_and_fresh_preview_14",{status:409,code:expired.body.code,accepted:expired.body.accepted,freshCredits:refreshed.totalCredits,newTasks:0,newSupplierPosts:0});

    await expire(p4);const beforeReplay=await counts(),replayCalls=wires.length;
    const replays=await Promise.all(Array.from({length:4},()=>post("submit",minimal(r4,p4))));for(const replay of replays){assert.equal(replay.response.status,200,JSON.stringify(replay.body));assert.equal(replay.body.jobId,result4.jobId);assert.equal(replay.body.chargedCredits,12);}
    const oldBody=await post("submit",r4);assert.equal(oldBody.response.status,200);assert.equal(oldBody.body.jobId,result4.jobId);
    const legacyApi=await import("../src/app/api/generate-image/route"),legacyReceipt=await legacyApi.GET(new Request(`${f.origin}/api/generate-image?job=${result4.jobId}`,{headers:headers()})),legacyBody=await legacyReceipt.json();
    assert.equal(legacyReceipt.status,200,JSON.stringify(legacyBody));assert.equal(legacyBody.status,"done");assert.equal(legacyBody.operationStatus,"succeeded");assert.equal(legacyBody.creditsUsed,12);assert.deepEqual(legacyBody.images.map((image:Record<string,unknown>)=>image.id),result4.artifacts.map(artifact=>artifact.artworkId));
    assert.equal((await legacyApi.GET(new Request(`${f.origin}/api/generate-image?job=${result4.jobId}`,{headers:headers(other)}))).status,404);
    assert.deepEqual(await counts(),beforeReplay);assert.equal(wires.length,replayCalls);
    record("accepted_receipt_expired_configuration_change_concurrent_and_legacy_replay",{sameJobId:result4.jobId,parallelReplays:4,legacyGenerateGet:"done",foreignLegacyGet:404,newSupplierPosts:0});

    const batchBefore=await counts(),batchPosts=wires.length,acceptedBatch=await post("submit",minimal(rBatch,pBatch));assert.equal(acceptedBatch.response.status,200,JSON.stringify(acceptedBatch.body));assert.equal(acceptedBatch.body.id,rBatch.operationId);assert.equal(acceptedBatch.body.children.length,2);
    const storedBatch=(await pool.query("SELECT plan FROM app_imagegen_batches WHERE id=$1",[rBatch.operationId])).rows[0].plan,items=(await pool.query("SELECT plan FROM app_imagegen_batch_items WHERE batch_id=$1 ORDER BY ordinal",[rBatch.operationId])).rows;
    assert.equal(storedBatch.totalCredits,24);assert.equal(storedBatch.billingVersion,pBatch.billingVersion);assert.equal(storedBatch.modelVersion,pBatch.modelVersion);assert.deepEqual(items.map(row=>row.plan.totalCredits),[12,12]);assert.ok(items.every(row=>row.plan.steps[0].billingQuote.requestedCredits===12));assert.equal(wires.length,batchPosts);
    await expire(pBatch);const batchAfter=await counts();assert.equal(batchAfter.batches-batchBefore.batches,1);assert.equal(batchAfter.batchItems-batchBefore.batchItems,2);
    const batchReplay=await post("submit",minimal(rBatch,pBatch));assert.equal(batchReplay.response.status,200,JSON.stringify(batchReplay.body));assert.deepEqual(batchReplay.body,acceptedBatch.body);assert.deepEqual(await counts(),batchAfter);assert.equal(wires.length,batchPosts);
    let batchResult:Record<string,any>={};const batchDeadline=Date.now()+90000;
    do{const response=await batchApi.GET(new Request(`${f.origin}/api/imagegen/batches/${rBatch.operationId}`,{headers:headers()}),{params:Promise.resolve({id:rBatch.operationId})});assert.equal(response.status,200);batchResult=await response.json();if(["succeeded","failed","partial","needs_attention","cancelled"].includes(batchResult.status))break;await wait(100);}while(Date.now()<batchDeadline);
    assert.equal(batchResult.status,"succeeded",JSON.stringify(batchResult));assert.equal(batchResult.totalCredits,24);assert.equal(batchResult.chargedCredits,24);assert.equal(wires.length,batchPosts+2);assert.deepEqual(batchResult.items.map((i:Record<string,any>)=>i.result.chargedCredits),[12,12]);
    for(const item of batchResult.items){const p=storedBatch.children.find((c:Record<string,any>)=>c.key===item.key).plan;const request=p.request;const parent=(await pool.query("SELECT payload FROM app_image_jobs WHERE id=$1",[item.result.jobId])).rows[0].payload.plan;assert.equal(parent.steps[0].billingQuote.requestedCredits,12);assert.equal(parent.billingVersion,pBatch.billingVersion);const {readCanvasOutput}=await import("../src/lib/canvas-image-input");const bytes=await readCanvasOutput(item.result.artifacts[0].url,"http://internal",owner),meta=await sharp(bytes.buffer).metadata();assert.equal(meta.width,4096);assert.equal(meta.height,4096);assert.equal(meta.format,"png");assert.equal(request.parameters.resolution,"4K");}
    record("batch_valid_old_quote_saved_and_expiry_does_not_rebuild",{id:rBatch.operationId,oldTotalCredits:24,childCredits:[12,12],oldBillingVersion:pBatch.billingVersion,actualPng:[4096,4096],newSupplierPosts:2});
    const expiredBatchRequest=imagegenRequestSchema.parse({...rBatch,operationId:randomUUID()}),expiredBatchPlan=await preview(expiredBatchRequest);assert.equal(expiredBatchPlan.totalCredits,28);await expire(expiredBatchPlan);const expiredBatch=await expectReject(minimal(expiredBatchRequest,expiredBatchPlan),409,"IMAGEGEN_PLAN_CHANGED");assert.equal(expiredBatch.body.accepted,false);
    record("unaccepted_expired_batch_creates_no_batch_or_child",{status:409,newBatchRows:0,newSupplierPosts:0});

    const localRequest=imagegenRequestSchema.parse({...request("1K"),mode:"postprocess",inputs:[{artworkId:ownedId,role:"edit-target"}],output:{format:"webp",compressionMode:"local",compression:80}}),localPlan=await preview(localRequest);
    assert.equal(localPlan.totalCredits,0);assert.equal(localPlan.modelVersion,0);assert.equal(localPlan.billingVersion,0);const beforeLocal=await counts(),localCalls=wires.length,local=await waitResult(localRequest,await post("submit",minimal(localRequest,localPlan,false)));
    assert.equal(local.chargedCredits,0);const {readCanvasOutput}=await import("../src/lib/canvas-image-input"),localBytes=await readCanvasOutput(local.artifacts[0].url,"http://internal",owner),localMetadata=await sharp(localBytes.buffer).metadata();assert.equal(localMetadata.format,"webp");assert.equal(localMetadata.width,64);assert.equal(localMetadata.height,64);
    const afterLocal=await counts();assert.equal(afterLocal.parents-beforeLocal.parents,1);assert.equal(afterLocal.children,beforeLocal.children);assert.equal(afterLocal.ledgers,beforeLocal.ledgers);assert.equal(afterLocal.billed,beforeLocal.billed);assert.equal(wires.length,localCalls);assert.equal(afterLocal.reservations,0);
    record("zero_credit_local_postprocess",{confirmed:false,chargedCredits:0,mime:"webp",actualPixels:[64,64],newSupplierPosts:0,newConsumptionLedgers:0});

    // Preserve the original 48-credit / four-POST acceptance exactly. Extra
    // races and scope cases below assert their own deltas, never redefine it.
    const originalCounts=await counts(),originalTotals=(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int charged FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0];
    assert.deepEqual(originalCounts,{parents:5,children:4,ledgers:4,reservations:0,billed:4,batches:1,batchItems:2});assert.deepEqual(originalTotals,{n:4,charged:48});assert.equal(wires.length,4);

    // Two genuinely unaccepted previews share one operation and raw request.
    // A real publication occurs between them; only the durable winner may bill.
    const rRace=request(),pRace14=await preview(rRace);assert.equal(pRace14.totalCredits,14);
    await publishPrice(16);const pRace16=await preview(rRace);assert.equal(pRace16.totalCredits,16);assert.notEqual(pRace14.quote!.id,pRace16.quote!.id);assert.ok(pRace16.billingVersion>pRace14.billingVersion);
    const raceBefore=await counts(),racePosts=wires.length,raceReceipts=await Promise.all([post("submit",minimal(rRace,pRace14)),post("submit",minimal(rRace,pRace16))]);
    for(const receipt of raceReceipts){assert.equal(receipt.response.status,200,JSON.stringify(receipt.body));assert.equal(receipt.body.jobId,`imagegen-${rRace.operationId}`);}
    const raceParent=(await pool.query("SELECT payload FROM app_image_jobs WHERE id=$1",[raceReceipts[0].body.jobId])).rows[0].payload.plan;
    const winningPlan=raceParent.billingVersion===pRace14.billingVersion?pRace14:pRace16;assert.equal(raceParent.billingVersion,winningPlan.billingVersion);assert.equal(raceParent.totalCredits,winningPlan.totalCredits);
    const storedWinning=(await pool.query("SELECT plan FROM app_imagegen_quotes WHERE id=$1",[winningPlan.quote!.id])).rows[0].plan;assert.deepEqual(raceParent,storedWinning,"durable winner plan is exactly one saved quote, never mixed terms");
    const raceResult=await waitResult(rRace,raceReceipts[0]),raceGenerated=await inspectGenerated(rRace,winningPlan,raceResult,100),raceAfter=await counts();
    assert.equal(raceAfter.parents-raceBefore.parents,1);assert.equal(raceAfter.children-raceBefore.children,1);assert.equal(raceAfter.ledgers-raceBefore.ledgers,1);assert.equal(raceAfter.billed-raceBefore.billed,1);assert.equal(raceAfter.reservations,0);assert.equal(wires.length-racePosts,1);assert.equal(Number(raceGenerated.billing.delta),-winningPlan.totalCredits);
    const changedRace={...rRace,prompt:"This different raw fingerprint must not reuse the accepted operation"},changedRacePlan=await preview(changedRace);
    const conflict=await expectReject({...changedRace,confirmation:{quoteId:changedRacePlan.quote!.id,confirmed:true}},400);assert.equal(conflict.body.accepted,true);assert.match(conflict.body.error,/冲突/);
    record("first_accept_two_quotes_across_publication_have_one_durable_winner",{quotes:[14,16],sameOperation:rRace.operationId,winningCredits:winningPlan.totalCredits,winningBillingVersion:winningPlan.billingVersion,chargedCredits:raceResult.chargedCredits,parentDelta:1,childDelta:1,consumeDelta:1,supplierPostDelta:1,differentRawStatus:400,fullQuoteMatchesSavedWinner:true});

    // Actual owned physical projects, not fabricated request-context IDs.
    const otherOwnedId=`scope-other-${randomUUID()}`,otherContextId=`tree:${otherOwnedId}`,scopeHeaders={"x-naumi-project-context":contextId},otherScopeHeaders={"x-naumi-project-context":otherContextId};
    await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Other scope','main','fixture','completed',$3,'from-white','canvas')",[otherOwnedId,owner,`data:image/png;base64,${tiny.toString("base64")}`]);
    await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,'personal',NULL)",[owner,otherContextId]);
    const rScope=request(),pScope=await preview(rScope,scopeHeaders);assert.equal(pScope.totalCredits,16);const scopeBefore=await counts(),scopePosts=wires.length;
    const scopeAccepted=await post("submit",minimal(rScope,pScope),owner,scopeHeaders),scopeResult=await waitResult(rScope,scopeAccepted,scopeHeaders);await inspectGenerated(rScope,pScope,scopeResult,100);
    const scopeAfter=await counts();assert.equal(scopeAfter.parents-scopeBefore.parents,1);assert.equal(scopeAfter.children-scopeBefore.children,1);assert.equal(scopeAfter.ledgers-scopeBefore.ledgers,1);assert.equal(wires.length-scopePosts,1);
    const persistedScope=(await pool.query("SELECT payload->'creationScope' scope FROM app_image_jobs WHERE id=$1",[scopeResult.jobId])).rows[0].scope;assert.equal(persistedScope.parentContext,contextId);assert.equal(persistedScope.actorEmail,owner);assert.equal(persistedScope.scopeKind,"personal");
    function scopedHeaders(email=owner,extra?:HeadersInit){const h=headers(email);if(extra)new Headers(extra).forEach((v,k)=>h.set(k,v));return h;}
    const sameScopePost=await post("submit",minimal(rScope,pScope),owner,scopeHeaders);assert.equal(sameScopePost.response.status,200);assert.equal(sameScopePost.body.jobId,scopeResult.jobId);
    const sameScopeGet=await get(rScope.operationId,owner,scopeHeaders);assert.equal(sameScopeGet.response.status,200);assert.equal(sameScopeGet.body.jobId,scopeResult.jobId);
    const sameLegacy=await legacyApi.GET(new Request(`${f.origin}/api/generate-image?job=${scopeResult.jobId}`,{headers:scopedHeaders(owner,scopeHeaders)}));assert.equal(sameLegacy.status,200);assert.equal((await sameLegacy.json()).creditsUsed,16);
    for(const extra of [undefined,otherScopeHeaders]){
      const rejectedPost=await post("submit",minimal(rScope,pScope),owner,extra);assert.ok([400,403,404,409].includes(rejectedPost.response.status),JSON.stringify(rejectedPost.body));
      assert.equal((await get(rScope.operationId,owner,extra)).response.status,404);
      assert.equal((await legacyApi.GET(new Request(`${f.origin}/api/generate-image?job=${scopeResult.jobId}`,{headers:scopedHeaders(owner,extra)}))).status,404);
    }
    assert.ok([400,403,404,409].includes((await post("submit",minimal(rScope,pScope),other,scopeHeaders)).response.status));assert.equal((await get(rScope.operationId,other,scopeHeaders)).response.status,404);assert.equal((await legacyApi.GET(new Request(`${f.origin}/api/generate-image?job=${scopeResult.jobId}`,{headers:scopedHeaders(other,scopeHeaders)}))).status,404);
    assert.deepEqual(await counts(),scopeAfter);assert.equal(wires.length,scopePosts+1,"scope receipt checks do not generate again");

    // A scoped batch stays genuinely running/queued during invalid GET/cancel.
    const rScopedBatch=imagegenRequestSchema.parse({...rBatch,operationId:randomUUID(),batch:{...rBatch.batch!,items:[rBatch.batch!.items[0]]}}),pScopedBatch=await preview(rScopedBatch,scopeHeaders),scopedBatchBefore=await counts();
    const scopedBatchAccepted=await post("submit",minimal(rScopedBatch,pScopedBatch),owner,scopeHeaders);assert.equal(scopedBatchAccepted.response.status,200,JSON.stringify(scopedBatchAccepted.body));
    const scopedBatchAfter=await counts();assert.equal(scopedBatchAfter.batches-scopedBatchBefore.batches,1);assert.equal(scopedBatchAfter.batchItems-scopedBatchBefore.batchItems,1);assert.equal(scopedBatchAfter.parents,scopedBatchBefore.parents);assert.equal(wires.length,scopePosts+1);
    const scopedBatchSnapshot=(await pool.query("SELECT state,request,plan FROM app_imagegen_batches WHERE id=$1",[rScopedBatch.operationId])).rows[0],scopedItemSnapshot=(await pool.query("SELECT state,child_operation_id,request,plan FROM app_imagegen_batch_items WHERE batch_id=$1",[rScopedBatch.operationId])).rows;
    assert.equal(scopedBatchSnapshot.state,"running");assert.equal(scopedItemSnapshot[0].state,"queued");
    for(const extra of [undefined,otherScopeHeaders]){
      const wrongGet=await batchApi.GET(new Request(`${f.origin}/api/imagegen/batches/${rScopedBatch.operationId}`,{headers:scopedHeaders(owner,extra)}),{params:Promise.resolve({id:rScopedBatch.operationId})});assert.equal(wrongGet.status,404);
      const wrongCancel=await batchApi.POST(new Request(`${f.origin}/api/imagegen/batches/${rScopedBatch.operationId}`,{method:"POST",headers:scopedHeaders(owner,extra),body:JSON.stringify({action:"cancel"})}),{params:Promise.resolve({id:rScopedBatch.operationId})});assert.equal(wrongCancel.status,404);
    }
    const foreignBatch=await batchApi.POST(new Request(`${f.origin}/api/imagegen/batches/${rScopedBatch.operationId}`,{method:"POST",headers:scopedHeaders(other,scopeHeaders),body:JSON.stringify({action:"cancel"})}),{params:Promise.resolve({id:rScopedBatch.operationId})});assert.equal(foreignBatch.status,404);
    const sameBatchReplay=await post("submit",minimal(rScopedBatch,pScopedBatch),owner,scopeHeaders);assert.equal(sameBatchReplay.response.status,200);assert.deepEqual(sameBatchReplay.body,scopedBatchAccepted.body);
    assert.deepEqual((await pool.query("SELECT state,request,plan FROM app_imagegen_batches WHERE id=$1",[rScopedBatch.operationId])).rows[0],scopedBatchSnapshot);assert.deepEqual((await pool.query("SELECT state,child_operation_id,request,plan FROM app_imagegen_batch_items WHERE batch_id=$1",[rScopedBatch.operationId])).rows,scopedItemSnapshot);assert.deepEqual(await counts(),scopedBatchAfter);assert.equal(wires.length,scopePosts+1);
    record("physical_project_scoped_get_post_legacy_and_batch_cancel",{project:contextId,otherPhysicalProject:otherContextId,sameScope:"PASS",missingScope:"REJECTED",otherScope:"REJECTED",foreignOwner:"REJECTED",scopeNewSupplierPosts:1,scopeCredits:16,batchStill:"running",batchItemStill:"queued",invalidScopePostDelta:0,invalidScopeFinancialDelta:0});

    const {saveFeaturePolicy,userFeaturePolicy}=await import("../src/lib/feature-access/server"),policy=await userFeaturePolicy(owner);
    await saveFeaturePolicy("fixture",{id:randomUUID(),email:owner,mode:"custom",allowed:["works"],expectedVersion:policy.version});
    const denied=await expectReject(minimal(rDenied,pDenied),400);assert.equal(denied.body.accepted,false);assert.match(denied.body.error,/未授权/);
    const storedDenied=(await pool.query("SELECT plan FROM app_imagegen_quotes WHERE id=$1",[pDenied.quote!.id])).rows[0].plan;assert.equal(storedDenied.totalCredits,12);
    const beforeRestore=await counts(),restorePosts=wires.length,restored=await post("submit",minimal(r4,p4));assert.equal(restored.response.status,200,JSON.stringify(restored.body));assert.equal(restored.body.jobId,result4.jobId);assert.equal(restored.body.chargedCredits,12);assert.equal((await get(r4.operationId)).body.jobId,result4.jobId);assert.deepEqual(await counts(),beforeRestore);assert.equal(wires.length,restorePosts);
    record("feature_revoked_new_accept_denied_without_reprice_existing_receipt_restored",{retainedFeature:"works",deniedStatus:denied.response.status,accepted:false,savedQuoteCredits:12,restoredJobId:restored.body.jobId,newSupplierPosts:0});
    // Receipt recovery also survives quote garbage collection; no expiry row is needed.
    await pool.query("DELETE FROM app_imagegen_quotes WHERE id=$1",[p4.quote!.id]);const deletedReplay=await post("submit",minimal(r4,p4));assert.equal(deletedReplay.response.status,200,JSON.stringify(deletedReplay.body));assert.equal(deletedReplay.body.jobId,result4.jobId);assert.deepEqual(await counts(),beforeRestore);assert.equal(wires.length,restorePosts);
    record("accepted_receipt_after_quote_deleted",{sameJobId:result4.jobId,newSupplierPosts:0});
    const final=await counts(),totals=(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int charged FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0];
    assert.deepEqual(final,{parents:7,children:6,ledgers:6,reservations:0,billed:6,batches:2,batchItems:3});assert.deepEqual(totals,{n:6,charged:48+winningPlan.totalCredits+16});assert.equal(wires.length,6);assert.deepEqual(blockedUrls,[]);
    console.log("MODIFIED=PASS HTTP_HANDLERS=ORIGINAL NATIVE_SESSION=PASS PREVIEW_4K=12 PUBLICATION_4K=14 FROZEN_CHARGE=12 BILLING_MODEL_PUBLICATION=PASS PAID_FEN_FROZEN=PASS METERING_FROZEN=PASS NATIVE_INPUT=PASS ACTUAL_PNG=4096x4096 EXPIRY_409_ACCEPTED_FALSE=PASS RECEIPT_CONCURRENCY_NO_REPOST=PASS BATCH_OLD_PRICE=24 ZERO_POSTPROCESS=PASS REVOKED_NEW_DENIED_OLD_RESTORED=PASS QUOTE_DELETED_RECEIPT=PASS ORIGINAL_12_GROUPS_CHARGED_CREDITS=48 ORIGINAL_SUPPLIER_POSTS=4 FIRST_ACCEPT_RACE=PASS REAL_PROJECT_SCOPE=PASS SCOPED_BATCH_CANCEL=PASS RESERVATIONS=0 LOOPBACK_SUPPLIER_POSTS=6 EXTERNAL_CALLS=0");
    console.log(JSON.stringify({cases:cases.length,original:{counts:originalCounts,totals:originalTotals,supplierPosts:4},additional:{raceWinningCredits:winningPlan.totalCredits,scopedGenerationCredits:16,chargedCredits:winningPlan.totalCredits+16,supplierPosts:2,queuedScopedBatches:1},counts:final,totals,supplierPosts:wires.length,blockedUrls}));
    console.log("BOUNDARY=local isolated PostgreSQL + original Request/Response handlers + loopback sharp PNG fixture; not production, external supplier, browser, middleware or nginx acceptance");
  }finally{
    if(db){const {closeImageCoordinationPool}=await import("../src/lib/imagegen/coordination-pool");await closeImageCoordinationPool();await db.getPool().end();}
    await f.cleanup();globalThis.fetch=originalFetch;
    assert.equal(dirname(resolve(mediaDir)),resolve(tmpdir()));await rm(mediaDir,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
