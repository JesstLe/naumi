/** Pricing echoes are not an admission gate. Real isolated PG + video entry;
 * no external supplier. Run with --conditions react-server, [baseline|modified]. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig,facts} from "./billing-unit-fixture";
import {quote} from "../src/lib/billing/quote";
import type {CreateVideoInput} from "../src/lib/video/service";
import type {ModelExecutionScope} from "../src/lib/model-config/context";

async function main(){
 const mode=process.argv[2]||"modified",baseline=mode==="baseline"||mode==="rollback";
 assert(["baseline","modified","rollback"].includes(mode));
 const database=new URL(process.env.DATABASE_URL||"http://invalid");
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(database.hostname,"127.0.0.1");assert.match(database.pathname,/^\/naumi_pricing_fixture$/);
 for(const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","FLEET_PORTAL_ONLY","NAUMI_AUTH_LOGIN_ONLY"])delete process.env[key];
 let http=0,hooks=0;const f=await createModelFixture((_request,response)=>{http++;response.writeHead(500);response.end("No supplier permitted");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-pricing-friction-envelope-only",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-pricing-friction-router-only"});
 const definition={modes:["text" as const],durationResolutionMap:[{durations:[4],resolutions:["720p"]}],aspectRatios:["16:9"],limits:{images:0,videos:0,audios:0},audio:"disabled" as const};
 f.config.providers.push({...structuredClone(f.config.providers[0]),id:"video-fixture",protocol:"openai-videos",options:{},baseUrl:f.origin});
 f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"video-upstream",providerId:"video-fixture",model:"video-wire",modality:"video",capabilities:{...f.config.upstreamModels[0].capabilities,edit:false,maxReferenceImages:0,video:definition},parameterMap:{}});
 f.config.publicModels.push({id:"video-public",label:"video fixture",modality:"video",enabled:true,visible:true,target:{type:"upstream",id:"video-upstream"},toolScope:{features:["video.generate"],defaultFor:["video.generate"]}});
 f.config.bindings["video.generate"]="video-public";
 let pool:ReturnType<(typeof import("../src/lib/db"))["getPool"]>|undefined;
 const records:Record<string,unknown>[]=[];
 try{
  const credential=await f.credentials.importPlain({providerId:"video-fixture",plain:"fixture-pricing-video-only",actor:"fixture"});
  f.config.providers.find(p=>p.id==="video-fixture")!.credentialRef=credential.id;
  const model=await f.repo.current();
  const db=await import("../src/lib/db");pool=db.getPool();assert.equal((await pool.query("SELECT current_schema() AS s")).rows[0].s,f.schemaName);await db.ensureSchema();
  const {getBillingRuntime}=await import("../src/lib/billing/server"),runtime=await getBillingRuntime(),initial=await runtime.config.current();
  const config=structuredClone(initial.config);config.switches.metering="on";config.features["video.generate"].enabled=true;config.features["video.generate"].unit="task";config.features["video.generate"].pricing={mode:"fixed",credits:12};config.features["video.generate"].rules=[];config.features["video.generate"].settlement={...config.features["video.generate"].settlement,reserveBps:10000,qualityBasis:"requested",successBasis:"successful-units",failureBps:0};
  const billing=await runtime.config.publish({id:randomUUID(),expectedVersion:initial.version,config,actor:"fixture",reason:"pricing friction regression"});
  const {assertQuotedVersion}=await import("../src/lib/billing/request"),{confirmMediaQuote}=await import("../src/lib/video/media-billing");
  const code=async(action:()=>unknown)=>{try{await action();return "ACCEPTED";}catch(e){return (e as {code?:string}).code||String(e);}};
  for(const feature of ["video.generate","canvas.assistant"] as const){
   const q=quote({version:9,config:fixtureConfig()},facts({feature}));q.requestedCredits=12;q.authorizedCredits=12;
   for(const input of [{},{version:1,credits:0},{version:999999,credits:999999}]){
    const actual=await code(()=>assertQuotedVersion(input,q));assert.equal(actual,baseline?"PRICE_CHANGED":"ACCEPTED");assert.equal(q.requestedCredits,12);records.push({kind:"echo",feature,input,actual});
   }
  }
  const media=quote({version:9,config:fixtureConfig()},facts());media.authorizedCredits=12;
  for(const confirmation of [undefined,{version:1,credits:0}]){const actual=await code(()=>confirmMediaQuote(media,confirmation));assert.equal(actual,baseline?"PRICE_CHANGED":"ACCEPTED");records.push({kind:"media",actual});}
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service"),service=createBillingService();
  async function user(amount:number){const email=`pricing-${randomUUID()}@fixture.test`;await db.getOrCreateUser(email,"pricing fixture");await pool!.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await pool!.query("DELETE FROM app_ledger WHERE email=$1",[email]);await pool!.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[email]);if(amount)await withBillingTransaction(pool!,tx=>service.grantTx(tx,{id:randomUUID(),email,amount,source:"admin",reason:"fixture funding",expiry:{unit:"days",value:1},ledgerId:`fund-${randomUUID()}`,fingerprint:email,actor:"fixture"}));return email;}
  const rich=await user(12),poor=await user(11);
  const {createValidatedVideo}=await import("../src/lib/video/submission"),{runModelExecution}=await import("../src/lib/model-config/context");
  const scope:ModelExecutionScope={frozen:{feature:"video.generate",modelVersion:model.version,billingVersion:billing.version,modelDigest:model.digest,publicModelId:"video-public",binding:"video.generate",modality:"video",target:{type:"upstream",id:"video-upstream"},video:{definition,sources:{modes:"admin",durationResolutionMap:"admin",aspectRatios:"admin",limits:"admin",audio:"admin"}}},connection:{providerId:"video-fixture",protocol:"openai-videos",baseUrl:f.origin,apiKey:"fixture-no-network",wireModel:"video-wire",timeoutMs:10000},capabilities:f.config.upstreamModels.find(u=>u.id==="video-upstream")!.capabilities,parameterMap:{}};
  const input:CreateVideoInput={source:"canvas",prompt:"A ceramic cube rotates.",mode:"text",seconds:"4",durationSeconds:4,size:"720p",resolution:"720p",aspectRatio:"16:9",references:[],modelId:"video-public",idempotencyKey:randomUUID(),billingConfirmation:{version:1,credits:0}};
  const onSubmit={submit:async()=>{hooks++;},creationError:async()=>{throw Error("Unexpected creation error");}};
  let created:{taskId:string;cost:number}|undefined;
  const richResult=await code(async()=>{created=await runModelExecution(scope,()=>createValidatedVideo(rich,input,onSubmit));});assert.equal(richResult,baseline?"PRICE_CHANGED":"ACCEPTED");
  const poorResult=await code(()=>runModelExecution(scope,()=>createValidatedVideo(poor,{...input,idempotencyKey:randomUUID()},onSubmit)));assert.equal(poorResult,baseline?"PRICE_CHANGED":"INSUFFICIENT_CREDITS");
  if(created){
   const replay=await runModelExecution(scope,()=>createValidatedVideo(rich,{...input,billingConfirmation:{version:999999,credits:0}},onSubmit));
   assert.equal(replay.taskId,created.taskId);assert.equal(hooks,1,"same intent only invokes the first submission hook");
   assert.equal(await code(()=>runModelExecution(scope,()=>createValidatedVideo(rich,{...input,prompt:"Different content"},onSubmit))),"OPERATION_CONFLICT");
   assert.equal(created.cost,12);const task=(await pool.query("SELECT billing_quote FROM app_video_tasks WHERE id=$1",[created.taskId])).rows[0];assert.equal(task.billing_quote.requestedCredits,12);assert.equal(task.billing_quote.configVersion,billing.version);
   const op={id:created.taskId,email:rich,quote:task.billing_quote,reason:"fixture completion",ledgerId:`led-video-${created.taskId}`,fingerprint:created.taskId};
   const result={state:"succeeded" as const,items:[{id:"result",state:"succeeded" as const,executedQuality:"medium"}]};
   await withBillingTransaction(pool,tx=>service.settleTx(tx,op,result));await withBillingTransaction(pool,tx=>service.settleTx(tx,op,result));
   assert.equal(Number((await pool.query("SELECT count(*) AS n FROM app_ledger WHERE email=$1 AND kind='consume'",[rich])).rows[0].n),1);
   assert.equal(Number((await pool.query("SELECT charged_credits FROM app_billing_operations WHERE id=$1",[created.taskId])).rows[0].charged_credits),12);
   await assert.rejects(()=>withBillingTransaction(pool!,tx=>service.reserveTx(tx,{...op,email:poor})),(e:unknown)=>(e as {code?:string}).code==="OPERATION_CONFLICT");
  }
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM app_video_tasks WHERE email=$1",[poor])).rows[0].n),0);assert.equal(Number((await pool.query("SELECT count(*) AS n FROM app_ledger WHERE email=$1 AND kind='consume'",[poor])).rows[0].n),0);assert.equal(http,0);assert.equal(hooks,baseline?0:1);
  const literal=`PRICING_FRICTION_CORE=PASS mode=${mode} echoes=6 media=2 rich=${richResult} poor=${poorResult} server_price=12 consume_rows=${baseline?0:1} hook_calls=${hooks} http=0 supplier_POST=0`;
  console.log(literal);const out=path.resolve(process.env.NAUMI_FRICTION_OUT||"output/pricing-friction-removal-20261023/core");await mkdir(out,{recursive:true});await writeFile(path.join(out,`${mode}.json`),JSON.stringify({mode,literal,records,richResult,poorResult,http,hooks,realPg:true,realVideoEntry:true,executionScope:"synthetic",supplierCalls:0},null,2)+"\n");
 }finally{if(pool)await pool.end();await f.cleanup();console.log("CLEANUP=PASS own_schema_dropped=true pools_closed=true");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
