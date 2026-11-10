import {z} from "zod";
import {videoProjectKeySchema} from "../canvas/project-key";
import {videoNodeIdSchema,type CanvasVideoNode} from "../canvas/video-node-schema";
import {storyboardDocumentSchema,type StoryboardDocument,type StoryboardPlan} from "./plan";

export const storyboardForkSchema=z.strictObject({
  projectKey:videoProjectKeySchema,planId:z.uuid(),revision:z.number().int().positive(),operationId:z.uuid(),title:z.string().trim().min(1).max(200),
  nodes:z.array(z.strictObject({id:videoNodeIdSchema,revision:z.number().int().nonnegative()})).min(1).max(100).refine(nodes=>new Set(nodes.map(node=>node.id)).size===nodes.length),
});
export type StoryboardFork=z.infer<typeof storyboardForkSchema>;
export type StoryboardForkResult={plan:StoryboardPlan;nodes:CanvasVideoNode[];idMap:Record<string,string>};

/** Editorial snapshots are deep copies; source text and media retain their actual identities. */
export function independentStoryboardDocument(document:StoryboardDocument,idMap:Record<string,string>,title:string):StoryboardDocument{
  if(document.shots.some(shot=>!idMap[shot.nodeId])||new Set(Object.values(idMap)).size!==document.shots.length)throw new Error("独立版本节点映射不完整");
  return storyboardDocumentSchema.parse({...structuredClone(document),title,shots:document.shots.map(shot=>({...structuredClone(shot),nodeId:idMap[shot.nodeId]}))});
}
