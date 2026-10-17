import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";

async function main(){
  assert.equal(process.platform,"linux");
  assert.equal(process.getuid?.(),1001);
  assert.equal(process.env.VIDEO_FIXTURE_BOOTSTRAP_ROLLBACK,"1");
  const h=await createVideoFixture({startWorker:false});
  const output=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`rollback-${randomUUID()}`);
  await mkdir(output,{recursive:true});
  const digest=(bytes:ArrayBuffer)=>createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const compareProtected=(before:Record<string,string>,after:Record<string,string>)=>{
    for(const [name,value] of Object.entries(before))assert.equal(after[name],value,`Protected table ${name} changed`);
    const empty=createHash("sha256").update("[]").digest("hex");
    for(const [name,value] of Object.entries(after))if(!(name in before))assert.equal(value,empty,`Unexpected rows in additive table ${name}`);
  };
  const compareOldTask=(before:Record<string,unknown>,after:Record<string,unknown>)=>{for(const [key,value] of Object.entries(before))assert.deepEqual(after[key],value,`Immutable old task field ${key} changed`);};
  const version=async(commit:string)=>{const value=await fetch(h.baseUrl+"/api/version").then(response=>response.json());assert.equal(value.commit,commit);return value;};
  const task=async(id:string)=>{const value=await h.request<any>("a","GET",`/api/video/tasks?id=${id}`);assert.equal(value.status,200,JSON.stringify(value.body));return value.body.task;};
  const terms=async()=>{const value=await h.request<any>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId:"video-a",resolution:"720p"});assert.equal(value.status,200,JSON.stringify(value.body));return {billingVersion:value.body.version,billingCredits:value.body.mode==="api-cost-plus"?value.body.authorizedCredits:value.body.credits};};
  const verifyPrivate=async()=>{
    for(const ref of [h.refs.image,h.refs.video]){
      const owned=await h.request<ArrayBuffer>("a","GET",ref.url);assert.equal(owned.status,200);assert.equal(digest(owned.body),ref.sha256);
      assert.equal((await h.request("b","GET",ref.url)).status,404);
      assert.equal((await fetch(h.baseUrl+ref.url)).status,401);
      const range=await fetch(h.baseUrl+ref.url,{headers:{cookie:h.cookies.a,range:"bytes=0-31"}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
    }
  };
  try{
    assert.ok(h.legacySchema?.length);
    assert.ok(h.legacyRowsBeforeDdl);
    const legacyAfterDdl=await h.legacySentinelState();
    for(const [name,row] of Object.entries(h.legacyRowsBeforeDdl!))for(const [key,value] of Object.entries(row))assert.deepEqual(legacyAfterDdl[name]?.[key],value,`Legacy ${name}.${key} changed by DDL`);
    let columns=await h.schemaColumns();
    for(const old of h.legacySchema!){const current=columns.find(row=>row.table_name===old.table_name&&row.column_name===old.column_name);assert.ok(current,`${old.table_name}.${old.column_name} removed`);assert.equal(current.data_type,old.data_type);}
    const versions:any[]=[];
    await h.resetUnconsumedVideoDefaultsForLegacyBootstrap();
    await h.restartApp("rollback");versions.push(await version(process.env.VIDEO_FIXTURE_ROLLBACK_SOURCE_COMMIT!));
    await verifyPrivate();
    const prompt="旧版创建的完整原始提示词\n".repeat(20),operation=randomUUID();
    const oldCreate=await h.request<any>("a","POST","/api/video/generate",{prompt,modelId:"video-a",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",generateAudio:false,watermark:false,idempotencyKey:operation,...await terms()});
    assert.equal(oldCreate.status,200,JSON.stringify(oldCreate.body));const oldId=oldCreate.body.taskId;assert.ok(oldId);
    let oldTask=await task(oldId);
    for(let index=0;index<30&&oldTask.status!=="completed";index++){await h.forceVideoPollDue(oldId);await h.tick();oldTask=await task(oldId);await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(oldTask.status,"completed",JSON.stringify(oldTask));
    const oldPersisted=await h.rollbackTaskState("a",oldId),beforeUpgrade=await h.protectionSnapshot();assert.ok(beforeUpgrade.app_video_model_defaults);
    let restoration:{database:string;backupSha256:string}|undefined;
    const restoreNonce=process.env.VIDEO_FIXTURE_RESTORE_NONCE;
    if(restoreNonce){
      assert.match(restoreNonce,/^[a-f0-9]{32}$/);
      await h.stopAppForFixtureRestore();
      const requestFile=path.resolve(`output/canvas-video-fusion-20261013/restore-${restoreNonce}.json`),ackFile=requestFile+".ack";
      const name=`naumi_video_fixture_restore_${restoreNonce}`;
      await writeFile(requestFile,JSON.stringify({owner:"canvas-video-fusion-20261013",nonce:restoreNonce,sourceDatabase:h.fixtureDatabaseName,targetDatabase:name,schema:h.fixtureSchema,oldTaskId:oldId}));
      let ack:any;const until=Date.now()+60_000;
      while(Date.now()<until){try{ack=JSON.parse(await readFile(ackFile,"utf8"));break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
      assert.equal(ack?.nonce,restoreNonce);assert.equal(ack.restored,true);assert.match(ack.backupSha256,/^[a-f0-9]{64}$/);
      assert.equal(await h.restartOnRestoredFixtureDatabase(name),name);
      assert.deepEqual(await h.protectionSnapshot(),beforeUpgrade);assert.deepEqual(await h.rollbackTaskState("a",oldId),oldPersisted);
      restoration={database:name,backupSha256:ack.backupSha256};
    }
    const count=h.supplierCalls().filter(call=>(call as any).phase==="create").length;
    await h.restartApp();versions.push(await version(process.env.VIDEO_FIXTURE_BUILT_SOURCE_COMMIT!));
    columns=await h.schemaColumns();
    for(const old of h.legacySchema!){const current=columns.find(row=>row.table_name===old.table_name&&row.column_name===old.column_name);assert.ok(current);assert.equal(current.data_type,old.data_type);}
    const migrated=await h.legacySentinelState();for(const [name,row] of Object.entries(h.legacyRowsBeforeDdl!))for(const [key,value] of Object.entries(row))assert.deepEqual(migrated[name]?.[key],value,`Legacy ${name}.${key} changed during actual upgrade`);
    assert.equal((await task(oldId)).status,"completed");compareOldTask(oldPersisted,await h.rollbackTaskState("a",oldId));
    await verifyPrivate();compareProtected(beforeUpgrade,await h.protectionSnapshot());
    const signed=await h.shortLivedFixtureObjectUrl(h.refs.video.storageKey);
    const fresh=await fetch(signed);assert.equal(fresh.status,200);assert.equal(digest(await fresh.arrayBuffer()),h.refs.video.sha256);
    const tampered=new URL(signed);tampered.searchParams.set("X-Amz-Signature","0".repeat(64));assert.equal((await fetch(tampered)).status,403);
    await new Promise(resolve=>setTimeout(resolve,2200));const expired=await fetch(signed);assert.equal(expired.status,403);assert.match(await expired.text(),/expired fixture signature/);
    await verifyPrivate();
    const mediaStart=await h.request<any>("a","POST","/api/video/media-jobs",{operationId:randomUUID(),action:"frame",timestamp:1,inputs:[h.refs.video.id]});assert.equal(mediaStart.status,202,JSON.stringify(mediaStart.body));
    let media:any;const mediaUntil=Date.now()+90_000;
    while(Date.now()<mediaUntil){const response=await h.request<any>("a","GET",`/api/video/media-jobs/${mediaStart.body.jobId}`);assert.equal(response.status,200);media=response.body.job;if(media.status==="completed")break;assert.ok(!["failed","cancelled"].includes(media.status),JSON.stringify(media));await new Promise(resolve=>setTimeout(resolve,250));}
    assert.equal(media.status,"completed");assert.equal(media.cost,0);assert.equal(media.outputs.length,1);
    const frame=await h.request<ArrayBuffer>("a","GET",media.outputs[0].url);assert.equal(frame.status,200);assert.equal(digest(frame.body),media.outputs[0].sha256);
    assert.equal((await h.request("b","GET",media.outputs[0].url)).status,404);
    h.setScenario("accepted-disconnect");
    const current=await h.request<any>("a","POST","/api/video/generate",{prompt:"新版已接受但回执不确定，禁止旧版重复提交",modelId:"video-a",mode:"text",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",generateAudio:false,watermark:false,idempotencyKey:randomUUID(),...await terms()});
    assert.equal(current.status,200,JSON.stringify(current.body));const heldId=current.body.taskId;assert.equal((await task(heldId)).status,"needs_attention");
    const held=await h.rollbackTaskState("a",heldId),protectedState=await h.protectionSnapshot();
    assert.equal(h.supplierCalls().filter(call=>(call as any).phase==="create").length,count+1);
    const drained=await h.mediaWorkerMode("drain");assert.equal(drained.running,0);assert.equal(drained.queued,0);
    await h.restartApp("rollback");versions.push(await version(process.env.VIDEO_FIXTURE_ROLLBACK_SOURCE_COMMIT!));
    await h.tick();await h.tick();
    assert.equal(h.supplierCalls().filter(call=>(call as any).phase==="create").length,count+1);
    assert.equal((await task(oldId)).status,"completed");assert.equal((await task(heldId)).status,"needs_attention");
    await verifyPrivate();assert.deepEqual(await h.protectionSnapshot(),protectedState);assert.deepEqual(await h.rollbackTaskState("a",heldId),held);
    await h.restartApp();versions.push(await version(process.env.VIDEO_FIXTURE_BUILT_SOURCE_COMMIT!));
    await h.mediaWorkerMode("resume");await h.tick();await h.tick();
    assert.equal((await task(heldId)).status,"needs_attention");assert.deepEqual(await h.rollbackTaskState("a",heldId),held);
    assert.deepEqual(await h.protectionSnapshot(),protectedState);assert.equal(h.supplierCalls().filter(call=>(call as any).phase==="create").length,count+1);
    const evidence={ok:true,actualCompiledLinuxRuntimes:true,appUid:1001,legacySchemaInitializedByOldRuntime:true,legacyRowsExistedBeforeAdditiveDdlAndPreserved:true,oldColumnsAndTypesPreserved:true,oldColumnCount:h.legacySchema!.length,newColumnCount:columns.length,oldTaskCreatedAndCompletedByOldRuntime:true,oldTaskFrozenDataPreserved:true,privateMediaBytesAndRangeAndTwoAccountAuth:true,actualPresignedBytesAndTamperAndExpiry:true,expiredObjectUrlDoesNotBreakOwnedMediaRoute:true,accountLedgerModelAndBillingHashesPreserved:true,rollbackAndReupgrade:true,acceptedUnknownNeverResubmitted:true,mediaWorkerDrainedAndResumed:true,versions,formalSupplierCalls:0,realVideoQualityValidated:false,productionBaselineRefreshed:false,databaseRestorationProven:Boolean(restoration),restoration};
    Object.assign(evidence,{newMediaFrameCompletesOnUnchangedLegacyBilling:true,legacyFixtureSeedSource:process.env.VIDEO_FIXTURE_LEGACY_SOURCE_ROOT?process.env.VIDEO_FIXTURE_ROLLBACK_SOURCE_COMMIT:null,oldRuntimeTicksPreserveUncertainTask:true,fullImmutableTaskRowsCompared:true,frozenVideoDefaultsIncluded:true});
    await writeFile(path.join(output,"result.json"),JSON.stringify(evidence,null,2));console.log("VIDEO_FIXED_LINUX_ROLLBACK=PASS "+output);
  }finally{await h.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
