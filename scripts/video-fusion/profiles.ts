import type {VideoModelDefinition} from "../../src/lib/video/capability-schema";
import type { PublishedVideoExecution } from "../../src/lib/video/published-execution";
export const CAP_RICH:VideoModelDefinition={modes:["text","single_image","frames_required","first_optional","last_optional","reference","video_edit","extend","motion_control","lip_sync"],
  durationResolutionMap:[{durations:[4,8,12],resolutions:["720p","1080p"]}],aspectRatios:["16:9","9:16","1:1"],audio:"optional",
  limits:{images:30,videos:10,audios:10},maxShots:12,maxElements:10,maxElementReferences:30,maxPromptChars:16000,maxNegativePromptChars:8000,
  supportsMultiShot:true,supportsElements:true,supportsNegativePrompt:true,supportsWatermark:true,supportsCamera:true};

/** These native application cases share the same loopback Ark supplier. */
export const nativeApplicationVideo = {
  videoDefinition: { ...CAP_RICH, providerOptions: { seed: { type: "integer", minimum: 0, maximum: 9999 } } },
  videoExecution: {
    schemaVersion: 1, profileId: "native-video", profileVersion: 1,
    recipe: {
      layout: "ark", defaults: { ordinaryImage: "single_image", sourceVideo: "reference" },
      parameters: {
        durationSeconds: { type: "integer", default: 4, send: "semantic" },
        resolution: { type: "string", default: "720p", send: "semantic" },
        aspectRatio: { type: "string", default: "16:9", send: "semantic" },
        generateAudio: { type: "boolean", default: false, wireField: "generate_audio" },
        seed: { type: "integer", minimum: 0, maximum: 9999, wireField: "seed" },
      },
      operations: [{ intent: "text" }, { intent: "single_image" }, { intent: "reference" }],
    },
  },
} satisfies { videoDefinition: VideoModelDefinition; videoExecution: PublishedVideoExecution };
