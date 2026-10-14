import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { fixtureConfig, facts } from "./billing-unit-fixture";
import { quote, settlementFor } from "../src/lib/billing/quote";

async function main() {
  const test = process.argv[2];
  if(!test){
    if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||new URL(process.env.DATABASE_URL||"http://invalid").hostname!=="127.0.0.1")throw new Error("Requires isolated local PostgreSQL");
    for(const name of ["missing","quality","retry","balance-refresh","recovery","canvas","demo"]){const r=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","--conditions","react-server","scripts/verify-billing-review.ts",name],{stdio:"inherit",env:{...process.env,...(name==="demo"?{DATABASE_URL:""}:{})}});if(r.status!==0)throw new Error(`Review regression ${name} failed`);}return;
  }
  if (test === "missing") {
    const { assertQuotedVersion } = await import("../src/lib/billing/request");
    const config = fixtureConfig();
    config.features["image.generate"].pricing = {mode:"fixed",credits:8};
    assert.throws(() => assertQuotedVersion({}, quote({version:2,config},facts())), (e:any)=>e.code==="PRICE_CHANGED");
  } else if (test === "quality") {
    for (const unit of ["image", "task"] as const) {
      const config=fixtureConfig(), tariff=config.features["image.generate"];
      tariff.unit=unit;tariff.settlement.qualityBasis="executed";tariff.settlement.successBasis="whole-request";
      const q=quote({version:2,config},facts({quality:"high",quantity:2}));
      assert.equal(settlementFor(q,{state:"succeeded",items:[{id:"a",state:"succeeded",executedQuality:"medium"},{id:"b",state:"failed"}]}).charge,unit==="task"?6:12);
      assert.equal(settlementFor(q,{state:"succeeded",items:[{id:"a",state:"succeeded",executedQuality:"low"},{id:"b",state:"succeeded",executedQuality:"medium"}]}).charge,unit==="task"?6:12);
      assert.throws(()=>settlementFor(q,{state:"succeeded",items:[{id:"a",state:"succeeded"}]}));
    }
  } else if (test === "retry") {
    const {clientIntentKey}=await import("../src/lib/billing/client-intent");
    const req=(id:string)=>({headers:{"content-type":"application/json"},body:JSON.stringify({prompt:"same",idempotencyKey:id,operationId:id})});
    assert.equal(await clientIntentKey("fixture","/api/video/generate",req("first")),await clientIntentKey("fixture","/api/video/generate",req("retry")));
  } else if (test === "demo") {
    assert.equal(process.env.DATABASE_URL, "", "This case must run in a fresh no-database process");
    const catalog=await (await import("../src/app/api/billing/catalog/route")).GET(new Request("http://localhost/api/billing/catalog"));
    assert.equal(catalog.status,200,await catalog.clone().text());
    const data=await catalog.json();assert.equal(data.mode,"demo");assert.equal(data.effective.metering,false);
    const response=await (await import("../src/app/api/billing/quote/route")).POST(new Request("http://localhost/api/billing/quote",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({feature:"image.generate",quantity:2})}));
    assert.equal(response.status,200);assert.equal((await response.json()).credits,0);
    let calls=0;await (await import("../src/lib/billing/synchronous")).withBillingRequest(new Request("http://localhost/api/cutout"),"tool.cutout",async()=>{calls++;return Response.json({demo:true});});assert.equal(calls,1);
  } else {
    Object.assign(process.env,{NAUMI_MULTI_USER:"1",SETTINGS_SECRET:"fixture-settings-0123456789abcdef0123456789abcdef0123456789",OPENAI_API_KEY:"fixture"});
    const f=await (await import("./billing-fixture")).createBillingFixture(),db=await import("../src/lib/db");
    try {
      if(test==="balance-refresh") {
        const email=await f.user(100),holder=await f.pool.connect();let committed=false;
        try{
          await holder.query("BEGIN");await holder.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE",[email]);
          const reading=db.getUser(email).then(user=>({user}),error=>({error}));
          let waiting=false;const until=Date.now()+10000;
          while(Date.now()<until){
            waiting=!!(await f.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%app_users%' AND pid<>pg_backend_pid()")).rowCount;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert.equal(waiting,true,"Account refresh must actually wait for the concurrent wallet transaction");
          await holder.query("UPDATE app_credit_batches SET remaining=remaining-1 WHERE email=$1 AND remaining>0",[email]);
          await holder.query("UPDATE app_users SET credits_total=99 WHERE email=$1",[email]);
          await holder.query("COMMIT");committed=true;
          const result=await reading;assert.ok('user' in result);assert.equal(result.user?.creditsTotal,99,"Refresh must read principal after acquiring the owner lock");
          const wallet=(await f.pool.query("SELECT credits_total,(SELECT sum(remaining) FROM app_credit_batches WHERE email=$1 AND expires_at>now()) AS principal FROM app_users WHERE email=$1",[email])).rows[0];
          assert.equal(Number(wallet.credits_total),99);assert.equal(Number(wallet.principal),99);
        }finally{if(!committed)await holder.query("ROLLBACK");holder.release();}
      } else if(test==="recovery") {
        const mixedEmail=await f.user(100),mixedId=randomUUID(),mixedOp={id:mixedId,email:mixedEmail,quote:quote({version:1,config:fixtureConfig()},facts({feature:"tool.cutout"})),reason:"Mixed wallet",ledgerId:`mixed-${mixedId}`,fingerprint:mixedId};
        assert.equal(await db.reserveCredits(mixedEmail,10),true);await (await import("../src/lib/billing/service")).withBillingTransaction(f.pool,tx=>f.service.reserveTx(tx,mixedOp));
        await Promise.all([db.addLedgerEntry(mixedEmail,-10,"Legacy mixed settlement"),(await import("../src/lib/billing/service")).withBillingTransaction(f.pool,tx=>f.service.settleTx(tx,mixedOp,{state:"succeeded",items:[{id:"mixed",state:"succeeded",executedQuality:"medium"}]}))]);
        const wallet=(await f.pool.query("SELECT credits_total,credits_used FROM app_users WHERE email=$1",[mixedEmail])).rows[0];assert.equal(Number(wallet.credits_total),89);assert.equal(Number(wallet.credits_used),0);assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_ledger WHERE email=$1 AND kind='consume'",[mixedEmail])).rows[0].n),2);
        const email=await f.user(20),id=randomUUID(),{signUserSession}=await import("../src/lib/native-auth"),sync=await import("../src/lib/billing/synchronous");let calls=0;
        const request=()=>new Request("http://localhost/api/cutout",{method:"POST",headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,"x-naumi-billing-operation-id":id,"content-type":"application/json"},body:JSON.stringify({sourceUrl:"fixture"})});
        const run=()=>sync.withBillingRequest(request(),"tool.cutout",async()=>{await sync.configuredToolCost();calls++;sync.markBillingUpstream("succeeded");await f.pool.query("UPDATE app_credit_batches SET expires_at=now()-interval '1 second' WHERE email=$1",[email]);return Response.json({image:"/media/retained.png"});});
        const response=await run();assert.equal(response.status,409,await response.clone().text());assert.equal((await response.json()).code,"OPERATION_PENDING");
        const row=(await f.pool.query("SELECT * FROM app_billing_operations WHERE id=$1",[`tool-${id}`])).rows[0];assert.equal(row.state,"manual");assert.equal(row.result_response.image,"/media/retained.png");assert.equal((await run()).status,409);assert.equal(calls,1);
        await db.addCreditBatch(email,20,{source:"admin",reason:"Recovery funding"});
        await (await import("../src/lib/billing/service")).withBillingTransaction(f.pool,tx=>f.service.reconcileTx(tx,{id:randomUUID(),operationId:`tool-${id}`,actor:"fixture-admin",reason:"Known output funding",proof:"Saved fixture output",result:{state:"succeeded",items:[{id:`tool-${id}`,state:"succeeded",executedQuality:"medium"}]}}));
        assert.equal((await run()).status,200);assert.equal(calls,1);
        const lateId=randomUUID(),lateRequest=()=>new Request("http://localhost/api/cutout",{method:"POST",headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,"x-naumi-billing-operation-id":lateId,"content-type":"application/json"},body:JSON.stringify({sourceUrl:"late-fixture"})});
        const late=()=>sync.withBillingRequest(lateRequest(),"tool.cutout",async()=>{await sync.configuredToolCost();throw new (await import("../src/lib/billing/types")).BillingError("INSUFFICIENT_CREDITS","Injected accepted failure",402);});
        assert.equal((await late()).status,409);assert.equal((await f.pool.query("SELECT state FROM app_billing_operations WHERE id=$1",[`tool-${lateId}`])).rows[0].state,"manual");assert.equal((await late()).status,409);
        const abandoned=`tool-${randomUUID()}`,q=quote({version:1,config:fixtureConfig()},facts({feature:"tool.cutout"}));
        await (await import("../src/lib/billing/service")).withBillingTransaction(f.pool,tx=>f.service.reserveTx(tx,{id:abandoned,email,quote:q,reason:"Crash fixture",ledgerId:`led-${abandoned}`,fingerprint:"fixture"}));
        await f.pool.query("UPDATE app_billing_operations SET updated_at='2000-01-01' WHERE id=$1",[abandoned]);
        const {signSession}=await import("../src/lib/admin-auth"),api=await import("../src/app/api/admin/billing/operations/route");
        const rows=await (await api.GET(new Request("http://localhost/api/admin/billing/operations",{headers:{cookie:`nv_admin=${signSession(Date.now())}`}}))).json();assert.ok(rows.some((r:any)=>r.id===abandoned&&r.state==="manual"));
      } else if(test==="canvas") {
        const email=await f.user(20),id=`review-canvas-${randomUUID()}`,source=`source-${id}`,png=await sharp({create:{width:32,height:32,channels:3,background:"white"}}).png().toBuffer(),url=`data:image/png;base64,${png.toString("base64")}`;
        await db.addArtworks(email,[{id:source,title:"fixture",category:"main",prompt:"",status:"completed",image:url,gradient:"",width:32,height:32}]);
        await db.createCanvasImageTaskWithReservation({id,email,sourceArtworkId:source,parameters:{artworkId:source,kind:"text-edit",oldText:"old",newText:"new",box:{x:0,y:0,width:10,height:10},paidOperationVersion:1,upstreamStarted:true,upstreamResult:url,qualityAudit:{requested:"high",executed:"medium",fallbackReason:null}},cost:10,metered:true,billingQuote:quote({version:1,config:fixtureConfig()},facts({feature:"canvas.image",quality:"high"}))});
        await f.pool.query("UPDATE app_canvas_image_tasks SET status='processing',attempts=3 WHERE id=$1",[id]);await f.pool.query("UPDATE app_credit_batches SET expires_at=now()-interval '1 second' WHERE email=$1",[email]);
        const task=await db.getCanvasImageTask(email,id);await (await import("../src/lib/canvas-image-tasks")).processCanvasImageTask(task!);
        const saved=await db.getCanvasImageTask(email,id);assert.equal(saved?.status,"needs_attention");assert.ok(saved?.parameters.upstreamResult);assert.equal(Number((await f.pool.query("SELECT reserved_credits FROM app_billing_operations WHERE id=$1",[id])).rows[0].reserved_credits),10);
        await db.addCreditBatch(email,20,{source:"admin",reason:"Canvas funding"});const {signSession}=await import("../src/lib/admin-auth"),api=await import("../src/app/api/admin/billing/operations/route");const reconciliation=await api.POST(new Request("http://localhost/api/admin/billing/operations",{method:"POST",headers:{cookie:`nv_admin=${signSession(Date.now())}`,"content-type":"application/json"},body:JSON.stringify({id:randomUUID(),operationId:id,reason:"Retained result funding",proof:"Saved fixture output",result:{state:"succeeded",items:[{id,state:"succeeded",executedQuality:"medium"}]}})}));assert.equal(reconciliation.status,200,await reconciliation.clone().text());await (await import("../src/lib/canvas-image-tasks")).recoverCanvasImageTasks();assert.equal((await db.getCanvasImageTask(email,id))?.status,"completed");assert.equal(await db.getCanvasImageTaskChargedCredits(id),10);
      } else throw new Error("Unknown review case");
    } finally {await f.close();}
  }
  console.log(`PASS review ${test}`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
