import "server-only";
import {listArtworksByIds} from "../db";
import {assertCreationObjectRefs} from "../saas/creation-writer";
import {storageKeyFromManagedUrl} from "../storage";
import {ModelConfigError} from "../model-config/types";
import {verifiedOwnedMedia} from "./media-inspection";
import type {SavedVideoResultAsset} from "./result-assets";

/** Reuse is an explicit selection of an owned completed result, never a claim
 * that an edited prompt has already been generated. Verify the actual bytes. */
export async function existingWorkflowResult(actor:string,artworkId:string):Promise<SavedVideoResultAsset>{
  await assertCreationObjectRefs(actor,[artworkId]);
  const art=(await listArtworksByIds(actor,[artworkId]))[0],url=art?.videoUrl||art?.image,key=url&&storageKeyFromManagedUrl(url);
  if(!art||art.status!=="completed"||!key)throw new ModelConfigError("WORKFLOW_OUTPUT_UNAVAILABLE","所选镜头结果不存在或尚未完成",422);
  const media=await verifiedOwnedMedia(actor,key,artworkId);
  if(!media.mimeType.startsWith("video/")||!media.probe.videoCodec)throw new ModelConfigError("WORKFLOW_OUTPUT_UNAVAILABLE","所选镜头没有可复用的视频",422);
  return {artworkId,storageKey:key,url:`/media/${key}`,mimeType:media.mimeType,sha256:media.sha256,bytes:media.bytes,probe:media.probe,name:"video.mp4",kind:"video",sourceIndex:0};
}
