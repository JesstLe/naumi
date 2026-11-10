import {randomUUID} from "node:crypto";
import {fixtureDatabase} from "./fixture";
async function main(){

if(process.env.VIDEO_FIXTURE_PARENT_PIPE!=="1")throw new Error("Fixture action requires private parent pipe");
const guard=await fixtureDatabase();await guard.end();
const {getPool,createVideoTaskWithReservation}=await import("../../src/lib/db");
const email=process.env.VIDEO_FIXTURE_ACTION_ACTOR||"",sourceId=process.env.VIDEO_FIXTURE_ACTION_SOURCE||"";
try{
  if(process.argv.includes("--set-media-price")||process.argv.includes("--set-text-price")||process.argv.includes("--set-audio-price")){
    const audioFeature=process.env.VIDEO_FIXTURE_ACTION_FEATURE;if(process.argv.includes("--set-audio-price")&&audioFeature!=="audio.speech"&&audioFeature!=="audio.transcribe")throw new Error("Invalid audio fixture feature");
    const feature=process.argv.includes("--set-audio-price")?audioFeature as "audio.speech"|"audio.transcribe":process.argv.includes("--set-text-price")?"canvas.text-generate":"video.process";
    const credits=Number(process.env.VIDEO_FIXTURE_ACTION_CREDITS);if(!Number.isSafeInteger(credits)||credits<0||credits>100)throw new Error("Invalid fixture media price");
    const {getBillingRuntime}=await import("../../src/lib/billing/server"),runtime=await getBillingRuntime(),current=await runtime.config.current(),config=structuredClone(current.config);
    config.features[feature].enabled=true;
    config.features[feature].pricing={mode:"fixed",credits};
    const result=await runtime.config.publish({id:randomUUID(),expectedVersion:current.version,config,actor:"isolated-audio-fixture",reason:"Native audio reservation and settlement matrix"});
    process.stdout.write(JSON.stringify({version:result.version,credits,tariff:result.config.features[feature]}));
  }else if(process.argv.includes("--audio-cost-evidence")){
    if(!/^[0-9a-f-]{36}$/.test(sourceId))throw new Error("Invalid audio fixture operation");
    const {readTaskCostEvidence}=await import("../../src/lib/billing/task-cost-evidence"),id=`tool-${sourceId}`;
    const {readAudioIntent,readAudioCostSources}=await import("../../src/lib/audio/operation-repository"),intent=await readAudioIntent(email,sourceId);if(!intent)throw new Error("Owned audio fixture intent required");
    process.stdout.write(JSON.stringify({...((await readTaskCostEvidence(email,[{id,ledgerId:`led-${id}`}]))[0]),linkedSources:await readAudioCostSources(email,intent.request.target.projectKey,[intent.request.target.timelineId])}));
  }else if(process.argv.includes("--prepare-queued")||process.argv.includes("--node-reservation-failure")){
    const row=(await getPool().query("SELECT * FROM app_video_tasks WHERE email=$1 AND id=$2",[email,sourceId])).rows[0];
    if(!row||row.parameters.version!==2)throw new Error("Owned versioned fixture task required");
    const id=`vid-${randomUUID()}`,idempotencyKey=randomUUID(),request={...row.parameters.request,idempotencyKey,canvasNodeId:undefined,nodeRevision:undefined};
    const failNode=process.argv.includes("--node-reservation-failure"),{associateVideoTaskTx}=await import("../../src/lib/canvas/video-node-repository");
    try{const task=await createVideoTaskWithReservation({id,email,model:row.model,prompt:row.prompt,size:row.size,seconds:row.seconds,cost:Number(row.cost),billingQuote:row.billing_quote||undefined,
      requestBody:"fixture queued integration intent",providerId:row.provider_id,source:"workbench",parameters:{...row.parameters,request,nodeId:undefined,nodeRevision:undefined,submissionState:"prepared",creationInputDigest:id},
      videoReferences:row.video_references,capabilitySnapshot:row.capability_snapshot,idempotencyKey,providerSnapshot:row.provider_snapshot,
      ...(failNode?{onReserved:async(client,task)=>associateVideoTaskTx(client,email,row.parameters.nodeId,row.parameters.nodeRevision,task.id)}:{})});
    if(failNode)throw new Error("Expected stale node association failure");
    process.stdout.write(JSON.stringify({taskId:task.task.id}));
    }catch(error){if(!failNode||(error as {code?:string}).code!=="VIDEO_NODE_REVISION_CONFLICT")throw error;process.stdout.write(JSON.stringify({rolledBack:true,attemptedTaskId:id}));}
  }else throw new Error("Unknown fixture action");
}finally{await getPool().end();}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
