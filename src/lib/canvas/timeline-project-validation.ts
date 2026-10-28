import "server-only";
import type {PoolClient} from "pg";
import {canonicalConfig} from "../model-config/repository";
import {ModelConfigError} from "../model-config/types";
import {planTimeline,type TimelineProject} from "../timeline/project";
import {readMediaJobEvidence} from "../video/media-jobs";
import {findTimelineRenderIntent} from "./timeline-node-repository";
import {requireTimelineMaterials} from "./timeline-materials";
import {timelineArtworkIds,type TimelineAdopted,type TimelineRender} from "./timeline-node-schema";

const conflict=()=>new ModelConfigError("TIMELINE_RESULT_CONFLICT","多轨结果与已受理工程或素材不一致",409);
export async function validateTimelineProject(actor:string,project:TimelineProject,tx?:PoolClient){
  const ids=timelineArtworkIds(project),materials=await requireTimelineMaterials(actor,ids,tx);
  if(ids.length)try{planTimeline(project,materials.map(({artworkId,kind,durationSeconds,hasAudio})=>({artworkId,kind,durationSeconds,hasAudio})));}catch(error){throw new ModelConfigError("TIMELINE_PROJECT_INVALID",(error as Error).message,422);}
  return materials;
}
export function assertTimelineJobRecipe(render:TimelineRender,job:Awaited<ReturnType<typeof readMediaJobEvidence>>){
  const recipe=(request:typeof job.request)=>({action:request.action,args:request.args,outputs:request.outputs,auxiliaryFiles:request.auxiliaryFiles,auxiliaryOutputs:request.auxiliaryOutputs});
  if(job.operationId!==render.operationId||canonicalConfig(recipe(job.request))!==canonicalConfig(recipe(render.request))||job.inputs.length!==render.request.inputs.length)throw conflict();
  for(const [index,id] of render.request.inputs.entries()){
    const source=render.sources.find(source=>source.artworkId===id),input=job.inputs[index];if(!source||source.key!==input.key||source.sha256!==input.sha256)throw conflict();
  }
}
/** Copies may remap artwork identities, not the frozen project or bytes. Original
 * accepted inputs may since be deleted: the immutable intent/job is authoritative. */
export async function validateTimelineAdoption(actor:string,adopted:TimelineAdopted,tx?:PoolClient){
  const job=await readMediaJobEvidence(actor,adopted.jobId,true,tx),intent=await findTimelineRenderIntent(actor,job.operationId,tx);if(!intent?.render)throw conflict();assertTimelineJobRecipe(intent.render,job);
  const rewritten=structuredClone(adopted.project),originalClips=new Map(intent.render.project.tracks.flatMap(track=>track.clips.map(clip=>[clip.id,clip] as const))),remaps:Array<{from:string;to:string}>=[];
  for(const clip of rewritten.tracks.flatMap(track=>track.clips)){
    const original=originalClips.get(clip.id);if(!original)throw conflict();if(clip.artworkId!==original.artworkId)remaps.push({from:original.artworkId,to:clip.artworkId});clip.artworkId=original.artworkId;
    // Canvas provenance is not an execution binding. Copies can move this edge
    // while the recipe still has to match every actual source byte and edit.
    if(original.canvasSourceId)clip.canvasSourceId=original.canvasSourceId;else delete clip.canvasSourceId;
  }
  if(canonicalConfig(rewritten)!==canonicalConfig(intent.render.project))throw conflict();
  if(remaps.length){const materials=await requireTimelineMaterials(actor,remaps.map(remap=>remap.to),tx);for(const remap of remaps){const current=materials.find(media=>media.artworkId===remap.to),frozen=intent.render.sources.find(media=>media.artworkId===remap.from);if(!current||!frozen||current.key!==frozen.key||current.sha256!==frozen.sha256)throw conflict();}}
  const output=(await requireTimelineMaterials(actor,[adopted.artworkId],tx))[0];if(output.kind!=="video"||!job.outputs.some(item=>!item.fragment&&item.storageKey===output.key&&item.sha256===output.sha256&&item.mimeType.startsWith("video/")))throw conflict();
  return output;
}
