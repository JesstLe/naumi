import { z } from "zod";
import {videoParameterContractSchema} from './parameter-contract';

export const VIDEO_MODES=["text","single_image","frames_required","first_optional","last_optional","reference","video_edit","extend","motion_control","lip_sync"] as const;
export type VideoMode=typeof VIDEO_MODES[number];
const tri=z.boolean().nullable().optional();
const number=(max:number)=>z.number().int().min(0).max(max).nullable().optional();
const stringValue=z.string().min(1).max(100);
const duration=z.union([z.literal(-1),z.number().int().min(1).max(3600)]);
const ratio=z.string().regex(/^(?:[1-9]\d{0,2}:[1-9]\d{0,2}|adaptive)$/);
const specMap=z.array(z.strictObject({durations:z.array(duration).min(1).max(3601),resolutions:z.array(stringValue).min(1).max(100)})).max(100);
export const videoOptionSchema=z.strictObject({
  type:z.enum(["boolean","integer","number","string","enum"]),
  send:z.enum(["value","omit"]).optional(),
  minimum:z.number().finite().optional(),maximum:z.number().finite().optional(),
  values:z.array(z.union([z.string().max(200),z.number().finite(),z.boolean()])).max(100).optional(),
  defaultValue:z.union([z.string().max(1000),z.number().finite(),z.boolean(),z.null()]).optional(),
});
export const videoLimitsSchema=z.strictObject({
  images:number(128),videos:number(128),audios:number(128),
  imageMaxBytes:number(250*1024*1024),videoMaxBytes:number(250*1024*1024),audioMaxBytes:number(250*1024*1024),
  imageMaxDurationSeconds:number(3600),videoMaxDurationSeconds:number(3600),audioMaxDurationSeconds:number(3600),
  totalVideoDurationSeconds:number(86400),totalAudioDurationSeconds:number(86400),
});
export const videoDefinitionSchema=z.strictObject({
  parameterContract:videoParameterContractSchema.optional(),
  modes:z.array(z.enum(VIDEO_MODES)).max(VIDEO_MODES.length).refine(v=>new Set(v).size===v.length,"视频模式重复").nullable().optional(),
  durationResolutionMap:specMap.nullable().optional(),
  modeParameters:z.partialRecord(z.enum(VIDEO_MODES),z.strictObject({durationResolutionMap:specMap.optional(),aspectRatios:z.array(ratio).max(100).optional()})).nullable().optional(),
  resolutionAspectRatios:z.record(stringValue,z.array(ratio).max(100)).nullable().optional(),
  aspectRatios:z.array(ratio).max(100).nullable().optional(),audio:z.enum(["required","disabled","optional"]).nullable().optional(),
  limits:videoLimitsSchema.nullable().optional(),defaultDurationSeconds:duration.nullable().optional(),defaultResolution:stringValue.nullable().optional(),
  defaultAspectRatio:ratio.nullable().optional(),supportsAutoDuration:tri,requiresPrompt:tri,
  supportsFirstFrame:tri,supportsLastFrame:tri,supportsFrameAudio:tri,supportsReferenceFirstFrame:tri,supportsNegativePrompt:tri,supportsWatermark:tri,supportsMultiShot:tri,
  supportsElements:tri,supportsCamera:tri,supportsExactSize:tri,supportsCancellation:tri,
  maxPromptChars:number(65536),maxNegativePromptChars:number(16384),maxShots:number(100),maxElements:number(100),maxElementReferences:number(128),
  maxShotPromptChars:number(16384),minShotDurationSeconds:z.number().finite().min(0).max(3600).nullable().optional(),
  shotDurationStep:z.number().finite().positive().max(3600).nullable().optional(),
  providerOptions:z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/),videoOptionSchema).nullable().optional(),
});
export type VideoModelDefinition=z.infer<typeof videoDefinitionSchema>;
export type VideoOptionDefinition=z.infer<typeof videoOptionSchema>;
export type CapabilitySource="admin"|"vendor"|"adapter"|"unknown";
export type ResolvedVideoCapability=VideoModelDefinition&{sources:Record<string,CapabilitySource>};
export const VIDEO_WIRE_PROFILES=["openai-videos","grok2api","cogvideox3","agnes","agnes-v25","ark","kie-generic","kie-kling","kie-kling-v26","kie-kling-omni-text","kie-kling-omni-image","kie-kling-omni-reference","kie-kling-omni-transform","kie-motion-control",
  "apimart-generic","apimart-kling","apimart-kling-v26","apimart-kling-omni","apimart-motion-control","gemini","minimax","metaso","autodl","runninghub","comfyui",
  "tokendance-seedance","tokendance-kling-text","tokendance-kling-image","tokendance-kling-motion","tokendance-kling-omni","tokendance-wan3","tokendance-happyhorse","tokendance-minimax",
  "tfrouter-generic","tfrouter-kling","tfrouter-kling-omni","tfrouter-grok","compshare-h3","compshare-hailuo","compshare-vidu","compshare-vidu-extend","compshare-vidu-lip-sync","compshare-wan","compshare-seedance",
  "apimart-apib-seedance","apimart-apib-kling","apimart-apib-wan","apimart-apib-h3","geek-kling","geek-wan3","apib-video-v2","geek-video-v2","geek-h3-v2","apib-video-v3","geek-wan3-v3","geek-h3-v3","apib-storyboard-v4"] as const;
export const videoWireProfileSchema=z.enum(VIDEO_WIRE_PROFILES);
export type VideoWireProfile=typeof VIDEO_WIRE_PROFILES[number];
export const VIDEO_PROTOCOLS=["openai-videos","ark","kie","apimart","gemini","minimax","metaso","tokendance","tfrouter","compshare","comfyui","autodl","runninghub"] as const;
export function videoProfileProtocol(profile:VideoWireProfile):typeof VIDEO_PROTOCOLS[number]{
  if(profile==="apib-video-v2"||profile==="apib-video-v3"||profile==="apib-storyboard-v4")return "apimart";
  if(profile==="geek-h3-v2"||profile==="geek-h3-v3")return "minimax";
  if(profile.startsWith("geek-"))return "openai-videos";
  if(profile.startsWith("kie-"))return "kie";if(profile.startsWith("apimart-"))return "apimart";
  if(profile.startsWith("tokendance-"))return "tokendance";if(profile.startsWith("tfrouter-"))return "tfrouter";
  if(profile.startsWith("compshare-"))return "compshare";
  if(["grok2api","cogvideox3","agnes","agnes-v25"].includes(profile))return "openai-videos";
  return profile as typeof VIDEO_PROTOCOLS[number];
}
