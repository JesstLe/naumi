import "server-only";
import type {ExecutionBundle} from "../model-config/context";
import type {VideoTaskRow} from "./task-types";
import {getBillingRuntime,meteringFor} from "../billing/runtime";
import {quote} from "../billing/quote";
import {listVideoTasks} from "./task-repository";
import {resolveOpenAiVideosConfig} from "./providers/openai-videos";

export type PublicVideoTaskView = Pick<
  VideoTaskRow,
  | "id"
  | "model"
  | "prompt"
  | "status"
  | "progress"
  | "cost"
  | "artworkId"
  | "videoUrl"
  | "error"
  | "providerId"
  | "source"
  | "sourceId"
  | "seconds"
  | "nextPollAt"
  | "createdAt"
  | "completedAt"
  | "cancellationRequestedAt"
  | "cancellationSentAt"
  | "supplierCancellationSupported"
  | "errorCode"
>&{updatedAt?:string;retryOf?:string|null;projectKey?:string|null;resultAssets:import("./result-assets").SavedVideoResultAsset[];resultMetadataWarnings:Array<{artworkId:string;code:string;expected:unknown;actual:unknown}>};

export function publicVideoTaskView(task: VideoTaskRow): PublicVideoTaskView {
  const managed = (task.parameters.modelExecutions as ExecutionBundle | undefined)?.video;
  return {
    id: task.id,
    model: managed?.publicModelId || task.model,
    prompt: task.prompt,
    status: task.status,
    progress: task.progress,
    cost: task.cost,
    artworkId: task.artworkId,
    videoUrl: task.videoUrl,
    error: task.error,
    providerId: managed ? "managed-video" : task.providerId,
    source: task.source,
    sourceId: task.sourceId,
    seconds: task.seconds,
    nextPollAt: task.nextPollAt,
    createdAt: task.createdAt,
    updatedAt:task.updatedAt,
    projectKey:typeof task.parameters.projectKey==="string"?task.parameters.projectKey:null,
    retryOf:typeof task.parameters.retryOf==="string"?task.parameters.retryOf:null,
    completedAt: task.completedAt,
    cancellationRequestedAt:task.cancellationRequestedAt,
    cancellationSentAt:task.cancellationSentAt,
    supplierCancellationSupported:task.supplierCancellationSupported,
    errorCode:task.errorCode,
    resultAssets:task.status==="completed"&&Array.isArray(task.parameters.resultAssets)?task.parameters.resultAssets as import("./result-assets").SavedVideoResultAsset[]:[],
    resultMetadataWarnings:task.status==="completed"&&Array.isArray(task.parameters.resultMetadataWarnings)?task.parameters.resultMetadataWarnings as Array<{artworkId:string;code:string;expected:unknown;actual:unknown}>:[],
  };
}

export function resolveVideoServiceConfig() {
  return resolveOpenAiVideosConfig();
}

export async function videoCostPublic(): Promise<number> {
  const snapshot=await(await getBillingRuntime()).config.current();
  return quote(snapshot,{feature:"video.generate",quantity:1,quality:"medium",resolution:"1K",metered:await meteringFor(snapshot),byok:false,paidFen:0,userGroup:"default"}).requestedCredits;
}

export async function listVideoTaskViews(
  email: string,
  opts: { status?: string; source?: string; sourceIds?: string[]; projectKey?: string; nodeId?: string; limit?: number;cursor?:{createdAt:string;id:string};pendingOnly?:boolean } = {}
): Promise<VideoTaskRow[]> {
  return listVideoTasks(email, opts);
}
