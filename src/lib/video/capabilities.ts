import type { VideoTaskSource } from "@/lib/video/types";
import { configuredVideoProviders } from "@/lib/video/providers/config";

// ---------------------------------------------------------------------------
// 模型能力声明(§4.3):UI 表单、服务端校验、Agent 参数建议共用同一份声明。
// 已知模型按实测录入(heyroute 实测:seedance 只出 15 秒;grok/minimax 4 秒可跑);
// 未收录模型走 fallbackCapability 通用兜底(允许 4-12 秒、单图参考)。
// 服务端创建时必须用这里的数据二次校验,不信任前端控件。
// ---------------------------------------------------------------------------

export type VideoModelCapability = {
  providerId: string;
  modelId: string;
  label: string;
  modes: Array<"text" | "image" | "frames" | "reference" | "video_edit">;
  durations: number[];
  aspectRatios: string[];
  resolutions: string[];
  maxReferenceImages: number;
  supportsFirstFrame: boolean;
  supportsLastFrame: boolean;
  supportsNegativePrompt: boolean;
  supportsGenerateAudio?: boolean;
  supportsWatermark?: boolean;
  supportsMultiShot?: boolean;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  providerOptionKeys?: string[];
  defaultDuration?: number;
  note?: string;
};

const LANDSCAPE_PORTRAIT = ["1280x720", "720x1280", "1024x1024"];

const CATALOG: VideoModelCapability[] = [
  {
    providerId: "openai-videos",
    modelId: "grok-imagine-video",
    label: "Grok Imagine(快,4 秒起)",
    modes: ["text", "image"],
    durations: [4, 8, 12],
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: LANDSCAPE_PORTRAIT,
    maxReferenceImages: 1,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    supportsNegativePrompt: false,
    defaultDuration: 4,
    note: "实测出片最快(约 30-60 秒)",
  },
  {
    providerId: "openai-videos",
    modelId: "minimax-h3-original-768p",
    label: "MiniMax H3 768p",
    modes: ["text", "image"],
    durations: [4, 8, 12],
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["768p"],
    maxReferenceImages: 1,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    supportsNegativePrompt: false,
    defaultDuration: 4,
    note: "队列较慢,峰值约数分钟",
  },
  {
    providerId: "openai-videos",
    modelId: "minimax-h3-original-1080p",
    label: "MiniMax H3 1080p",
    modes: ["text", "image"],
    durations: [4, 8, 12],
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["1080p"],
    maxReferenceImages: 1,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    supportsNegativePrompt: false,
    defaultDuration: 4,
  },
  {
    providerId: "openai-videos",
    modelId: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast(15 秒)",
    modes: ["text", "image"],
    durations: [15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: LANDSCAPE_PORTRAIT,
    maxReferenceImages: 1,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    supportsNegativePrompt: false,
    defaultDuration: 15,
    note: "仅 15 秒档,成本高",
  },
  {
    providerId: "openai-videos",
    modelId: "seedance-2.0",
    label: "Seedance 2.0(15 秒)",
    modes: ["text", "image"],
    durations: [15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: LANDSCAPE_PORTRAIT,
    maxReferenceImages: 1,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    supportsNegativePrompt: false,
    defaultDuration: 15,
    note: "仅 15 秒档,成本高",
  },
];

/** 兜底声明:目录未收录的模型按通用能力对待(4-12 秒、单图参考)。 */
export function fallbackCapability(providerId: string, modelId: string): VideoModelCapability {
  const rich = providerId !== "openai-videos";
  return {
    providerId,
    modelId,
    label: modelId,
    modes: rich ? ["text", "image", "frames", "reference", "video_edit"] : ["text", "image"],
    durations: [4, 8, 12],
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: LANDSCAPE_PORTRAIT,
    maxReferenceImages: rich ? 9 : 1,
    maxReferenceVideos: rich ? 3 : 0,
    maxReferenceAudios: rich ? 3 : 0,
    supportsFirstFrame: true,
    supportsLastFrame: rich,
    supportsNegativePrompt: rich,
    supportsGenerateAudio: rich,
    supportsWatermark: rich,
    supportsMultiShot: rich,
    providerOptionKeys: ["cameraFixed", "seed", "style", "mode", "multiShot", "workflowId", "nodeOverrides"],
  };
}

export function getVideoModelCapability(
  providerId: string,
  modelId: string
): VideoModelCapability {
  return (
    CATALOG.find((c) => c.providerId === providerId && c.modelId === modelId) ??
    fallbackCapability(providerId, modelId)
  );
}

/** 服务端硬校验:时长/画幅必须在能力声明内,非法组合直接拒绝。 */
export function validateAgainstCapability(
  cap: VideoModelCapability,
  input: {
    durationSeconds: number;
    size?: string;
    referenceImageCount: number;
    referenceVideoCount?: number;
    referenceAudioCount?: number;
    hasFirstFrame?: boolean;
    hasLastFrame?: boolean;
    negativePrompt?: string;
    generateAudio?: boolean;
    watermark?: boolean;
    providerOptions?: Record<string, unknown>;
    mode: "text" | "image" | "frames" | "reference" | "video_edit";
  }
): { ok: true } | { ok: false; error: string } {
  if (!cap.durations.includes(input.durationSeconds)) {
    return {
      ok: false,
      error: `模型 ${cap.modelId} 支持的时长:${cap.durations.join("/")} 秒,收到 ${input.durationSeconds} 秒`,
    };
  }
  if (input.mode === "image") {
    if (!cap.modes.includes("image")) {
      return { ok: false, error: `模型 ${cap.modelId} 不支持图生视频` };
    }
    if (input.referenceImageCount > cap.maxReferenceImages) {
      return {
        ok: false,
        error: `模型 ${cap.modelId} 最多 ${cap.maxReferenceImages} 张参考图`,
      };
    }
  }
  if (!cap.modes.includes(input.mode)) {
    return { ok: false, error: `模型 ${cap.modelId} 不支持 ${input.mode} 模式` };
  }
  if (input.hasLastFrame && !cap.supportsLastFrame) {
    return { ok: false, error: `模型 ${cap.modelId} 不支持尾帧` };
  }
  if (input.hasFirstFrame && !cap.supportsFirstFrame) {
    return { ok: false, error: `模型 ${cap.modelId} 不支持首帧` };
  }
  if ((input.referenceVideoCount || 0) > (cap.maxReferenceVideos || 0)) {
    return { ok: false, error: `模型 ${cap.modelId} 最多 ${cap.maxReferenceVideos || 0} 个视频参考` };
  }
  if ((input.referenceAudioCount || 0) > (cap.maxReferenceAudios || 0)) {
    return { ok: false, error: `模型 ${cap.modelId} 最多 ${cap.maxReferenceAudios || 0} 个音频参考` };
  }
  if (input.negativePrompt && !cap.supportsNegativePrompt) {
    return { ok: false, error: `模型 ${cap.modelId} 不支持负面提示词` };
  }
  if (input.generateAudio && !cap.supportsGenerateAudio) {
    return { ok: false, error: `模型 ${cap.modelId} 不支持同步生成音频` };
  }
  if (input.watermark && !cap.supportsWatermark) {
    return { ok: false, error: `模型 ${cap.modelId} 不支持水印参数` };
  }
  const allowedOptions = new Set(cap.providerOptionKeys || []);
  const unknownOption = Object.keys(input.providerOptions || {}).find((key) => !allowedOptions.has(key));
  if (unknownOption) return { ok: false, error: `模型 ${cap.modelId} 不支持参数 ${unknownOption}` };
  if (input.size && cap.resolutions.length && !cap.resolutions.includes(input.size)) {
    return {
      ok: false,
      error: `模型 ${cap.modelId} 支持的尺寸:${cap.resolutions.join(" / ")},收到 ${input.size}`,
    };
  }
  return { ok: true };
}

export type VideoCatalogEntry = VideoModelCapability & { isDefault: boolean };

/** 能力目录(/api/video/catalog 数据源):env 配置的默认模型标 isDefault。 */
export function videoCatalog(defaultModelId: string): VideoCatalogEntry[] {
  const seen = new Map<string, VideoCatalogEntry>();
  for (const cap of CATALOG) {
    seen.set(cap.modelId, { ...cap, isDefault: cap.modelId === defaultModelId });
  }
  if (defaultModelId && !seen.has(defaultModelId)) {
    const fb = fallbackCapability("openai-videos", defaultModelId);
    seen.set(defaultModelId, { ...fb, isDefault: true });
  }
  return Array.from(seen.values());
}

/** 根据运行时供应商配置补齐目录；密钥只在服务端读取，返回值不含敏感字段。 */
export function configuredVideoCatalog(): VideoCatalogEntry[] {
  const entries: VideoCatalogEntry[] = [];
  for (const provider of configuredVideoProviders()) {
    const models = videoCatalog(provider.defaultModel)
      .filter((item) => item.providerId === provider.id);
    if (models.length) {
      entries.push(...models.map((item) => ({ ...item, isDefault: item.modelId === provider.defaultModel })));
      continue;
    }
    for (const modelId of provider.models) {
      const fallback = fallbackCapability(provider.id, modelId);
      entries.push({ ...fallback, label: `${provider.label} · ${modelId}`, isDefault: modelId === provider.defaultModel });
    }
  }
  return entries;
}

export type { VideoTaskSource };
