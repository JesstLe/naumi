// ---------------------------------------------------------------------------
// 视频领域规范化类型(docs/VIDEO_SUBSYSTEM_REWRITE_PLAN.md §4.2)。
// 统一 UI / 应用层 / 适配器三方语言:适配器只面对规范化请求与快照,
// 不感知 HTTP 路由与积分语义。
// ---------------------------------------------------------------------------

import type { VideoMode } from "./capability-schema";
import type { OrderedInput } from "./references";
export type VideoTaskSource = "canvas" | "workbench" | "agent" | "workflow";

export type VideoTaskStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type VideoReferenceRole =
  | "first_frame"
  | "last_frame"
  | "reference"
  | "element"
  | "source_video"
  | "source_audio";

export type VideoReference = {
  id: string;
  kind: "image" | "video" | "audio";
  role: VideoReferenceRole;
  artworkId?: string;
  storageKey?: string;
  url?: string;
  mimeType?: string;
  bytes?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  /** Submission-only server materialization; never accepted from a client or persisted. */
  inlineData?:{mimeType:string;data:string};
  submissionName?:string;
};

export type VideoGenerationRequest = {
  source: VideoTaskSource;
  sourceId?: string;
  canvasNodeId?: string;
  projectKey?: string;
  nodeRevision?: number;
  mode?: VideoMode;
  orderedInputs?: OrderedInput[];
  shots?: Array<{ id?: string; textNodeId?: string; prompt: string; durationSeconds: number }>;
  elements?: Array<{ id?: string; name: string; description?: string; references: VideoReference[] }>;
  providerId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds: number;
  aspectRatio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  generateAudio?: boolean;
  watermark?: boolean;
  references: VideoReference[];
  providerOptions?: Record<string, unknown>;
  workflowManifest?:import("./workflow-schema").VideoWorkflowManifest;
  idempotencyKey: string;
};

export type VideoProviderCreateResult = {
  upstreamTaskId: string;
  upstreamVideoId?: string;
  status: VideoTaskStatus;
  progress?: number;
  rawResponse?: unknown;
};

export type VideoProviderPollResult = {
  status: VideoTaskStatus;
  progress: number;
  resultUrl?: string;
  resultAssets?:Array<{kind:"video"|"image"|"audio";url:string;mimeType?:string}>;
  inlineResult?:{mimeType:string;base64:string};
  outputFiles?:Array<{kind:"video"|"image"|"audio";filename:string;subfolder:string;type:string}>;
  errorCode?: string;
  errorMessage?: string;
  errorDetail?: unknown;
  rawResponse?: unknown;
};

/** 任务快照:适配器 poll/fetchResult 只拿只读快照,不接触数据库。 */
export type VideoTaskSnapshot = {
  id: string;
  email: string;
  providerId: string;
  modelId: string;
  upstreamTaskId: string;
  prompt: string;
  parameters: Record<string, unknown>;
  references: VideoReference[];
};

export type VideoProviderFetchResult = {
  bytes?: Uint8Array;
  url?: string;
  mimeType: string;
};

/** 适配器契约(§4.2):create 排队、poll 查状态、fetchResult 取产物、cancel 可选。 */
export interface VideoProviderAdapter {
  id: string;
  create(input: VideoGenerationRequest): Promise<VideoProviderCreateResult>;
  poll(task: VideoTaskSnapshot): Promise<VideoProviderPollResult>;
  fetchResult(
    task: VideoTaskSnapshot,
    result: VideoProviderPollResult
  ): Promise<VideoProviderFetchResult>;
  cancel?(task: VideoTaskSnapshot): Promise<void>;
}

/** 瞬时错误标记:poll 网络抖动不应触发退款终止,由调用方安排重试。 */
export class TransientPollError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "TransientPollError";
  }
}

export class PermanentVideoCreateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PermanentVideoCreateError";
  }
}
