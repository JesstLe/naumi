import "server-only";
import {readCreationSourceReceipt} from "../saas/creation-source-receipt";
import {listArtworksByIds} from "../artworks/repository";
import {getVideoTaskByIdempotencyKey} from "../video/task-repository";
import type {ComfyRunResult} from "./run-contract";

/** Existing creation and video owners remain the recovery authority. */
export async function readComfyRunReceipt(actor:string,operationId:string):Promise<ComfyRunResult|null>{
  const receipt=await readCreationSourceReceipt(actor,"comfyui",operationId);
  if(!receipt){
    const task=await getVideoTaskByIdempotencyKey(actor,operationId);
    if(!task||task.parameters.billingException!=="comfyui-byoc-zero"||!await readCreationSourceReceipt(actor,"video",task.id))return null;
    return {state:"submitted",taskId:task.id};
  }
  const found=receipt.artworkIds.length?await listArtworksByIds(actor,receipt.artworkIds):[];
  const byId=new Map(found.map(art=>[art.id,art]));
  const artworks=receipt.artworkIds.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
  const images=artworks.filter(art=>!art.videoUrl&&art.category!=="video").map(art=>({id:art.id,url:art.image}));
  const videos=artworks.filter(art=>!!art.videoUrl).map(art=>({url:art.videoUrl!,mime:"video/mp4"}));
  if(!artworks.length&&(receipt.status==="failed"||receipt.status==="cancelled"))return {state:"failed",creationId:receipt.id,message:receipt.summary||"原工作流未生成产物"};
  // Source status is authoritative. A saved subset is not full completion.
  const state=receipt.status==="succeeded"&&artworks.length===receipt.artworkIds.length&&artworks.length?"completed":artworks.length?"partial":"needs_review";
  return {state,creationId:receipt.id,images,videos,videoArtworkId:artworks.find(art=>!!art.videoUrl)?.id};
}
