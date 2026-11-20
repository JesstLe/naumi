/** Actual browser quote -> multipart entry -> hidden configured model -> pixels/ledger.
 * Requires a separate local PG fixture. All image supplier HTTP stays loopback. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  let calls=0,checks=0,db:any;
  const check=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;};
  const source=await sharp({create:{width:64,height:64,channels:4,background:"white"}}).png().toBuffer();
  const subject=await sharp({create:{width:32,height:32,channels:4,background:"blue"}}).png().toBuffer();
  const transparent=await sharp({create:{width:64,height:64,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:subject,left:16,top:16}]).png().toBuffer();
  const f=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    if(!req.url?.endsWith("/images/edits")){res.writeHead(404);res.end("{}");return;}
    calls++;
    const form=await new Request(f.origin+req.url,{method:"POST",headers:{"content-type":req.headers["content-type"]!},body:Buffer.concat(chunks)}).formData();
    check([form.get("model"),form.get("background")],["wire-cutout","transparent"],"configured model and real transparent wire");
    res.setHeader("content-type","application/json");res.end(JSON.stringify({data:[{b64_json:transparent.toString("base64")}]}));
  });
  const media=await mkdtemp(join(tmpdir(),"cutout-quoted-default-"));
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-only",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-only-independent-secret",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:f.origin+"/v1",REPLICATE_API_TOKEN:"",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media});
  try{
    const up=structuredClone(f.config.upstreamModels[0]);up.id="cutout-up";up.model="wire-cutout";up.capabilities.transparent=true;up.capabilities.preserveIdentity=true;f.config.upstreamModels.push(up);
    f.config.publicModels.push({id:"image-cutout-verified",label:"Internal cutout",modality:"image",visible:false,enabled:true,target:{type:"upstream",id:up.id},toolScope:{features:["tool.cutout"],defaultFor:[]}});
    f.config.bindings["image.cutout"]="image-cutout-verified";
    await f.repo.current();db=await import("../src/lib/db");await db.ensureSchema();
    const billing=await import("../src/lib/billing/service"),service=billing.createBillingService();
    const users=[`cutout-${randomUUID()}@example.test`,`other-${randomUUID()}@example.test`];
    for(const email of users){await db.getOrCreateUser(email,"Isolated fixture");await billing.withBillingTransaction(db.getPool(),tx=>service.grantTx(tx,{id:randomUUID(),email,amount:200,source:"admin",reason:"isolated fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));}
    const [owner,other]=users;
    const {getBillingRuntime}=await import("../src/lib/billing/runtime"),runtime=await getBillingRuntime(),old=await runtime.config.current(),config=structuredClone(old.config);
    config.switches.metering="on";config.features["tool.cutout"].pricing={mode:"fixed",credits:3};config.features["tool.cutout"].rules=[];
    await runtime.config.publish({id:randomUUID(),expectedVersion:old.version,config,actor:"fixture",reason:"quoted default regression"});
    const {signUserSession,USER_COOKIE}=await import("../src/lib/native-auth");
    const auth=(email=owner)=>({cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`,origin:"http://internal","x-naumi-canvas":"1"});
    const {POST:quote}=await import("../src/app/api/billing/quote/route"),{POST:cutout}=await import("../src/app/api/cutout/route");
    const quoted=await quote(new Request("http://internal/api/billing/quote",{method:"POST",headers:{...auth(),"content-type":"application/json"},body:JSON.stringify({feature:"tool.cutout",quantity:1,quality:"medium",resolution:"1K",ratio:"1:1"})}));
    const q=await quoted.json();check([quoted.status,q.modelId,!!q.quote?.id],[200,"image-cutout-verified",true],"implicit browser quotation");
    const request=(operationId:string,email=owner,options:{quote?:boolean;header?:string;bodyModel?:string}={})=>{
      const form=new FormData();form.set("image",new File([new Uint8Array(source)],"original.png",{type:"image/png"}));
      form.set("quality","medium");form.set("ratio","1:1");form.set("resolution","1K");
      if(options.bodyModel)form.set("model",options.bodyModel);
      const headers=new Headers({...auth(email),"x-naumi-billing-operation-id":operationId,"x-naumi-billing-version":String(q.version),"x-naumi-billing-credits":String(q.credits),"x-naumi-model-version":String(q.modelVersion),"x-naumi-feature-model":options.header||q.modelId});
      if(options.quote!==false)headers.set("x-naumi-image-quote",q.quote.id);
      return new Request("http://internal/api/cutout",{method:"POST",headers,body:form});
    };
    const id=randomUUID(),result=await cutout(request(id)),body=await result.json();
    check(result.status,200,JSON.stringify(body));check(calls,1,"one supplier call");
    const art=(await db.listArtworksByIds(owner,[body.id]))[0];assert.ok(art);checks++;
    const pixels=await(await import("../src/lib/imagegen/postprocess")).inspectImagegenPixels(transparent);
    check([pixels.fullyTransparentPixels>0,pixels.visiblePixels>0],[true,true],"valid alpha and subject");
    const row=(await db.getPool().query("SELECT state,charged_credits,quote->'facts'->>'modelId' model FROM app_billing_operations WHERE id=$1",[`tool-${id}`])).rows[0];
    check([row.state,Number(row.charged_credits),row.model],["settled",3,"image-cutout-verified"],"frozen identity and one charge");
    const replay=await cutout(request(id));check([replay.status,(await replay.json()).id,calls],[200,body.id,1],"same original receipt without supplier replay");
    for(const [label,email,options] of [["wrong-owner",other,{}],["unquoted-hidden",owner,{quote:false}],["body-hidden",owner,{bodyModel:q.modelId}],["different-header",owner,{header:"missing-model"}]] as const){
      const denied=await cutout(request(randomUUID(),email,options));check(denied.status>=400,true,label);check(calls,1,label+" no supplier call");
    }
    console.log(`CUTOUT_QUOTED_DEFAULT_HTTP_PG=PASS CHECKS=${checks} QUOTE=200 SUBMIT=200 REPLAY=200 SUPPLIER_POSTS=1 CHARGED=3 HIDDEN_UNQUOTED=REJECTED OWNER_MISMATCH=REJECTED BODY_HIDDEN=REJECTED HEADER_MISMATCH=REJECTED EXTERNAL_CALLS=0`);
  }finally{
    if(db)await db.getPool().end();await f.cleanup();await rm(media,{recursive:true,force:true});
    console.log("CUTOUT_QUOTED_DEFAULT_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1");
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
