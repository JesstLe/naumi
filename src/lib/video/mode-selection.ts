import type { ResolvedVideoCapability, VideoMode } from "./capability-schema";
import { type VideoCatalogModel, type VideoNodeConfig } from "./client-settings";
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

/** Graph edits never infer execution modes or replace explicit media roles.
 * Optional metadata arguments remain accepted for older API-shaped consumers,
 * but do not participate in any decision. */
export function attachVideoInputs(config:VideoNodeConfig,inputs:readonly OrderedInput[],_cap?:ResolvedVideoCapability,_execution?:VideoUiContract){
 return {config:{...config},inputs:inputs.map(input=>({...input})),changed:false};
}
export function selectVideoIntent(config:VideoNodeConfig,inputs:readonly OrderedInput[],model:VideoCatalogModel,intent:VideoCreationIntent){
 return {config:{...config,modelId:model.modelId,providerId:model.providerId,intentPreference:intent,mode:undefined},inputs:inputs.map(input=>({...input})),changes:[]};
}
