import type { ModelProvider, UpstreamModel } from "../model-config/types";
import type { SupplierVideoDefinition } from "../supplier-models/video-access";
import { resolveVideoCapability } from "./contract";
import { documentedVideoCapability, type VideoModelCapability } from "./capabilities";
import type { VideoMode, VideoModelDefinition } from "./capability-schema";

function adapterDefinition(protocol:string,modelId:string):VideoModelDefinition|undefined{
  const legacy=documentedVideoCapability(protocol,modelId);if(!legacy)return undefined;
  const modes:VideoMode[]=legacy.modes.flatMap(mode=>mode==="image"?["single_image" as const]:mode==="frames"?["frames_required" as const,"last_optional" as const,"first_optional" as const]:[mode]);
  return {modes,durationResolutionMap:[{durations:legacy.durations,resolutions:legacy.resolutions}],aspectRatios:legacy.aspectRatios,
    defaultDurationSeconds:legacy.defaultDuration,audio:legacy.supportsGenerateAudio?"optional":"disabled",
    limits:{images:legacy.maxReferenceImages,videos:legacy.maxReferenceVideos??0,audios:legacy.maxReferenceAudios??0},
    supportsFirstFrame:legacy.supportsFirstFrame,supportsLastFrame:legacy.supportsLastFrame,supportsNegativePrompt:legacy.supportsNegativePrompt,
    supportsWatermark:legacy.supportsWatermark??false,supportsMultiShot:legacy.supportsMultiShot??false};
}
export function managedVideoDefinition(upstream:UpstreamModel,provider:ModelProvider,vendor:SupplierVideoDefinition|null){
  const limits=upstream.capabilities.video?.limits;
  const manual:VideoModelDefinition={...upstream.capabilities.video,limits:limits===null?null:{...limits,
    images:limits?.images!==undefined?limits.images:upstream.capabilities.maxReferenceImages}};
  const capability=resolveVideoCapability({manual,vendor:vendor?.definition,adapter:adapterDefinition(provider.protocol,upstream.model)});
  const manualProfile=upstream.parameterMap.videoProfile??provider.options?.videoProfile;
  capability.sources.videoProfile=manualProfile!==undefined?"admin":vendor?.profile?"vendor":"unknown";
  return {capability,profile:manualProfile??vendor?.profile,sourceRevision:vendor?.sourceRevision};
}
export function legacyVideoView(definition:ReturnType<typeof resolveVideoCapability>,identity:{providerId:string;modelId:string;label:string}):VideoModelCapability{
  const mappings:Record<VideoMode,VideoModelCapability["modes"][number]>={text:"text",single_image:"image",frames_required:"frames",first_optional:"frames",last_optional:"frames",reference:"reference",video_edit:"video_edit",extend:"video_edit",motion_control:"video_edit",lip_sync:"video_edit"};
  const modes=definition.modes||[];
  return {...identity,modes:Array.from(new Set(modes.map(mode=>mappings[mode]))),durations:Array.from(new Set((definition.durationResolutionMap||[]).flatMap(map=>map.durations))),
    resolutions:Array.from(new Set((definition.durationResolutionMap||[]).flatMap(map=>map.resolutions))),aspectRatios:definition.aspectRatios||[],
    maxReferenceImages:definition.limits?.images??0,maxReferenceVideos:definition.limits?.videos??0,maxReferenceAudios:definition.limits?.audios??0,
    supportsFirstFrame:definition.supportsFirstFrame??modes.some(mode=>["single_image","frames_required","first_optional","last_optional"].includes(mode)),
    supportsLastFrame:definition.supportsLastFrame??modes.some(mode=>["frames_required","first_optional","last_optional"].includes(mode)),
    supportsNegativePrompt:definition.supportsNegativePrompt===true,supportsGenerateAudio:definition.audio==="optional"||definition.audio==="required",
    supportsWatermark:definition.supportsWatermark===true,supportsMultiShot:definition.supportsMultiShot===true,
    providerOptionKeys:Object.keys(definition.providerOptions||{}),defaultDuration:definition.defaultDurationSeconds??undefined,definition};
}
