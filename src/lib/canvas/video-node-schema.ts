import {z} from "zod";
import {videoInputSchema} from "../video/contract";
import {orderedInputSchema} from "../video/references";
import {videoWorkflowManifestSchema} from "../video/workflow-schema";
import {videoCameraSchema} from "../video/camera";
export const videoNodeIdSchema=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
export const videoProjectKeySchema=z.string().regex(/^(?:tree|batch):[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
export const videoNodeConfigSchema=videoInputSchema.omit({orderedInputs:true}).partial().extend({
  modelId:videoNodeIdSchema.optional(),providerId:videoNodeIdSchema.optional(),comfyWorkflowId:videoNodeIdSchema.optional(),workflowTaskId:videoNodeIdSchema.optional(),
  comfyInputs:videoWorkflowManifestSchema.shape.inputs.optional(),
  workflowManifest:videoWorkflowManifestSchema.optional(),
  prompt:z.string().max(16384).optional(),camera:videoCameraSchema.optional()});
const position=z.number().finite().min(-1e8).max(1e8),size=z.number().finite().min(64).max(32768);
export const videoNodeWriteSchema=z.strictObject({id:videoNodeIdSchema,projectKey:videoProjectKeySchema.optional(),expectedRevision:z.number().int().nonnegative(),operationId:z.uuid(),
  title:z.string().trim().max(200).optional(),x:position.optional(),y:position.optional(),width:size.optional(),height:size.optional(),
  config:videoNodeConfigSchema.optional(),inputs:z.array(orderedInputSchema).max(256).optional(),deleted:z.boolean().optional()});
export type VideoNodeWrite=z.infer<typeof videoNodeWriteSchema>;
export type CanvasVideoNode={id:string;projectKey:string;revision:number;title:string;x:number;y:number;width:number;height:number;config:z.infer<typeof videoNodeConfigSchema>;
  inputs:z.infer<typeof orderedInputSchema>[];lastTaskId:string|null;lastResultId:string|null;displayResultId?:string|null;deletedAt:string|null;createdAt:string;updatedAt:string};
