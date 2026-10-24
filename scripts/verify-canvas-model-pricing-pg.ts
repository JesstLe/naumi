import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  let http=0;
  const f=await createModelFixture((_req,res)=>{http++;res.writeHead(500);res.end("No supplier call permitted");});
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-canvas-pricing-management-token-independent-20261024",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-canvas-pricing-envelope-secret-independent-20261024",NAUMI_VIDEO_WORKER:"0"});
  const primary=f.config.upstreamModels[0], alternate=structuredClone(primary);
  alternate.id="u2";alternate.capabilities.preserveIdentity=true;
  alternate.capabilities.qualityRank=5;alternate.capabilities.qualities=["low","medium","high","xhigh","max"];
  f.config.upstreamModels.push(alternate);
  primary.enabled=false;primary.capabilities.generate=false;primary.capabilities.edit=false;
  const family=f.config.publicModels[0];
  family.supplierRouting={mode:"priority",channels:[{upstreamId:"u2",enabled:true,priority:1,weight:1}]};
  f.config.publicModels.push({...structuredClone(family),id:"image-b",label:"Second priced model"});
  const db=await import("../src/lib/db");let checks=0;
  const check=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;};
  try {
    await f.repo.current();await db.ensureSchema();
    const {getBillingRuntime}=await import("../src/lib/billing/server");
    const billing=(await getBillingRuntime()).config,initial=await billing.current(),config=structuredClone(initial.config);
    config.switches.metering="on";
    config.features["canvas.image"].rules=[...config.features["canvas.image"].rules,...["image-a","image-b"].map((id,index)=>({id:`mvp-credit-${id}`,priority:100,when:{modelId:[id]},pricing:{mode:"quality-resolution" as const,quality:{low:index?8:0,medium:index?9:6,high:index?17:10,xhigh:20,max:25,auto:6},resolutionExtra:{"1K":0,"2K":2,"4K":6,"5K":10}}}))];
    const published=await billing.publish({id:randomUUID(),expectedVersion:initial.version,config,actor:"fixture",reason:"canvas model price regression"});
    const owner=`canvas-price-${randomUUID()}@example.test`;
    await db.getOrCreateUser(owner,"Canvas quote fixture");
    const {signUserSession}=await import("../src/lib/native-auth");
    const cookie=`nv_user=${signUserSession(owner,Date.now())}`;
    const quoteRoute=await import("../src/app/api/billing/quote/route"),catalogRoute=await import("../src/app/api/billing/catalog/route");
    const req=(body?:unknown)=>new Request(`http://localhost/api/billing/${body?"quote":"catalog"}`,{method:body?"POST":"GET",headers:{cookie,"content-type":"application/json","x-naumi-canvas":"1"},...(body?{body:JSON.stringify(body)}:{})});
    const ledgerBefore=(await db.getPool().query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[owner])).rows[0].n;
    for(const [id,quality,quantity,expected] of [["image-a","high",1,10],["image-b","high",1,17],["image-a","low",1,0],["image-a","high",3,30]] as const) {
      const response=await quoteRoute.POST(req({feature:"canvas.image",modelId:id,quality,resolution:"1K",ratio:"1:1",quantity}));
      if(response.status!==200){console.error("QUOTE_HTTP_BODY="+await response.clone().text());const {quoteForRequest}=await import("../src/lib/billing/server");await quoteForRequest(req({feature:"canvas.image",modelId:id,quality,resolution:"1K",ratio:"1:1",quantity}),{feature:"canvas.image",modelId:id,quality,resolution:"1K",ratio:"1:1",quantity});}
      check(response.status,200,`${id}/${quality}/${quantity} quote HTTP`);
      const result=await response.json();check(result.credits,expected,"server selected-model price");check(result.modelId,id,"selected model retained");
    }
    const pixels=await sharp({create:{width:64,height:64,channels:3,background:"#dec5a5"}}).png().toBuffer();
    const imageId=`ref-${randomUUID()}`;
    await db.addArtworks(owner,[{id:imageId,title:"Owned reference",category:"main",prompt:"local fixture",status:"completed",image:`data:image/png;base64,${pixels.toString("base64")}`,gradient:"from-white to-slate-100"}]);
    const {planImagegen}=await import("../src/lib/imagegen/plan");
    const plan=await planImagegen({version:1,operationId:randomUUID(),entry:"canvas",mode:"edit",prompt:"A cat in warm window light",modelId:"image-a",inputs:[{artworkId:imageId,role:"edit-target"}],variants:1,parameters:{quality:"high",resolution:"1K",ratio:"1:1"},output:{format:"png"},augment:false},owner);
    check(plan.steps[0].eligibleUpstreamIds,["u2"],"actual planner keeps healthy alternate");
    check(plan.totalCredits,10,"actual reference edit quotes after admission");check(plan.confirmationRequired,false,"no added confirmation");
    const cat=await catalogRoute.GET(req());check(cat.status,200,"catalog independent of disabled primary");
    const body=await cat.json();check(typeof body.features["canvas.image"].prices.high["1K"],"number","generic catalog available");
    check((await catalogRoute.GET(new Request("http://localhost/api/billing/catalog"))).status,401,"anonymous remains unauthorized");
    const next=structuredClone(config);next.features["canvas.image"].pricing={mode:"matrix",prices:Object.fromEntries(["low","medium","high","xhigh","max","auto"].map(quality=>[quality,Object.fromEntries(["1K","2K","4K","5K"].map(resolution=>[resolution,quality==="high"&&resolution==="1K"?10:null]))]))};next.features["canvas.image"].rules=[];
    await billing.publish({id:randomUUID(),expectedVersion:published.version,config:next,actor:"fixture",reason:"missing price cell fixture"});
    const partial=await catalogRoute.GET(req());check(partial.status,200,"one absent matrix cell does not break directory");
    const cells=(await partial.json()).features["canvas.image"].prices;check(cells.high["1K"],10,"configured cell preserved");check(cells.low["1K"],null,"missing cell is not free");
    check((await db.getPool().query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[owner])).rows[0].n,ledgerBefore,"quotes/planning never charge");check(http,0,"no supplier HTTP");
    console.log(`CANVAS_MODEL_PRICING_PG=PASS CHECKS=${checks} REAL_PG=1 ACTUAL_PLAN=1 ACTUAL_ROUTES=1 SUPPLIER_HTTP=0 BILLING_DELTA=0`);
  } finally {await db.getPool().end();await f.cleanup();console.log("CLEANUP=PASS OWN_SCHEMA_DROPPED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
