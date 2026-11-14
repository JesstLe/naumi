import type { VideoTaskSource } from "@/lib/video/types";

// Historical documented metadata only. New catalog/acceptance use executable
// bindings. Unknown models have no fabricated modes, durations or media limits.

export type VideoModelCapability = {
  execution?:import('./ui-contract').VideoUiContract;
  definition?: import("./capability-schema").ResolvedVideoCapability;
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

/** Returns only the existing documented entries, never the permissive legacy fallback. */
export function documentedVideoCapability(protocol:string,modelId:string):VideoModelCapability|undefined{
  return CATALOG.find(cap=>cap.providerId===protocol&&cap.modelId===modelId);
}

export type {VideoTaskSource};
