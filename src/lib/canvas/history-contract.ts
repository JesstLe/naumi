import {comfyNodeWriteSchema} from "./comfy-node-schema";
import {timelineNodeWriteSchema} from "./timeline-node-schema";
import {audioNodeWriteSchema} from "./audio-node-schema";
import {sceneNodeWriteSchema} from "./scene-node-schema";
import {characterNodeWriteSchema} from "./character-node-schema";
import {canvasArtworkFieldsSchema} from "./artwork-write";
import { z } from "zod";
import { nodeSettingsSchema } from "./node-settings";
import {directorNodeWriteSchema} from "./director-node-schema";
import { videoNodeWriteSchema } from "./video-node-schema";

const id = z.string().min(1).max(200);
const coordinate = z.number().finite().min(-1e7).max(1e7);
const textFields = z.object({
  title: z.string().max(80), prompt: z.string().max(4000).optional(), content: z.string().max(20000),
  sourceIds: z.array(id).max(200), targetIds: z.array(id).max(200), productIds: z.array(id).max(200),
  width: z.number().min(8).max(4096), height: z.number().min(8).max(100000),
});
const textNode = textFields.extend({ id, prompt: z.string().max(4000), projectKey: id, canvasX: coordinate, canvasY: coordinate,
  status: z.enum(["idle", "generating", "completed", "failed"]), createdAt: z.string().datetime(),
  error: z.string().max(2000).optional(),
});
export const canvasTextSnapshotSchema=textNode.extend({updatedAt:z.string().datetime().optional()});
export const videoHistoryFields=videoNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const sceneHistoryFields=sceneNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const characterHistoryFields=characterNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const directorHistoryFields=directorNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const audioHistoryFields=audioNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const timelineHistoryFields=timelineNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const comfyHistoryFields=comfyNodeWriteSchema.omit({id:true,projectKey:true,expectedRevision:true,operationId:true,deleted:true});
export const historyRequest = z.object({
  operationId: z.string().uuid(),
  operations: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("visibility"), id, visible: z.boolean(),expectedArtwork:canvasArtworkFieldsSchema.partial().optional() }),
    z.object({ type: z.literal("text-restore"), node: textNode,expectMissing:z.boolean().optional() }),
    z.object({ type: z.literal("text-delete"), id,expected:textNode.optional() }),
    z.object({type:z.literal("comfy-visibility"),id,visible:z.boolean()}),
    z.object({type:z.literal("comfy-patch"),id,expectedRevision:z.number().int().nonnegative(),fields:comfyHistoryFields}),
    z.object({ type: z.literal("video-visibility"), id, visible:z.boolean() }),
    z.object({ type: z.literal("video-patch"), id, expectedRevision:z.number().int().nonnegative(), fields:videoHistoryFields }),
    z.object({type:z.literal("scene-visibility"),id,visible:z.boolean()}),
    z.object({type:z.literal("scene-patch"),id,expectedRevision:z.number().int().nonnegative(),fields:sceneHistoryFields}),
    z.object({type:z.literal("character-visibility"),id,visible:z.boolean()}),
    z.object({type:z.literal("character-patch"),id,expectedRevision:z.number().int().nonnegative(),fields:characterHistoryFields}),
    z.object({type:z.literal("director-visibility"),id,visible:z.boolean()}),
    z.object({type:z.literal("director-patch"),id,expectedRevision:z.number().int().nonnegative(),fields:directorHistoryFields}),
    z.object({type:z.literal("audio-visibility"),id,visible:z.boolean()}),
    z.object({type:z.literal("timeline-visibility"),id,visible:z.boolean()}),
    z.object({type:z.literal("audio-patch"),id,expectedRevision:z.number().int().nonnegative(),fields:audioHistoryFields}),
    z.object({type:z.literal("timeline-patch"),id,expectedRevision:z.number().int().nonnegative(),fields:timelineHistoryFields}),
    z.object({ type: z.literal("video-result"),id,expectedRevision:z.number().int().nonnegative(),artworkId:id.nullable(),expectedArtworkId:id.nullable().optional() }),
    z.object({ type: z.literal("position"), id, text: z.boolean(), x: coordinate, y: coordinate,expected:z.object({x:coordinate,y:coordinate}).optional(),expectedArtwork:canvasArtworkFieldsSchema.partial().optional() }),
    z.object({ type: z.literal("group"), id, value: id.nullable(),expectedArtwork:canvasArtworkFieldsSchema.partial().optional() }),
    z.object({ type: z.literal("parent"), id, parentId: id, add: z.boolean() }),
    z.object({ type: z.literal("text-patch"), id, fields: textFields,expected:textFields.optional() }),
    z.object({ type: z.literal("rename"), id, title: z.string().max(80),expectedArtwork:canvasArtworkFieldsSchema.partial().optional() }),
    z.object({ type: z.literal("size"), id, x: coordinate, y: coordinate, width: z.number().min(80).max(4096), height: z.number().min(80).max(4096),expectedArtwork:canvasArtworkFieldsSchema.partial().optional() }),
    z.object({type:z.literal("art-dimensions"),id,width:z.number().min(80).max(4096),height:z.number().min(80).max(4096),expectedArtwork:canvasArtworkFieldsSchema.partial().optional()}),
    z.object({ type: z.literal("mark"), id, marked: z.boolean(),expectedArtwork:canvasArtworkFieldsSchema.partial().optional() }),
    z.object({ type: z.literal("node-settings"), id, text: z.boolean(), video:z.boolean().optional(), director:z.boolean().optional(), character:z.boolean().optional(), scene:z.boolean().optional(), audio:z.boolean().optional(),timeline:z.boolean().optional(),comfy:z.boolean().optional(), settings: nodeSettingsSchema }),
    z.object({type:z.literal("image-version"),id,versionId:id,expectedRevision:z.number().int().nonnegative(),expectedImage:z.string().min(1)}),
    z.object({ type: z.literal("workflow-asset"), id, assetOperationId: z.string().uuid(), filled: z.boolean() }),
  ])).min(1).max(400),
});

export type CanvasHistoryOperation = z.infer<typeof historyRequest>["operations"][number];
