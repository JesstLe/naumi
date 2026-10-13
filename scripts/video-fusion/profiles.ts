import type {VideoModelDefinition} from "../../src/lib/video/capability-schema";
export const CAP_RICH:VideoModelDefinition={modes:["text","single_image","frames_required","first_optional","last_optional","reference","video_edit","extend","motion_control","lip_sync"],
  durationResolutionMap:[{durations:[4,8,12],resolutions:["720p","1080p"]}],aspectRatios:["16:9","9:16","1:1"],audio:"optional",
  limits:{images:30,videos:10,audios:10},maxShots:12,maxElements:10,maxElementReferences:30,maxPromptChars:16000,maxNegativePromptChars:8000,
  supportsMultiShot:true,supportsElements:true,supportsNegativePrompt:true,supportsWatermark:true,supportsCamera:true};
