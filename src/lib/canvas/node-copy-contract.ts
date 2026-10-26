import {z} from "zod";
import { videoNodeIdSchema, type CanvasVideoNode } from "./video-node-schema";
import { videoProjectKeySchema } from "./project-key";
import type {CanvasTextNode} from "./text-document-model";

const coordinate=z.number().finite().min(-1e7).max(1e7);
export const nodeCopyRequest=z.strictObject({
  operationId:z.uuid(),ids:z.array(videoNodeIdSchema).min(1).max(200).refine(ids=>new Set(ids).size===ids.length,"节点身份重复"),
  projectKey:videoProjectKeySchema.optional(),
  // Single artwork duplicate/history insertion keeps its independent placement
  // and no input edges. Omitted: existing mixed-selection copy behavior.
  singleArtwork:z.strictObject({x:coordinate,y:coordinate,title:z.string().max(80).optional()}).optional(),
}).refine(input=>!input.singleArtwork||input.ids.length===1,"单图复制需要一个来源");
export type CanvasNodeCopyInput=z.infer<typeof nodeCopyRequest>;
export type CanvasNodeCopyResult={artworkIds:string[];textNodes:CanvasTextNode[];nodes:CanvasVideoNode[];idMap:Record<string,string>;projectKey:string};
