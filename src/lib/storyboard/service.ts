import "server-only";
import {ensureContinuitySources,validateContinuityBindings} from "./continuity-service";
import {assertCreationInputsTx} from "../saas/creation-writer";
import type {PoolClient} from "pg";
import {ensureCreationSchema} from "../saas/creation-schema";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {authorizeCanvasProject} from "../canvas/project-access";
import {getVideoNode} from "../canvas/video-node-service";
import {getCanvasTextNode} from "../canvas/text-node-repository";
import {canvasTextContent} from "../canvas/text-content";
import {assertCreationProjectInput,bindActualCreationProject} from "../saas/creation-access";
import {getVideoTask} from "../video/task-repository";
import {publicVideoTaskSnapshot} from "../video/task-snapshot";
import {ModelConfigError} from "../model-config/types";
import {canonicalConfig} from "../model-config/snapshot-value";
import {storyboardWriteSchema,type StoryboardTake} from "./plan";
import {ensureStoryboardSchema,readStoryboardPlan,readStoryboardPlans,saveStoryboardTx} from "./repository";

export async function listStoryboardPlans(actor:string,projectKey:string){
  await authorizeCanvasProject(actor,projectKey);await assertCreationProjectInput(actor,projectKey,undefined,true);
  return readStoryboardPlans(actor,projectKey);
}
/** A take is a completed video from this exact node/project, never an arbitrary owned asset. */
export async function assertStoryboardTake(actor:string,projectKey:string,nodeId:string,take:Pick<StoryboardTake,"taskId"|"artworkId">,tx?:Pick<PoolClient,"query">){
  const task=await getVideoTask(actor,take.taskId,tx),snapshot=task&&publicVideoTaskSnapshot(task);
  const outputs=task?.parameters.resultAssets as Array<{artworkId:string;kind?:string;mimeType?:string}>|undefined;
  if(!task||task.status!=="completed"||snapshot?.nodeId!==nodeId||snapshot.projectKey!==projectKey||
    !(outputs?.some(asset=>asset.artworkId===take.artworkId&&(asset.kind==="video"||asset.mimeType?.startsWith("video/")))||task.artworkId===take.artworkId&&!!task.videoUrl))
    throw new ModelConfigError("STORYBOARD_TAKE_UNAVAILABLE","候选结果不属于此镜头，或尚未完成",422);
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
        for(const take of shot.takes)await assertStoryboardTake(actor,input.projectKey,shot.nodeId,take,tx);
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
