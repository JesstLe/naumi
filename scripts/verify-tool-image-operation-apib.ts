/** Toolbox image routes on an APIB (apimart-images) channel: the managed client
 * must give each supplier call a stable unit derived from its billing operation.
 * Before the fix every such call was rejected locally with INVALID_REQUEST 400. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  let checks=0;const check=(actual:unknown,expected:unknown,message:string)=>{assert.deepEqual(actual,expected,message);checks++;};
  const input=await sharp({create:{width:64,height:64,channels:4,background:"white"}}).png().toBuffer();
  const subject=await sharp({create:{width:32,height:32,channels:4,background:"blue"}}).png().toBuffer();
  const output=await sharp({create:{width:64,height:64,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:subject,left:16,top:16}]).png().toBuffer();
  const posts:any[]=[],tasks=new Map<string,number>();let uploads=0,origin="";
  const f=await createModelFixture(async(req,res)=>{
    const url=new URL(req.url!,origin);
    if(url.pathname.startsWith("/media/"))return res.end(output);
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
    res.setHeader("content-type","application/json");
    if(url.pathname==="/v1/uploads/images"){
      const form=await new Request(origin+url.pathname,{method:"POST",headers:{"content-type":String(req.headers["content-type"])},body:Buffer.concat(chunks)}).formData();
      const uploaded=[...form.values()].find(v=>v instanceof File) as File;assert.ok(uploaded);assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()),input,"reference bytes survive the real upload adapter");
      uploads++;return res.end(JSON.stringify({url:"https://fixture.invalid/uploaded.png"}));}
    if(url.pathname==="/v1/images/generations"){
      const payload=JSON.parse(Buffer.concat(chunks).toString());posts.push({payload,idempotency:req.headers["idempotency-key"]});
      const id=`task_${posts.length}`;tasks.set(id,posts.length);return res.end(JSON.stringify({data:{id,status:"submitted"}}));
    }
    if(url.pathname.startsWith("/v1/tasks/")){
      const id=decodeURIComponent(url.pathname.split("/").pop()!);assert.ok(tasks.has(id),"query only the original task");
      return res.end(JSON.stringify({data:{id,model:"wire-apib-image",status:"completed",cost:"0.01",result:{images:[{url:[`${origin}/media/${id}.png`]}]}}}));
    }
    res.statusCode=404;res.end("{}");
  });
  origin=f.origin;
  const media=await mkdtemp(join(tmpdir(),"naumi-tool-opid-"));
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-tool-opid-20261105",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-envelope-tool-opid-20261105",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:f.origin+"/v1",REPLICATE_API_TOKEN:"",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media});
  let db:any;
  try{
    const c=f.config,u=c.upstreamModels[0];
    c.providers[0].protocol="apimart-images";c.providers[0].timeoutMs=5000;
    u.model="wire-apib-image";u.capabilities.verified=false;u.capabilities.transparent=true;u.capabilities.edit=true;u.capabilities.preserveIdentity=true;u.capabilities.maxReferenceImages=16;u.capabilities.qualities=["medium","high"];
    u.parameterMap={apimartImages:{schemaVersion:1,maxOutputs:4,supportsMask:true,ratios:["1:1"],outputDimensions:{"1K:1:1":{width:64,height:64},"2K:1:1":{width:64,height:64}}},
      qualityPolicy:{mode:"map",choices:[{id:"medium",label:"标准",value:"standard"},{id:"high",label:"高",value:"high"}]},
      resolutionPolicy:{mode:"map",field:"resolution",ratioField:"aspect_ratio",values:{"1K":"1MP","2K":"2K"}}} as any;
    c.bindings["image.cutout"]="image-a";
    await f.repo.current();db=await import("../src/lib/db");await db.ensureSchema();
    const {ensureSupplierSchema}=await import("../src/lib/supplier-cost/schema");await ensureSupplierSchema(f.sql);
    const billing=await import("../src/lib/billing/service"),service=billing.createBillingService();
    const email=`tool-${randomUUID()}@example.test`;await db.getOrCreateUser(email,"tool opid fixture");
    await billing.withBillingTransaction(db.getPool(),async(tx:any)=>{
      await tx.query("DELETE FROM app_ledger WHERE email=$1",[email]);await tx.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await tx.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[email]);
      await service.grantTx(tx,{id:randomUUID(),email,amount:100,source:"admin",reason:"isolated tool fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"});
    });
    const {getBillingRuntime}=await import("../src/lib/billing/server"),runtime=await getBillingRuntime(),old=await runtime.config.current(),config=structuredClone(old.config);
    config.switches.metering="on";config.features["tool.cutout"].pricing={mode:"fixed",credits:1};config.features["tool.cutout"].rules=[];config.features["tool.dewatermark"].pricing={mode:"fixed",credits:1};config.features["tool.dewatermark"].rules=[];
    await runtime.config.publish({id:randomUUID(),expectedVersion:old.version,config,actor:"fixture",reason:"tool opid fixed price"});
    const {signUserSession,USER_COOKIE}=await import("../src/lib/native-auth"),{POST}=await import("../src/app/api/cutout/route");
    const cutout=(operationId:string)=>{const form=new FormData();form.set("image",new File([new Uint8Array(input)],"photo.png",{type:"image/png"}));form.set("quality","medium");form.set("category","cutout");
      return POST(new Request("http://internal/api/cutout",{method:"POST",headers:{cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`,origin:"http://internal","x-naumi-billing-operation-id":operationId},body:form}));};

    // A. Channel without a transparency mapping: rejected before any supplier byte,
    // definitively not charged (not an UNKNOWN hold).
    const unmappedId=randomUUID(),unmapped=await cutout(unmappedId),unmappedBody=await unmapped.json();
    check([unmapped.ok,posts.length,uploads],[false,0,0],`unmapped cutout channel is rejected before submission (got ${unmapped.status} ${JSON.stringify(unmappedBody).slice(0,160)})`);
    check(String(unmappedBody.error).includes("透明背景参数"),true,`rejection names the missing mapping (got ${unmappedBody.error})`);
    const rejected=(await f.sql.query("SELECT state,charged_credits,settlement_result->>'state' AS settled FROM app_billing_operations WHERE id=$1",[`tool-${unmappedId}`])).rows[0];
    check([rejected.state,Number(rejected.charged_credits),rejected.settled],["settled",0,"failed"],"pre-submission rejection settles as failed with zero charge");

    // B. Administrator maps transparency to the protocol's background field.
    const models=await f.repo.current(),mc=structuredClone(models.config);
    for(const upstream of mc.upstreamModels)if(upstream.providerId===mc.providers[0].id)upstream.parameterMap={...upstream.parameterMap,imagegen:{...(upstream.parameterMap as any).imagegen,transparent:"background"}} as any;
    const draft=await f.repo.draft("fixture"),next=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:mc,actor:"fixture"});
    const pub=await f.repo.stage({id:randomUUID(),draftId:next.id,expectedRevision:next.revision,expectedVersion:models.version,actor:"fixture",reason:"map cutout transparency"});await f.repo.markApplied(pub.id,pub.digest);

    const operationId=randomUUID(),first=await cutout(operationId),body=await first.json();
    check([first.status,body.ok,typeof body.id],[200,true,"string"],`toolbox cutout on APIB succeeds (got ${first.status} ${JSON.stringify(body).slice(0,200)})`);
    check([posts.length,uploads],[1,1],"one upload and one paid generation POST");
    check(posts[0].payload.image_urls,["https://fixture.invalid/uploaded.png"],"unverified source still receives uploaded reference URL");
    check(posts[0].payload.background,"transparent","cutout submission explicitly requests a transparent background");
    const unit=(await f.sql.query("SELECT billing_unit_id FROM app_supplier_calls ORDER BY updated_at")).rows.map((r:any)=>r.billing_unit_id);
    check(unit,[`tool-${operationId}:tool-image:0`],"supplier unit derives from the billing operation");
    const call=(await f.sql.query("SELECT task_id,parameters->>'requestHash' AS hash FROM app_supplier_calls")).rows;
    check([call.length,call[0].task_id,!!call[0].hash],[1,"task_1",true],"supplier call persisted with its original task");
    check(posts[0].idempotency&&posts[0].idempotency.length===64,true,"submission carries the derived idempotency key");
    const op=(await f.sql.query("SELECT state,charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${operationId}`])).rows[0];
    check([op.state,Number(op.charged_credits)],["settled",1],"settled once at the frozen price");

    const replay=await cutout(operationId),again=await replay.json();
    check([replay.status,again.id,again.replayed,posts.length],[200,body.id,true,1],"same operation replays the receipt without a new supplier POST");

    const second=await cutout(randomUUID());check([second.status,posts.length],[200,2],"a new operation gets its own supplier unit");
    const units=(await f.sql.query("SELECT DISTINCT billing_unit_id FROM app_supplier_calls")).rows.length;check(units,2,"distinct units per billing operation");
    // Same defect class on another toolbox route that calls images.edit directly.
    const {POST:dewatermark}=await import("../src/app/api/dewatermark/route");
    const dwId=randomUUID(),dwForm=new FormData();dwForm.set("image",new File([new Uint8Array(input)],"photo.png",{type:"image/png"}));dwForm.set("quality","medium");
    const dw=await dewatermark(new Request("http://internal/api/dewatermark",{method:"POST",headers:{cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`,origin:"http://internal","x-naumi-billing-operation-id":dwId},body:dwForm}));
    const dwBody=await dw.json();
    check([dw.status,dwBody.ok,posts.length],[200,true,3],`dewatermark on APIB succeeds (got ${dw.status} ${JSON.stringify(dwBody).slice(0,160)})`);
    check((await f.sql.query("SELECT count(*)::int n FROM app_supplier_calls WHERE billing_unit_id=$1",[`tool-${dwId}:tool-image:0`])).rows[0].n,1,"dewatermark unit derives from its billing operation");
    console.log(`TOOL_IMAGE_OPERATION_APIB=PASS checks=${checks}`);
  }finally{
    await db?.getPool?.().end?.().catch(()=>{});await f.cleanup();await rm(media,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exit(1);});
