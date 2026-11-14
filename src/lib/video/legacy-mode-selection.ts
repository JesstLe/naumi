/** Historical capability-era fixtures only. New product UI must not import this module. */
import type { ResolvedVideoCapability, VideoMode } from "./capability-schema";
import { catalogCapability, reconcileVideoSettings, videoModeRoles, type VideoCatalogModel, type VideoNodeConfig } from "./legacy-client-settings";
import type { OrderedInput } from "./references";
import type {VideoUiContract} from './ui-contract';

/** Reference labels are composer intentions, not new wire modes. */
export type VideoCreationIntent = Exclude<VideoMode, "reference"> | "image_reference" | "omni_reference";
export const VIDEO_CREATION_INTENTS: readonly VideoCreationIntent[] = ["text", "single_image", "frames_required", "image_reference", "omni_reference"];
export const VIDEO_CREATION_LABELS: Record<VideoCreationIntent, string> = {
  text: "文生视频", single_image: "图生视频", frames_required: "首尾帧",
  image_reference: "图片参考", omni_reference: "全能参考", first_optional: "首帧可选", last_optional: "尾帧可选",
  video_edit: "编辑视频", extend: "续写视频", motion_control: "运动控制", lip_sync: "口型同步",
};

export function videoIntentMode(intent: VideoCreationIntent): VideoMode {
  return intent === "image_reference" || intent === "omni_reference" ? "reference" : intent;
}

/** Only the published definition is authoritative. A label/model name is never a capability. */
export function supportsVideoIntent(cap: ResolvedVideoCapability, intent: VideoCreationIntent): boolean {
  if (!cap.modes?.includes(videoIntentMode(intent))) return false;
  if (intent === "image_reference") return (cap.limits?.images ?? 0) > 0;
  if (intent === "omni_reference") return (cap.limits?.videos ?? 0) > 0 || (cap.limits?.audios ?? 0) > 0;
  if (intent === "single_image") return (cap.limits?.images ?? 0) >= 1 && cap.supportsFirstFrame !== false;
  if (intent === "frames_required") return (cap.limits?.images ?? 0) >= 2 && cap.supportsFirstFrame !== false && cap.supportsLastFrame !== false;
  return true;
}

export function videoIntentModels(models: readonly VideoCatalogModel[], intent: VideoCreationIntent) {
  return models.filter(model => supportsVideoIntent(catalogCapability(model), intent));
}

export function availableVideoIntents(models: readonly VideoCatalogModel[]): VideoCreationIntent[] {
  const extra = models.flatMap(model => catalogCapability(model).modes ?? [])
    .filter((mode): mode is Exclude<VideoMode, "reference"> => mode !== "reference");
  return [...new Set([...VIDEO_CREATION_INTENTS, ...extra])];
}

export function currentVideoIntent(mode: VideoMode | undefined, cap: ResolvedVideoCapability, inputs: readonly OrderedInput[], preference?: "image_reference" | "omni_reference"): VideoCreationIntent {
  if (mode !== "reference") return mode ?? "text";
  if (inputs.some(input => input.kind === "video" || input.kind === "audio")) return "omni_reference";
  if (preference && supportsVideoIntent(cap, preference)) return preference;
  return supportsVideoIntent(cap, "omni_reference") ? "omni_reference" : "image_reference";
}

function mediaFits(inputs: readonly OrderedInput[], cap: ResolvedVideoCapability): boolean {
  return (["image", "video", "audio"] as const).every(kind => {
    const count = inputs.filter(input => input.kind === kind).length;
    const key = {image: "images", video: "videos", audio: "audios"} as const;
    return !count || count <= (cap.limits?.[key[kind]] ?? 0);
  });
}

/** Re-selecting reference must not erase a user's explicit roles. A transition
 * from frame mode preserves a first frame only when the published contract
 * explicitly supports it with a source video; generic images remain generic. */
function selectionRoles(inputs: readonly OrderedInput[], mode: VideoMode | undefined, previous: VideoMode | undefined, cap: ResolvedVideoCapability): OrderedInput[] {
  if (mode === "reference" && previous === "reference") return inputs.map(input => ({...input}));
  const roles = videoModeRoles(inputs, mode);
  if (mode === "reference" && cap.supportsReferenceFirstFrame === true && inputs.some(input => input.kind === "video")) {
    return roles.map((input, index) => inputs[index].role === "first_frame" ? {...input, role: "first_frame"} : input);
  }
  return roles;
}

/** An explicit attach can leave text mode without changing the user's model.
 * Multiple generic images do not imply first/last frame semantics. */
export function attachVideoInputs(config: VideoNodeConfig, inputs: readonly OrderedInput[], cap: ResolvedVideoCapability,execution?:VideoUiContract) {
  if(execution)return {config:{...config},inputs:inputs.map(input=>({...input})),changed:false};
  let mode = config.mode;
  const media = inputs.filter(input => input.kind !== "text");
  const singleFits = media.filter(input => input.kind === "image").length === 1 && !media.some(input => input.kind === "video")
    && (!media.some(input => input.kind === "audio") || cap.supportsFrameAudio === true);
  if ((!mode || mode === "text" || mode === "single_image" && !singleFits) && media.length && mediaFits(inputs, cap)) {
    if (media.length === 1 && media[0].kind === "image" && supportsVideoIntent(cap, "single_image")) mode = "single_image";
    else if (cap.modes?.includes("reference")) mode = "reference";
  }
  const changed = mode !== config.mode;
  const next = changed ? reconcileVideoSettings({...config, mode}, cap).config : {...config};
  return {config: next, inputs: selectionRoles(inputs, mode, config.mode, cap), changed};
}

/** Explicit model/mode selection keeps every source and the complete prompt.
 * Missing/extra inputs remain visible and are rejected by the existing validator. */
export function selectVideoIntent(config: VideoNodeConfig, inputs: readonly OrderedInput[], model: VideoCatalogModel, intent: VideoCreationIntent) {
  if(model.execution)return {config:{...config,modelId:model.modelId,providerId:model.providerId,intentPreference:intent},inputs:inputs.map(input=>({...input})),changes:[]};
  const cap = catalogCapability(model);
  if (!supportsVideoIntent(cap, intent)) throw new Error("此模型未开放所选视频模式");
  if (intent === "image_reference" && inputs.some(input => input.kind === "video" || input.kind === "audio")) {
    throw new Error("图片参考仅使用图片，请移除视频或音频，或选择全能参考");
  }
  const mode = videoIntentMode(intent);
  const result = reconcileVideoSettings({...config, modelId: model.modelId, providerId: model.providerId, workflowTaskId: undefined, mode, references: []}, cap);
  return {...result, inputs: selectionRoles(inputs, mode, config.mode, cap)};
}
