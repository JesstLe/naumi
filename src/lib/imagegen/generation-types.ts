import type {ImagegenRequest,Intent} from "./types";
export type GeneratedImage = {
  id: string;
  url: string;
  gradient: string;
  prompt: string;
  ratio: string;
  createdAt: string;
  width?: number;
  height?: number;
  processingKind?: "base" | "resize" | "native" | "ai-upscale" | "imagegen";
  postprocessStatus?: "succeeded" | "failed-kept-base" | "pending";
  execution?: { quality: string; upstream: string; reason: string; platformFunded: boolean };
};

export type GenImage = { buf: Buffer; type: string };

export type GenParams = {

  // Server-stamped at acceptance. Legacy frozen jobs retain their original wire contract.
  ratioContractVersion?: 1 | 2;
	compiledPrompt?: string;
  prompt: string;
  // 落库用的「用户原始提示词」:仅用户自己输入的内容(图裂变/融图客户端拼了系统词进 prompt,
  // 这里单独传原始词),用于 addArtworks 落库,避免系统提示词被同行抄袭。模型调用仍用完整 prompt。
  userPrompt: string;
  category: string;
  ratio: string;
  resolution: string;
  style: string;
  qualityDefault?: string;
  billingVersion?:unknown;
  billingCredits?:unknown;
  quality: string; // 请求质量档:low/medium/high/xhigh/max/auto;通道不支持时提交前回退默认档,请求值只入审计
  count: number;
  transparent: boolean; // 透明底(抠图):gpt-image background:transparent PNG
  ratiogen: boolean; // 改比例:用节点自身提示词+原图参考重新构图，保留返回画面，不做裁切
  email: string;
  imagegen?:{request:ImagegenRequest;intent:Intent};
  mask?:GenImage;
  images: GenImage[];
  parentId: string; // 血缘:本次生成所基于的作品 id(图生图底图来源),无则空串
  parentIds: string[]; // 多输入:额外父节点 id(合并多张参考图时,除 primary 之外的)
  // 来自模板库「做同款」:模板 id/图/提示词,用于在血缘里建"模板原图"根节点
  templateId: string;
  templateImage: string;
  templatePrompt: string;
  origin: string; // "canvas"=在画布里产出(永远留画布);空=生图页/工具等普通产出
  entry?: string;
  projectGroupId: string; // 纯文字画布生成首张图片时沿用当前画布项目
  model: string;
  targetWidth: number;
  targetHeight: number;
};

export type GenerationBody = {jobId?:string;error?:string;code?:string;accepted?:boolean;operationId?:string;id?:string;images?:Array<{id:string}>};
export type GenerationResult = {status:number;body:GenerationBody};
