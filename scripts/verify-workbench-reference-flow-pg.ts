/** Native HTTP/service/PG/billing, with only a loopback supplier/media fixture.
 * No production credentials, database, accepted task or paid request is used. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,mkdir,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 let digest="",imageCalls=0,textCalls=0;
 const textOutcomes=new Map<string,string>(),textWires:any[]=[],imageWires:any[]=[];
 const fixture=await createModelFixture(async(req,res)=>{
  try{
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const raw=Buffer.concat(chunks);let body:any={};
   if(raw.length){
    if(String(req.headers["content-type"]).includes("multipart")){
     const form=await new Request("http://fixture",{method:"POST",headers:{"content-type":String(req.headers["content-type"])},body:new Uint8Array(raw)}).formData();
     body=Object.fromEntries(Array.from(form).filter(([,v])=>typeof v==="string"));
    }else body=JSON.parse(raw.toString());
   }
   res.setHeader("content-type","application/json");
   if(req.url?.startsWith("/internal/config")){
    if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
    if(req.url.endsWith("activate")){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}
    return res.end(JSON.stringify({digest}));
   }
   if(/\/images\/(generations|edits)$/.test(req.url||"")){
    imageCalls++;imageWires.push(body);
    const size=String(body.size||""),[rw,rh]=String(body.aspect_ratio||"1:1").split(":").map(Number);
    const [width,height]=/^\d+x\d+$/.test(size)?size.split("x").map(Number):[Math.max(1,Math.round(rw*1024/Math.max(rw,rh))),Math.max(1,Math.round(rh*1024/Math.max(rw,rh)))];
    const png=await sharp({create:{width,height,channels:3,background:"#c8d4fa"}}).png().toBuffer();
    return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
   }
   if(req.url?.endsWith("/chat/completions")){
    textCalls++;textWires.push(body);const reference=body.messages.at(-1).content.filter((c:any)=>c.type==="image_url").at(-1)?.image_url.url;
    const outcome=textOutcomes.get(reference)||"done";
    if(outcome==="network")return req.socket.destroy();
    if(/^\d+$/.test(outcome)){res.statusCode=Number(outcome);return res.end(JSON.stringify({error:{message:"sk-fixture-private https://supplier.invalid/private?token=private"}}));}
    const content=outcome==="blocks"?[{type:"text",text:"保留产品外形，采用清晰的浅色排版"}]:"保留产品外形，采用清晰的浅色排版";
    return res.end(JSON.stringify({id:"fixture",model:body.model,choices:[{message:{role:"assistant",content},finish_reason:"stop"}],usage:{prompt_tokens:30,completion_tokens:20}}));
   }
   res.statusCode=404;res.end("{}");
  }catch{res.statusCode=500;res.end('{"error":"fixture handler failed"}');}
 });
 process.env.PGOPTIONS=`-c search_path=${fixture.schemaName}`;
 Object.assign(process.env,{NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:fixture.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-workbench-router-1234567890",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-workbench-envelope-1234567890",MODEL_CONFIG_TRUSTED_ORIGINS:fixture.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:fixture.origin+"/v1",OPENAI_IMAGE_QUALITY:"high",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"workbench-flow-")),VIDEO_WORKER_SECRET:"fixture-workbench-worker-1234567890123456",NAUMI_VIDEO_WORKER:"0"});
 const config=fixture.config,upstream=config.upstreamModels[0];upstream.model="gpt-image-2";
 upstream.capabilities.preserveIdentity=true;upstream.capabilities.maxReferenceImages=8;
 upstream.parameterMap={resolutionPolicy:{mode:"map",field:"resolution",ratioField:"aspect_ratio",values:{"1K":"1K","2K":"2K"}}};
 const credential=await fixture.credentials.importPlain({providerId:"p2",plain:"fixture-text-only",actor:"fixture"});
 config.providers.push({...config.providers[0],id:"p2",name:"文字fixture",protocol:"openai-chat",credentialRef:credential.id});
 for(const [id,wire] of [["u2","wire-selected-text"],["u3","wire-legacy-vision"]])config.upstreamModels.push({...upstream,id,providerId:"p2",model:wire,modality:"text",capabilities:{...upstream.capabilities,vision:true},parameterMap:{}});
 config.publicModels.push({id:"text-a",label:"文字fixture",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"u2"}},{id:"legacy-vision",label:"独立视觉fixture",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"u3"}});
 config.bindings["agent.text"]="text-a";config.bindings["text.generate"]="text-a";config.bindings["vision.reference"]="legacy-vision";
 const enumCredential=await fixture.credentials.importPlain({providerId:"p-enum",plain:"fixture-enum-only",actor:"fixture"});
 config.providers.push({...config.providers[0],id:"p-enum",name:"枚举画幅fixture",credentialRef:enumCredential.id,options:{imageAdapter:"reverse-hub"}});
 config.upstreamModels.push({...upstream,id:"u-enum",providerId:"p-enum",model:"wire-enum-image",parameterMap:{}});
 config.publicModels.push({id:"image-enum",label:"枚举图片fixture",modality:"image",enabled:true,visible:true,target:{type:"upstream",id:"u-enum"}});
 const db=await import("../src/lib/db"),{createBillingService,withBillingTransaction}=await import("../src/lib/billing/service"),{updateBillingCompatibility}=await import("../src/lib/billing/server");
 const {POST,GET}=await import("../src/app/api/reference-workbench/[...path]/route"),service=await import("../src/lib/reference-workbench/service"),repo=await import("../src/lib/reference-workbench/repository"),{signUserSession}=await import("../src/lib/native-auth");
 const owner=`wb-flow-${randomUUID()}@example.test`,other=`wb-other-${randomUUID()}@example.test`,cookie=(email:string)=>`nv_user=${signUserSession(email,Date.now())}`;
 const call=(action:string,body?:any,email=owner)=> (body===undefined?GET:POST)(new Request("http://fixture/api/reference-workbench/"+action,{method:body===undefined?"GET":"POST",headers:{cookie:cookie(email),...(body===undefined?{}:{"content-type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)}));
 const json=async(action:string,body?:any,email=owner)=>{const response=await call(action,body,email),value=await response.json();assert.equal(response.status,200,JSON.stringify({action,status:response.status,value}));return value;};
 const wait=async(run:()=>Promise<any>,done:(v:any)=>boolean)=>{let last;for(let n=0;n<300;n++){last=await run();if(done(last))return last;await new Promise(resolve=>setTimeout(resolve,60));}throw Error("fixture timeout "+JSON.stringify(last));};
 let checks=0;
 try{
  const {validateModelConfig}=await import("../src/lib/model-config/schema");validateModelConfig(config,{trustedOrigins:[fixture.origin]});
  await fixture.repo.current();await db.ensureSchema();await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:10000,source:"admin",reason:"isolated fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  await updateBillingCompatibility("fixture","workbench reference-flow",c=>{c.switches.metering="on";c.features["canvas.text-generate"]={label:"文字fixture",enabled:true,unit:"task",pricing:{mode:"fixed",credits:2},settlement:{qualityBasis:"requested",successBasis:"successful-units",failureBps:0,byokBps:10000,reserveBps:10000,unknown:"hold"},rules:[]};});
  const heights=[1396,1452,977,1674,1445,1465,1561,1433,1188,1244,1569,1197,1354,1342,1174],form=new FormData();
  const files=[{path:"fixture/产品图/product.png",w:800,h:800},...heights.map((h,i)=>({path:`fixture/详情图/ref-${i}.png`,w:790,h})),{path:"fixture/详情图/wide.png",w:3810,h:310}];
  form.set("manifest",JSON.stringify(files.map(f=>({path:f.path}))));
  for(const file of files)form.append("files",new File([new Uint8Array(await sharp({create:{width:file.w,height:file.h,channels:3,background:"#dfe5f0"}}).png().toBuffer())],"fixture.png",{type:"image/png"}));
  const upload=await POST(new Request("http://fixture/api/reference-workbench/workbench/upload-folder",{method:"POST",headers:{cookie:cookie(owner)},body:form}));assert.equal(upload.status,200);const root=(await upload.json()).product_dir;
  const settings={quality:"high",resolution:"1k",mode:"all"},items=await json("workbench/items?root="+encodeURIComponent(root)+"&resolution=1k"),refs=items.items.filter((i:any)=>!i.ref_name.endsWith("wide.png")),wide=items.items.find((i:any)=>i.ref_name.endsWith("wide.png"));
  const payload=(rows:any[])=>({request_id:randomUUID(),workbench_root:root,config:settings,items:rows.map(i=>({ref_path:i.ref_path,prompt:"清晰产品图"}))});
  const all=await json("quote",{action:"workbench/start",body:payload(refs)});assert.equal(all.items.length,15);assert.ok(all.items.every((i:any)=>!i.preflightError));assert.equal(imageCalls,0);checks++;
  const enumBody={...payload([refs[6]]),config:{...settings,modelId:"image-enum"}},eq=await json("quote",{action:"workbench/start",body:enumBody}),enumPlan=(await repo.operation(owner,eq.id)).plans[0];
  assert.equal(enumPlan.plan.frameChoice.target,"790:1561");assert.equal(enumPlan.plan.frameChoice.effective,"9:16");assert.deepEqual(enumPlan.geometry,{width:9,height:16});assert.equal(imageCalls,0);checks++;
  const invalid=await call("quote",{action:"workbench/start",body:payload([wide])});assert.equal(invalid.status,400);assert.equal(imageCalls,0);checks++;
  const partialBody=payload([wide,refs[0]]),partial=await json("quote",{action:"workbench/start",body:partialBody});
  assert.ok(partial.items[0].preflightError);assert.equal(partial.items[0].credits,0);assert.ok(partial.items[1].credits>0);assert.equal(partial.totalCredits,partial.items[1].credits);checks++;
  const accepted={...partialBody,native_quote:{id:partial.id,credits:partial.totalCredits,confirmed:true}};
  await json("workbench/start",accepted);await json("workbench/start",accepted);
  const imageResult=await wait(async()=>{const op=await repo.operation(owner,partial.id);await service.synchronize(op);return repo.operation(owner,partial.id);},op=>op.state==="done");
  assert.equal(imageCalls,1);assert.equal(imageResult.result.items.find((i:any)=>i.key===wide.ref_path).state,"failed");assert.equal(imageResult.result.items.find((i:any)=>i.key===wide.ref_path).result.chargedCredits,0);
  assert.equal(imageResult.result.items.find((i:any)=>i.key===refs[0].ref_path).state,"succeeded");assert.equal(imageResult.result.chargedCredits,partial.totalCredits);checks++;
  const inferBody=payload(refs.slice(1,4)),iq=await json("quote",{action:"workbench/infer-prompts",body:inferBody});
  const {toVisionDataUrl}=await import("../src/lib/vision-image"),visionInputs=new Map<string,string>();
  for(const ref of refs.slice(1,4)){const asset=await service.imageBytes(owner,ref.ref_path);visionInputs.set(ref.ref_path,await toVisionDataUrl(asset.buffer,asset.mimeType));}
  for(const [i,outcome] of ["400","blocks","network"].entries())textOutcomes.set(visionInputs.get(refs[i+1].ref_path)!,outcome);
  const inferAccepted={...inferBody,native_quote:{id:iq.id,credits:iq.totalCredits,confirmed:true}};
  await json("workbench/infer-prompts",inferAccepted);
  const inferResult=await wait(async()=>{const op=await repo.operation(owner,iq.id);await service.synchronize(op);return repo.operation(owner,iq.id);},op=>op.state==="done");
  assert.deepEqual(inferResult.plans.map((t:any)=>t.state),["failed","done","maybe_submitted"]);assert.equal(inferResult.plans[0].errorCode,"TEXT_INPUT_REJECTED");assert.match(inferResult.plans[0].errorTraceId,/^wb-[a-f0-9]{16}$/);assert.ok(!JSON.stringify(inferResult).includes("sk-fixture-private"));checks++;
  assert.equal(textCalls,3);assert.ok(textWires.every(w=>w.model==="wire-selected-text"));assert.ok(textWires.every(w=>w.messages.at(-1).content.filter((c:any)=>c.type==="image_url").length===2));assert.ok(textWires.every(w=>!("modalities" in w)));checks++;
  const status=await json(`status?root=${encodeURIComponent(root)}&operation_id=${iq.id}`);assert.equal(status.progress.done,1);assert.equal(status.progress.failed,1);assert.equal(status.progress.unknown,1);assert.equal(status.progress.total,3);assert.equal(status.running,false);checks++;
  const old=await json(`status?root=${encodeURIComponent(root)}&operation_id=${partial.id}`);assert.equal(old.progress.done,1);assert.equal(old.progress.failed,1);assert.equal(old.progress.unknown,0);assert.equal(old.progress.total,2);checks++;
  const otherStatus=await json(`status?root=${encodeURIComponent(root)}&operation_id=${iq.id}`,undefined,other);assert.equal(otherStatus.progress.total,0);assert.equal((await call("workbench/items?root="+encodeURIComponent(root),undefined,other)).status,404);checks++;
  const inferenceItems=await json(`workbench/items?root=${encodeURIComponent(root)}&resolution=1k&operation_id=${iq.id}`);
  const successful=inferenceItems.items.find((i:any)=>i.ref_path===refs[2].ref_path);assert.match(successful.prompt,/清晰的浅色排版/);assert.equal(successful.infer.operation_id,iq.id);checks++;
  const rejectedBody=payload([refs[2]]),rq=await json("quote",{action:"workbench/infer-prompts",body:rejectedBody});textOutcomes.set(visionInputs.get(refs[2].ref_path)!,"429");
  await json("workbench/infer-prompts",{...rejectedBody,native_quote:{id:rq.id,credits:rq.totalCredits,confirmed:true}});
  await wait(async()=>{const op=await repo.operation(owner,rq.id);await service.synchronize(op);return repo.operation(owner,rq.id);},op=>op.state==="done");
  const kept=await json(`workbench/items?root=${encodeURIComponent(root)}&resolution=1k&operation_id=${rq.id}`);assert.match(kept.items.find((i:any)=>i.ref_path===refs[2].ref_path).prompt,/清晰的浅色排版/);checks++;
  await json("workbench/infer-prompts",inferAccepted);assert.equal(textCalls,4);
  assert.equal((await call("quote",{action:"workbench/infer-prompts",body:payload([refs[3]])})).status,409);assert.equal(textCalls,4);checks++;
  const ledger=(await db.getPool().query("SELECT id,feature,state,charged_credits,settlement_result,result_response FROM app_billing_operations WHERE email=$1 AND feature IN ('image.generate','canvas.text-generate') ORDER BY created_at",[owner])).rows;
  assert.equal(ledger.length,5);assert.equal(ledger.filter(r=>r.state==="settled"&&Number(r.charged_credits)===0).length,2);assert.equal(ledger.filter(r=>["hold","manual"].includes(r.state)).length,1);assert.equal(ledger.reduce((n,r)=>n+Number(r.charged_credits),0),partial.totalCredits+2);checks++;
  const evidence=process.env.NAUMI_WORKBENCH_EVIDENCE||"output/workbench-reference-flow";await mkdir(evidence,{recursive:true});
  await writeFile(join(evidence,"integration.json"),JSON.stringify({fixture:true,productionCalls:0,checks,imageCalls,textCalls,status,partialQuote:partial,ledger:ledger.map(r=>({state:r.state,chargedCredits:r.charged_credits}))},null,2));
  console.log(`WORKBENCH_FLOW_PG=PASS CHECKS=${checks} REFERENCES=15 PARTIAL_PREFLIGHT=1/2 MIXED_INFER=FAILED,DONE,UNKNOWN IMAGE_CALLS=${imageCalls} TEXT_CALLS=${textCalls} DUPLICATE_CALLS=0 PRODUCTION_CALLS=0`);
 }finally{await db.getPool().end();await fixture.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
