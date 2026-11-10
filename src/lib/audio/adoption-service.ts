import "server-only";
import {getPool} from "@/platform/db/pool";
import {ModelConfigError} from "../model-config/types";
import {getTimelineNode,saveTimelineEditTx} from "../canvas/timeline-node-service";
import {readTimelineOperationResult} from "../canvas/timeline-node-repository";
import {validateTimelineProject} from "../canvas/timeline-project-validation";
import {requireTimelineMaterials} from "../canvas/timeline-materials";
import {assertCreationProjectInput} from "../saas/creation-access";
import {getAudioOperation,requireAudioIntent} from "./operation-service";
import {audioAdoptionSchema,applyDialogueAudioResult,type AudioAdoption} from "./dialogue-adoption";
import {readAudioAdoption,recordAudioAdoptionTx} from "./operation-repository";

export async function adoptDialogueAudioOperation(actorRaw:string,raw:unknown){
  const actor=actorRaw.toLowerCase(),input=audioAdoptionSchema.parse(raw);
  await assertCreationProjectInput(actor,input.projectKey,undefined,true);
  if(await readAudioAdoption(actor,input))return readSaved(actor,input);
  const {intent}=await requireAudioIntent(actor,input.projectKey,input.audioOperationId),result=await getAudioOperation(actor,input.projectKey,input.audioOperationId);
  if(result.state!=="settled"||!("receipt" in result))throw new ModelConfigError("AUDIO_ADOPTION_PENDING","声音结果或账务尚未确认，请先恢复原操作",409);
  const node=await getTimelineNode(actor,input.timelineId);
  if(!node||node.projectKey!==input.projectKey)throw new ModelConfigError("TIMELINE_NODE_UNAVAILABLE","多轨工程不存在",404);
  if(node.revision!==input.expectedRevision)throw new ModelConfigError("TIMELINE_REVISION_CONFLICT","多轨工程已更新，请读取最新版本",409);
  const material=result.receipt.kind==="speech"?(await requireTimelineMaterials(actor,[result.receipt.artworkId]))[0]:undefined;
  if(material&&material.sha256!==result.receipt.sha256)throw new ModelConfigError("AUDIO_RESULT_CHANGED","配音素材已改变",409);
  if(result.receipt.kind==="transcribe"&&input.timing==="source-segment"){
    const [source]=await requireTimelineMaterials(actor,[result.receipt.sourceArtworkId]);
    if(source.sha256!==result.receipt.sourceSha256)throw new ModelConfigError("AUDIO_SOURCE_CHANGED","转写对应的原音频已改变",409);
  }
  let timeline;
  try{timeline=applyDialogueAudioResult(node.timeline,input,intent.line,result.receipt,material,"transcription" in result?result.transcription:undefined);}catch(error){throw new ModelConfigError("AUDIO_ADOPTION_INVALID",(error as Error).message,422);}
  await validateTimelineProject(actor,timeline);
  const tx=await getPool().connect();try{
    await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    if(await readAudioAdoption(actor,input,tx)){const saved=await readSaved(actor,input,tx);await tx.query("COMMIT");return saved;}
    const saved=await saveTimelineEditTx(tx,actor,{id:input.timelineId,projectKey:input.projectKey,expectedRevision:input.expectedRevision,operationId:input.operationId,timeline});
    await recordAudioAdoptionTx(tx,actor,input);await tx.query("COMMIT");return saved;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
async function readSaved(actor:string,input:AudioAdoption,tx?:import("pg").PoolClient){
  const saved=await readTimelineOperationResult(actor,input.operationId,tx);
  if(!saved||saved.projectKey!==input.projectKey||saved.id!==input.timelineId)throw new ModelConfigError("AUDIO_ADOPTION_PENDING","原采用回执尚待核对",409);
  await assertCreationProjectInput(actor,saved.projectKey,tx,true);return saved;
}
