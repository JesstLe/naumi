import {z} from "zod";
import {reviewOriginSchema} from "../storyboard/review";
import {videoReferenceSchema,orderedInputSchema} from "./references";
import {videoPreferenceSchema} from './execution-contract';
import {VIDEO_MODES} from "./capability-schema";
import {videoInputSchema} from "./contract";
import {videoByocOverridesSchema} from "./byoc-settings";
import {videoCameraSchema} from "./camera";
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
const safePath=z.array(z.string().min(1).max(160).refine(value=>!["__proto__","constructor","prototype"].includes(value))).min(1).max(16);
export const videoWorkflowManifestSchema=z.strictObject({version:z.literal(1),kind:z.enum(["comfyui","autodl","runninghub"]),
  workflowId:z.string().min(1).max(160).optional(),template:z.record(z.string(),z.json()).optional(),
  inputs:z.array(z.strictObject({name:id,type:z.enum(["prompt","negativePrompt","duration","resolution","aspectRatio","generateAudio","watermark","image","video","audioReference","firstFrame","lastFrame","custom"]),
    path:safePath,index:z.number().int().min(0).max(127).optional(),required:z.boolean().optional(),defaultValue:z.json().optional()})).max(256),
  outputNodeIds:z.array(id).max(256).optional()});
export type VideoWorkflowManifest=z.infer<typeof videoWorkflowManifestSchema>;
// A workflow element may await an explicitly targeted dependency. The owning
// plan validator requires at least one static or declared future member; ordinary
// submit/node schemas continue to require concrete references immediately.
const workflowElement=videoInputSchema.shape.elements.unwrap().element.extend({references:z.array(videoReferenceSchema).max(128)});
export const workflowVideoRequestSchema=videoInputSchema.omit({durationSeconds:true,resolution:true,references:true}).extend({elements:z.array(workflowElement).max(100).optional(),intentPreference:videoPreferenceSchema.optional(),parameters:z.record(z.string().min(1).max(100),z.json()).optional(),prompt:z.string().max(16384),negativePrompt:z.string().max(8192).optional(),mode:z.enum(VIDEO_MODES).optional(),
  workflowManifest:videoWorkflowManifestSchema.optional(),workflowTaskId:id.optional(),comfyWorkflowId:id.optional(),comfyInputs:videoWorkflowManifestSchema.shape.inputs.optional(),comfyOverrides:videoByocOverridesSchema.optional(),camera:videoCameraSchema.optional(),
  providerId:id.optional(),modelId:id.optional(),durationSeconds:z.number().finite().optional(),seconds:z.string().max(10).optional(),size:z.string().max(100).optional(),resolution:z.string().max(100).optional(),
  aspectRatio:z.string().max(20).optional(),generateAudio:z.boolean().optional(),watermark:z.boolean().optional(),references:z.array(videoReferenceSchema).max(128).optional(),
  orderedInputs:z.array(orderedInputSchema).max(256).optional(),providerOptions:z.record(z.string(),z.json()).optional(),
  billingConfirmation:z.strictObject({version:z.number().int().positive().optional(),credits:z.number().int().nonnegative().optional()}).optional()});
export const videoWorkflowPlanSchema=z.strictObject({id:z.uuid(),projectKey:z.string().regex(/^(?:tree|batch):[A-Za-z0-9._:-]{1,160}$/),
  assembly:z.strictObject({nodeIds:z.array(id).min(2).max(100)}).optional(),
  storyboard:z.strictObject({id:z.uuid(),revision:z.number().int().positive()}).optional(),
  reviewOrigin:reviewOriginSchema.optional(),
  variables:z.record(id,z.union([z.string().max(16384),z.number().finite(),z.boolean()])).optional(),
  nodes:z.array(z.strictObject({id,existingArtworkId:id.optional(),canvasNodeId:id.optional(),canvasNodeRevision:z.number().int().nonnegative().optional(),canvasContentDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),canvasLastTaskId:id.nullable().optional(),request:workflowVideoRequestSchema,dependsOn:z.array(id).max(100),
    mediaBindings:z.array(z.strictObject({fromNodeId:id,inputId:id.optional(),elementId:id.optional(),outputIndex:z.number().int().min(0).max(127).optional(),kind:z.enum(["image","video","audio"]),
      role:z.enum(["first_frame","last_frame","reference","element","source_video","source_audio"])})).max(128).optional()})).min(1).max(100)});
export type VideoWorkflowPlan=z.infer<typeof videoWorkflowPlanSchema>;
export type WorkflowVideoRequest=z.infer<typeof workflowVideoRequestSchema>;
