import type {CanvasNativeRecords} from "./native-node-records";
import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {CanvasAudioNode} from "./audio-node-schema";
import type {CanvasSceneNode} from "./scene-node-schema";
import type {CanvasCharacterNode} from "./character-node-schema";
import {z} from "zod";
import { videoNodeIdSchema, type CanvasVideoNode } from "./video-node-schema";
import { videoProjectKeySchema } from "./project-key";
import type {CanvasDirectorNode} from "./director-node-schema";
import type {CanvasTextNode} from "./text-document-model";

const coordinate=z.number().finite().min(-1e7).max(1e7);
export const nodeCopyRequest=z.strictObject({
  operationId:z.uuid(),ids:z.array(videoNodeIdSchema).min(1).max(200).refine(ids=>new Set(ids).size===ids.length,"节点身份重复"),
  projectKey:videoProjectKeySchema.optional(),
  detached:z.boolean().optional(),
  // Single artwork duplicate/history insertion keeps its independent placement
  // and no input edges. Omitted: existing mixed-selection copy behavior.
  singleArtwork:z.strictObject({x:coordinate,y:coordinate,title:z.string().max(80).optional()}).optional(),
}).refine(input=>!input.singleArtwork||input.ids.length===1,"单图复制需要一个来源")
  .refine(input=>!input.detached||input.ids.length===1,"独立复制仅支持单个图片节点");
export type CanvasNodeCopyInput=z.infer<typeof nodeCopyRequest>;
export type CanvasNodeCopyResult={nativeNodes?:CanvasNativeRecords;artworkIds:string[];textNodes:CanvasTextNode[];nodes:CanvasVideoNode[];directorNodes?:CanvasDirectorNode[];characterNodes?:CanvasCharacterNode[];sceneNodes?:CanvasSceneNode[];audioNodes?:CanvasAudioNode[];timelineNodes?:CanvasTimelineNode[];idMap:Record<string,string>;projectKey:string};
