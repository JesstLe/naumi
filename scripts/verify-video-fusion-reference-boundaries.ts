import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import type {VideoReference} from "../src/lib/video/types";
type Fixture=Awaited<ReturnType<typeof createVideoFixture>>;

export async function runVideoReferenceBoundaries(h:Fixture,evidence:string){
  const inputs={image:h.refs.image,video:h.refs.video,audio:h.refs.audio},groups:{image:VideoReference[];video:VideoReference[];audio:VideoReference[]}={image:[],video:[],audio:[]},originals:Record<string,string>={};
  const sha=(bytes:ArrayBuffer)=>createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  for(const kind of ["image","video","audio"] as const){
    const source=await h.request<ArrayBuffer>("a","GET",inputs[kind].url!);assert.equal(source.status,200);originals[kind]=sha(source.body);
    for(let index=0;index<(kind==="image"?31:11);index++){
      // Distinct owned uploads/asset IDs; original fixture bytes are intentionally identical.
      const operationId=randomUUID(),body=new FormData(),mime=kind==="image"?"image/png":kind==="video"?"video/mp4":"audio/wav";
      body.append("file",new File([source.body],`${kind}-${index}.${kind==="image"?"png":kind==="video"?"mp4":"wav"}`,{type:mime}));body.append("operationId",operationId);
      const uploaded=await fetch(`${h.baseUrl}/api/video/references`,{method:"POST",headers:{cookie:h.cookies.a},body});assert.equal(uploaded.status,200);const upload=await uploaded.json();
      const registered=await h.request<any>("a","POST","/api/video/assets",{operationId,storageKey:upload.reference.storageKey,title:`Boundary ${kind} ${index}`});assert.equal(registered.status,201,JSON.stringify(registered.body));
      const asset=registered.body.asset;assert.equal(asset.kind,kind);assert.equal(asset.sha256,originals[kind]);
      groups[kind].push({id:`${kind}-${index}`,kind,role:kind==="video"?"source_video":kind==="audio"?"source_audio":"reference",artworkId:asset.artworkId,url:asset.url});
    }
    assert.equal(new Set(groups[kind].map(ref=>ref.artworkId)).size,groups[kind].length);
  }
  const quote=await h.request<any>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId:"video-a",resolution:"720p"});assert.equal(quote.status,200);
  const base={source:"workbench",modelId:"video-a",providerId:"managed-video",mode:"reference",prompt:"完整引用边界镜头。\n甲：所有素材按原顺序。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",billingVersion:quote.body.version,billingCredits:quote.body.mode==="api-cost-plus"?quote.body.authorizedCredits:quote.body.credits};
  const before=await h.creditState("a"),tasks=await h.dbCount("app_video_tasks"),ledger=await h.dbCount("app_ledger"),supplier=h.supplierCalls().filter(call=>call.phase==="create").length;
  const rejected=[];
  for(const kind of ["image","video","audio"] as const){
    const response=await h.request<any>("a","POST","/api/video/generate",{...base,references:groups[kind],idempotencyKey:randomUUID()});assert.equal(response.status,422);assert.equal(response.body.code,"REFERENCE_LIMIT_EXCEEDED");rejected.push({kind,count:groups[kind].length,code:response.body.code});
    assert.deepEqual(await h.creditState("a"),before);assert.equal(await h.dbCount("app_video_tasks"),tasks);assert.equal(await h.dbCount("app_ledger"),ledger);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,supplier);
  }
  const references=[...groups.image.slice(0,30),...groups.video.slice(0,10),...groups.audio.slice(0,10)],idempotencyKey=randomUUID();
  const generated=await h.request<any>("a","POST","/api/video/generate",{...base,references,idempotencyKey});assert.equal(generated.status,200,JSON.stringify(generated.body));const taskId=generated.body.taskId;
  let task:any;const until=Date.now()+180000;
  while(Date.now()<until){await h.forceVideoPollDue(taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${taskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),JSON.stringify(task));await new Promise(resolve=>setTimeout(resolve,300));}
  assert.equal(task?.status,"completed");const persisted=await h.taskPersistence("a",taskId);
  assert.equal(persisted.video_references.length,50);assert.deepEqual(persisted.video_references.map((ref:VideoReference)=>ref.artworkId),references.map(ref=>ref.artworkId));
  const native=h.supplierCalls().filter(call=>call.phase==="create").at(-1) as any;
  assert.equal(native.protocol,"ark");const wireReferences=native.body.content.filter((item:any)=>item.type!=="text");
  assert.equal(wireReferences.length,50,"Native supplier must receive every authorized reference");
  assert.deepEqual(wireReferences.map((item:any)=>item.type),references.map(ref=>`${ref.kind}_url`));
  for(let index=0;index<references.length;index++){
    const kind=references[index].kind,key=persisted.video_references[index].storageKey;
    assert.equal(typeof key,"string");assert.equal(wireReferences[index].role,`reference_${kind}`);
    assert.ok(decodeURIComponent(new URL(wireReferences[index][`${kind}_url`].url).pathname).endsWith('/'+key),"Native reference identity/order must match the frozen owned key");
  }
  await writeFile(path.join(evidence,"reference-native-create.json"),JSON.stringify(native,null,2));
  const after=await h.creditState("a"),replay=await h.request<any>("a","POST","/api/video/generate",{...base,references,idempotencyKey});assert.equal(replay.body.taskId,taskId);await h.tick();assert.deepEqual(await h.creditState("a"),after);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,supplier+1);
  for(const kind of ["image","video","audio"] as const)assert.equal(sha((await h.request<ArrayBuffer>("a","GET",inputs[kind].url!)).body),originals[kind]);
  const result={actualAppDbRouterWorker:true,distinctOwnedAssets:true,identicalOriginalBytesForCountTesting:true,accepted:{images:30,videos:10,audios:10},frozenReferenceCount:50,frozenOrderMatches:true,nativeReferenceCount:50,nativeTypesRolesIdentitiesAndOrderMatch:true,rejected,rejectionsWriteNoTasksOrLedgerAndChargeNothing:true,completedTaskId:taskId,idempotentCreateAndSettlement:true,originalSha256:originals};
  await writeFile(path.join(evidence,"reference-boundaries.json"),JSON.stringify(result,null,2));return result;
}
