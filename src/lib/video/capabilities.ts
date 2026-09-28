import type { VideoTaskSource } from "@/lib/video/types";

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
  return {
    providerId,
    modelId,
    label: modelId,
    modes: ["text", "image"],
    durations: [4, 8, 12],
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: LANDSCAPE_PORTRAIT,
    maxReferenceImages: 1,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    supportsNegativePrompt: false,
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
    mode: "text" | "image";
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

export type { VideoTaskSource };
