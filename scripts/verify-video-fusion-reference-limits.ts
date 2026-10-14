import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture,CAP_RICH} from "./video-fusion/harness";
import {probeAsset} from "./video-fusion/assets.mjs";
import type {VideoModelDefinition} from "../src/lib/video/capability-schema";
import type {VideoReference} from "../src/lib/video/types";

type Dimension={id:string;kind:"image"|"video"|"audio";key:string;actual:number;count:number;code:string};
async function main(){
  const root=process.env.VIDEO_FIXTURE_ASSETS_ROOT!;assert.ok(root);
  const files={image:"first.png",video:"landscape-4-audio.mp4",audio:"tone-8.wav"},info:any={};
  for(const kind of ["image","video","audio"] as const){const bytes=await readFile(path.join(root,files[kind]));info[kind]={bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),probe:await probeAsset(path.join(root,files[kind]))};}
  const dimensions:Dimension[]=[];
  for(const kind of ["image","video","audio"] as const)dimensions.push({id:`${kind}-bytes`,kind,key:`${kind}MaxBytes`,actual:info[kind].bytes,count:1,code:"REFERENCE_BYTES_EXCEEDED"});
  for(const kind of ["video","audio"] as const){assert.equal(info[kind].probe.durationSeconds,Math.floor(info[kind].probe.durationSeconds));dimensions.push({id:`${kind}-duration`,kind,key:`${kind}MaxDurationSeconds`,actual:info[kind].probe.durationSeconds,count:1,code:"REFERENCE_DURATION_EXCEEDED"});dimensions.push({id:`${kind}-total`,kind,key:kind==="video"?"totalVideoDurationSeconds":"totalAudioDurationSeconds",actual:info[kind].probe.durationSeconds*2,count:2,code:"REFERENCE_TOTAL_DURATION_EXCEEDED"});}
  const extraVideoModels:Array<{id:string;definition:VideoModelDefinition}>=dimensions.flatMap(item=>["ok","reject"].map(outcome=>({id:`limit-${item.id}-${outcome}`,definition:{...structuredClone(CAP_RICH),modes:["reference"],limits:{...CAP_RICH.limits,[item.key]:item.actual-(outcome==="reject"?1:0)}}})));
  extraVideoModels.push({id:"limit-unknown-images",definition:{...structuredClone(CAP_RICH),modes:["reference"],limits:{...CAP_RICH.limits,images:null}}});
  const h=await createVideoFixture({startWorker:false,extraVideoModels}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`reference-limits-${randomUUID()}`),results:any[]=[];
  await mkdir(evidence,{recursive:true});
  try{
    const sourceAudio=await h.request<ArrayBuffer>("a","GET",h.refs.audio.url),operationId=randomUUID(),form=new FormData();form.append("file",new File([sourceAudio.body],"second-owned-audio.wav",{type:"audio/wav"}));form.append("operationId",operationId);
    const upload=await fetch(`${h.baseUrl}/api/video/references`,{method:"POST",headers:{cookie:h.cookies.a},body:form});assert.equal(upload.status,200);const uploaded=await upload.json();
    const registered=await h.request<any>("a","POST","/api/video/assets",{operationId,storageKey:uploaded.reference.storageKey,title:"Second source audio"});assert.equal(registered.status,201);
    const reference=(kind:"image"|"video"|"audio",id:string,asset:any):VideoReference=>({id,kind,role:kind==="image"?"reference":kind==="video"?"source_video":"source_audio",artworkId:asset.id||asset.artworkId,url:asset.url,bytes:1,durationSeconds:0});
    const refs=(item:Dimension)=>[...(item.kind==="image"?[]:[reference("image","visual",h.refs.image)]),reference(item.kind,"first",h.refs[item.kind]),...(item.count===2?[reference(item.kind,"second",item.kind==="video"?h.refs.silentVideo:registered.body.asset)]:[])];
    async function request(modelId:string,references:VideoReference[]){
      const quoted=await h.request<any>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId,resolution:"720p"});assert.equal(quoted.status,200);
      return h.request<any>("a","POST","/api/video/generate",{source:"workbench",providerId:"managed-video",modelId,mode:"reference",prompt:"完整来源上限验收。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",references,idempotencyKey:randomUUID(),billingVersion:quoted.body.version,billingCredits:quoted.body.mode==="api-cost-plus"?quoted.body.authorizedCredits:quoted.body.credits});
    }
    async function rejected(modelId:string,references:VideoReference[],code:string){
      const credits=await h.creditState("a"),tasks=await h.dbCount("app_video_tasks"),ledger=await h.dbCount("app_ledger"),calls=h.supplierCalls().filter(call=>call.phase==="create").length;
      const response=await request(modelId,references);assert.equal(response.status,422,JSON.stringify(response.body));assert.equal(response.body.code,code);
      assert.deepEqual(await h.creditState("a"),credits);assert.equal(await h.dbCount("app_video_tasks"),tasks);assert.equal(await h.dbCount("app_ledger"),ledger);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,calls);return {code,noTaskLedgerChargeOrSupplierCreate:true};
    }
    for(const item of dimensions){
      const references=refs(item),denied=await rejected(`limit-${item.id}-reject`,references,item.code),response=await request(`limit-${item.id}-ok`,references);assert.equal(response.status,200,JSON.stringify(response.body));
      const taskId=response.body.taskId;let task:any;const until=Date.now()+180000;
      while(Date.now()<until){await h.forceVideoPollDue(taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${taskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),JSON.stringify(task));await new Promise(resolve=>setTimeout(resolve,250));}
      assert.equal(task?.status,"completed");const frozen=await h.taskPersistence("a",taskId),matched=frozen.video_references.filter((ref:VideoReference)=>ref.kind===item.kind);assert.equal(matched.length,item.count);
      for(const ref of matched){assert.ok(ref.bytes>1);if(item.kind!=="image")assert.equal(ref.durationSeconds,info[item.kind].probe.durationSeconds);}
      const row={id:item.id,kind:item.kind,limitKey:item.key,actual:item.actual,clientClaim:{bytes:1,durationSeconds:0},rejected:denied,acceptedExactBoundary:true,actualOwnedMetadataOverridesClient:true,taskId};results.push(row);
      await writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:false,scope:"actual-source-reference-limits",cases:results},null,2));process.stdout.write(`REFERENCE_SOURCE_LIMIT=PASS ${item.id}\n`);
    }
    const unknown=await rejected("limit-unknown-images",[reference("image","unknown",h.refs.image)],"REFERENCE_LIMIT_EXCEEDED");
    for(const kind of ["image","video","audio"] as const){const source=await h.request<ArrayBuffer>("a","GET",h.refs[kind].url);assert.equal(createHash("sha256").update(Buffer.from(source.body)).digest("hex"),info[kind].sha256);}
    const credits=await h.creditState("a"),calls=h.supplierCalls().filter(call=>call.phase==="create").length;await h.restartApp();await h.tick();assert.deepEqual(await h.creditState("a"),credits);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,calls);
    await writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:true,scope:"actual-source-reference-limits",actualAppDbRouterWorker:true,cases:results,unknownImageCountRejected:unknown.noTaskLedgerChargeOrSupplierCreate,clientUnderclaimsNeverBypassLimits:true,allExactBoundariesCompleted:true,restartNoDuplicateChargesOrCreates:true,originalSourceHashesPreserved:true,paidVideoApiCalls:0,realVideoQualityValidated:false},null,2));process.stdout.write(`VIDEO_REFERENCE_SOURCE_LIMITS=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
