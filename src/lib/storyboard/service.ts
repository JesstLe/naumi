import "server-only";
import {ensureContinuitySources,validateContinuityBindings} from "./continuity-service";
import {assertCreationInputsTx} from "../saas/creation-writer";
import {ensureCreationSchema} from "../saas/creation-schema";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {authorizeCanvasProject} from "../canvas/project-access";
import {getVideoNode} from "../canvas/video-node-service";
import {getCanvasTextNode} from "../canvas/text-node-repository";
import {canvasTextContent} from "../canvas/text-content";
import {assertCreationProjectInput,bindActualCreationProject} from "../saas/creation-access";
import {ModelConfigError} from "../model-config/types";
import {canonicalConfig} from "../model-config/snapshot-value";
import {storyboardWriteSchema} from "./plan";
import {assertReviewBounds} from "./review";
import {requireTimelineMaterials} from "../canvas/timeline-materials";
import {ensureStoryboardSchema,readStoryboardPlan,readStoryboardPlans,readStoryboardOperation,saveStoryboardTx} from "./repository";
import {assertStoryboardTake} from './take-access';
export {assertStoryboardTake} from './take-access';

export async function listStoryboardPlans(actor:string,projectKey:string){
  await authorizeCanvasProject(actor,projectKey);await assertCreationProjectInput(actor,projectKey,undefined,true);
  return readStoryboardPlans(actor,projectKey);
}
export async function getStoryboardOperation(actor:string,projectKey:string,operationId:string){
  await authorizeCanvasProject(actor,projectKey);await assertCreationProjectInput(actor,projectKey,undefined,true);
  const plan=await readStoryboardOperation(actor.toLowerCase(),operationId);
  if(!plan||plan.projectKey!==projectKey)throw new ModelConfigError("STORYBOARD_OPERATION_UNAVAILABLE","此项目中没有该操作回执",404);
  return plan;
}
export async function saveStoryboardPlan(actorRaw:string,raw:unknown){
  const actor=actorRaw.toLowerCase(),input=storyboardWriteSchema.parse(raw);
  await ensureStoryboardSchema();await ensureCreationSchema();await authorizeCanvasProject(actor,input.projectKey);
  const previous=await readStoryboardPlan(actor,input.id);
  // A copied plan may deliberately retain an older, already validated source snapshot.
  // Trust only exact stored snapshots from this actor and project, never client claims.
  const copiedSources=previous?[]:(await readStoryboardPlans(actor,input.projectKey)).flatMap(plan=>plan.document.shots);
  const trustedBindings=copiedSources.flatMap(shot=>shot.continuity?.bindings||[]);
  if(input.document.shots.some(shot=>shot.continuity?.bindings.length))await ensureContinuitySources();
  const tx=await getPool().connect();try{
    await tx.query("BEGIN");
    await bindActualCreationProject(actor,input.projectKey,{tx});
    const plan=await saveStoryboardTx(tx,actor,input,async()=>{
      await assertCreationProjectInput(actor,input.projectKey,tx);
      for(const shot of input.document.shots){
        const node=await getVideoNode(actor,shot.nodeId,false,tx);
        if(!node||node.projectKey!==input.projectKey||node.deletedAt)throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE","方案镜头不存在或不属于当前项目",422);
        for(const source of [...(shot.source?[shot.source]:[]),...(shot.additionalSources||[])]){
          const old=previous?.document.shots.find(old=>old.nodeId===shot.nodeId);if([...(old?[old]:[]),...copiedSources].flatMap(shot=>[...(shot.source?[shot.source]:[]),...(shot.additionalSources||[])]).some(item=>canonicalConfig(item)===canonicalConfig(source)))continue;
          const original=await getCanvasTextNode(actor,source.nodeId,input.projectKey,tx),text=original?canvasTextContent(original):"";
          if(!original||original.status!=="completed"||createHash("sha256").update(text).digest("hex")!==source.sha256)throw new ModelConfigError("STORYBOARD_SOURCE_CHANGED","原稿不存在或已修改，请重新读取原稿后关联",409);
          for(const range of [...source.mapping.ranges,...source.mapping.dialogue])if(range.end>text.length||[range.start,range.end].some(i=>i>0&&i<text.length&&/[\uD800-\uDBFF]/.test(text[i-1])&&/[\uDC00-\uDFFF]/.test(text[i])))throw new ModelConfigError("STORYBOARD_SOURCE_INVALID","原文关联超出范围或截断字符",422);
        }
        await validateContinuityBindings(actor,input.projectKey,shot,previous?.document.shots.find(old=>old.nodeId===shot.nodeId),tx,trustedBindings);
        for(const take of shot.takes){
          const origin=await assertStoryboardTake(actor,input.projectKey,shot.nodeId,take,tx);
          for(const ref of take.assistedReviews||[]){
            if(ref.source.projectKey!==input.projectKey||ref.source.taskId!==take.taskId||ref.source.artworkId!==take.artworkId||await assertStoryboardTake(actor,input.projectKey,ref.source.nodeId,take,tx)!==origin)throw new ModelConfigError("STORYBOARD_REVIEW_EVIDENCE_INVALID","辅助检查不属于此候选",422);
            const {getAssistedReview}=await import("./assisted-review-service");await getAssistedReview(actor,ref.source,ref.operationId);
          }
          for(const ref of take.audioReviews||[]){
            if(ref.source.projectKey!==input.projectKey||ref.source.taskId!==take.taskId||ref.source.artworkId!==take.artworkId||await assertStoryboardTake(actor,input.projectKey,ref.source.nodeId,take,tx)!==origin)throw new ModelConfigError("AUDIO_REVIEW_EVIDENCE_INVALID","语音检查不属于此候选",422);
            const {requireSettledAudioReview}=await import("./audio-review-service");await requireSettledAudioReview(actor,ref.source,ref.operationId);
          }
          if(take.annotations?.length){
            const [material]=await requireTimelineMaterials(actor,[take.artworkId],tx);
            try{assertReviewBounds(take.annotations,material.durationSeconds);}catch(error){throw new ModelConfigError("STORYBOARD_REVIEW_RANGE_INVALID",(error as Error).message,422);}
          }
        }
      }
      if(input.document.audio?.length)await assertCreationInputsTx(tx,actor,input.document.audio.map(audio=>audio.artworkId));
    });
    await tx.query("COMMIT");return plan;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export async function storyboardAdoptedResult(actor:string,selection:{id:string;revision:number},projectKey:string,nodeId:string){
  const plan=await requireStoryboardPlan(actor,selection,projectKey);
  const shot=plan.document.shots.find(shot=>shot.nodeId===nodeId),take=shot?.takes.find(take=>take.artworkId===shot.adoptedArtworkId);
  if(!shot||!take)throw new ModelConfigError("STORYBOARD_TAKE_REQUIRED","请先为复用镜头采用一个候选版本",422);
  await assertStoryboardTake(actor,projectKey,nodeId,take);return take.artworkId;
}
export async function requireStoryboardPlan(actor:string,selection:{id:string;revision:number},projectKey:string){
  const plan=await readStoryboardPlan(actor,selection.id);
  if(!plan||plan.projectKey!==projectKey||plan.revision!==selection.revision)throw new ModelConfigError("STORYBOARD_REVISION_CONFLICT","方案已改变，请读取最新方案后制作",409);
  await authorizeCanvasProject(actor,projectKey);await assertCreationProjectInput(actor,projectKey,undefined,true);return plan;
}
