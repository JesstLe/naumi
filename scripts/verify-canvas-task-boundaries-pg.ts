/** Real task/attachment + PG billing/receipts + native artwork handlers.
 * Supplier generation and A+ job execution are fixture ports, never production. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import vm from "node:vm";
import {build} from "esbuild";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  const f=await createModelFixture();let db:typeof import("../src/lib/db")|undefined,checks=0,supplier=0;
  const eq=(a:unknown,b:unknown)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;};
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"task-fixture",MODEL_CONFIG_ENVELOPE_SECRET:"task-fixture"});
  try{
    db=await import("../src/lib/db");await db.ensureSchema();await f.repo.current();
    const owner="task-boundary@fixture.test",other="task-other@fixture.test",poor="task-poor@fixture.test";
    for(const email of [owner,other,poor])await db.getOrCreateUser(email);
    const {withBillingTransaction,createBillingService}=await import("../src/lib/billing/service"),service=createBillingService();
    for(const email of [owner,poor])await withBillingTransaction(db.getPool(),async tx=>{
      await tx.query("DELETE FROM app_ledger WHERE email=$1",[email]);await tx.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await tx.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[email]);
      if(email===owner)await service.grantTx(tx,{id:randomUUID(),email,amount:30,source:"admin",reason:"task fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"});
    });
    const {getBillingRuntime}=await import("../src/lib/billing/server"),runtime=await getBillingRuntime(),original=await runtime.config.current(),config=structuredClone(original.config);
    config.features["canvas.expand"].pricing={mode:"fixed",credits:3};config.features["canvas.expand"].rules=[];
    const snapshot={...original,config},pricing=await import("../src/lib/billing/quote"),quoted=pricing.quote(snapshot,{feature:"canvas.expand",quantity:1,quality:"medium",resolution:"1K",byok:false,metered:true,paidFen:0,userGroup:"default"});
    const sync=await import("../src/lib/billing/synchronous-operation"),intent=await import("../src/lib/billing/intent"),get=await import("../src/app/api/artworks/get/route"),position=await import("../src/app/api/artworks/position/route"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
    const cookie=`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,art=(id:string)=>({id,title:id,category:"main" as const,prompt:"fixture",status:"completed" as const,image:"/media/fixture.png",gradient:"",width:320,height:640,createdAt:new Date().toISOString()});
    let loseResponse=true,failPosition=false,failPoll=false,quoteCalls=0,jobCreates=0,paidPosts=0,history=0;
    const operations:string[]=[],prices:number[]=[],bodies:string[]=[],jobs=new Map<string,string>();
    const runOperation=async(operationId:string,actor:string,hash:string,action:()=>Promise<import("../src/lib/billing/synchronous-operation").SynchronousResult>)=>sync.withSynchronousOperation({operationId,email:actor,feature:"canvas.expand",path:"/api/canvas/expand",identity:async()=>({hash}),snapshot:async()=>snapshot,quote:async()=>quoted},action);
    const quote=async()=>{quoteCalls++;return {credits:3,reserveCredits:3,feature:"canvas.expand" as const,quantity:1,version:snapshot.version};};
    const submit=async(url:string,init:RequestInit,q:import("../src/lib/billing/client").PublicQuote|null,onIdentity?:(id:string)=>void)=>{
      assert.ok(q);
      const headers=new Headers(init.headers);const id=headers.get("x-naumi-billing-operation-id")||randomUUID();onIdentity?.(id);headers.set("x-naumi-billing-operation-id",id);headers.set("cookie",cookie);headers.set("origin","http://localhost");
      paidPosts++;operations.push(id);prices.push(q.credits);bodies.push(typeof init.body==="string"?init.body:String((init.body as FormData).get("text")));
      let response:Response;
      if(url==="/api/aplus")response=await intent.withBillingIntent(new Request("http://localhost/api/aplus",{...init,headers}),async()=>{
        jobCreates++;const artworkId=`detail-${jobCreates}`;await db!.addArtworks(owner,[art(artworkId)]);jobs.set(`aplus-${id}`,artworkId);return Response.json({jobId:`aplus-${id}`});
      });
      else{
        const result=await runOperation(id,owner,createHash("sha256").update(String(init.body)).digest("hex"),async()=>{
          await sync.configuredToolCost();supplier++;sync.markBillingUpstream("succeeded");const resultId=`edit-${supplier}`;await db!.addArtworks(owner,[art(resultId)]);return {status:200,body:{id:resultId}};
        });response=Response.json(result.body,{status:result.status});
      }
      if(loseResponse){loseResponse=false;throw Error("fixture lost settled HTTP response");}return response;
    };
    const fetchPort=async(url:string,init:RequestInit={})=>{
      const req=new Request("http://localhost"+url,init);
      if(url.startsWith("/api/artworks/get"))return get.GET(req);
      if(url==="/api/artworks/position"){if(failPosition){failPosition=false;return Response.json({error:"fixture position failed"},{status:503});}return position.POST(req);}
      if(failPoll){failPoll=false;return Response.json({error:"fixture poll failed"},{status:503});}
      const id=jobs.get(new URL(req.url).searchParams.get("job")!);return Response.json({status:"done",shots:[{id,url:"/media/fixture.png",status:"done"}],done:1});
    };
    const bundle=await build({stdin:{contents:['billing/client-submission','canvas/edit-task','canvas/detail-task-controller','canvas/result-attachment','canvas/image-task-scope'].map(name=>`export * from './src/lib/${name}';`).join('\n'),resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"auth",setup(b){b.onResolve({filter:/supabase$/},()=>({path:"auth",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'export const authHeader=()=>({cookie:__cookie});',loader:"js"}));}}]});
    const projected={exports:{}} as {exports:typeof import("../src/lib/billing/client-submission")&typeof import("../src/lib/canvas/edit-task")&typeof import("../src/lib/canvas/detail-task-controller")&typeof import("../src/lib/canvas/result-attachment")&typeof import("../src/lib/canvas/image-task-scope")};
    const context=vm.createContext({process:{env:{}},module:projected,exports:projected.exports,__cookie:cookie,fetch:fetchPort,console,Map,Set,Headers,Request,Response,Blob,File,FormData,URL,structuredClone,Date,setTimeout:(fn:()=>void)=>setTimeout(fn,0),clearTimeout});vm.runInContext(bundle.outputFiles[0].text,context);
    const api=projected.exports,scope=api.captureCanvasImageTaskScope(owner,"tree:fixture",()=>true);
    const attach=(kind:"single"|"detail")=>api.createCanvasResultAttachment({layout:kind==="single"?{kind}:{kind,gap:24,height:()=>300},position:()=>({x:777,y:888}),saveErrorText:"save failed",history:()=>{history++;},merge:async ids=>(await db!.listArtworksByIds(owner,ids)) as import("../src/lib/mock-data").Artwork[]});
    const retained=api.createRetainedBillingSubmission(),task=api.createCanvasEditTask({request:{kind:"expand",artworkId:"source",ratio:"3:4",anchor:"center"},submit:(p,s)=>retained.ready?retained.retry({quote,submit},s.assertCurrent):retained.submit({quote,submit},p.url,p.init,{feature:"canvas.expand",quantity:1},s.assertCurrent),attach:attach("single"),user(){},saving(){},errorText:"edit failed"});
    eq((await task.run(scope)).status,"failed");config.features["canvas.expand"].pricing={mode:"fixed",credits:99};
    eq((await task.run(scope)).status,"succeeded");eq(supplier,1);eq(quoteCalls,1);eq(prices,[3,3]);eq(operations[0],operations[1]);eq(bodies[0],bodies[1]);eq(history,1);
    eq((await db.listArtworksByIds(owner,["edit-1"]))[0].canvasX,777);
    const ledger=await db.getPool().query("SELECT delta FROM app_ledger WHERE email=$1 AND kind='consume'",[owner]);eq(ledger.rows.map(r=>Number(r.delta)),[-3]);
    eq((await runOperation(operations[0],other,createHash("sha256").update(bodies[0]).digest("hex"),async()=>{throw Error("must not run");})).status,409);
    eq((await runOperation(randomUUID(),poor,"poor",async()=>{await sync.configuredToolCost();supplier++;return {status:200,body:{id:"never"}};})).status,402);eq(supplier,1);
    const before=paidPosts;failPoll=true;const detailSubmission=api.createRetainedBillingSubmission(),detail=api.createCanvasDetailTask({prepare:async()=>{const form=new FormData();form.set("text","original brief");return form;},submit:(form,s)=>detailSubmission.submit({quote,submit},"/api/aplus",{method:"POST",body:form},{feature:"image.aplus",quantity:1},s.assertCurrent),attach:attach("detail"),progress(){},user(){},errorText:"detail failed",expectedCount:1});
    eq((await detail.run(scope)).status,"failed");failPosition=true;eq((await detail.run(scope)).status,"failed");eq((await detail.run(scope)).status,"succeeded");eq(jobCreates,1);eq(paidPosts-before,1);eq(history,2);
    const denied=await position.POST(new Request("http://localhost/api/artworks/position",{method:"POST",headers:{cookie:`${USER_COOKIE}=${signUserSession(other,Date.now())}`,"content-type":"application/json"},body:JSON.stringify({id:"edit-1",x:0,y:0})}));eq(denied.status,404);
    eq((await db.getPool().query("SELECT count(*) FROM app_gen_reservations WHERE email=$1",[owner])).rows[0].count,"0");
    console.log(`CANVAS_TASK_BOUNDARIES_PG=PASS checks=${checks} BILLING=ACTUAL RECEIPT=ACTUAL ARTWORK_HANDLERS=ACTUAL REAL_PG=1 LOST_RESPONSE_SUPPLIER_REPLAY=0 ORIGINAL_PRICE=3 CONSUME=1 JOB_REPOST=0 EXTERNAL=0`);
  }finally{if(db)await db.getPool().end();await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await f.cleanup();console.log("TASK_PG_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
