import {z} from 'zod';
import {videoWorkflowManifestSchema} from './workflow-schema';
import {videoReferenceSchema,orderedInputSchema} from './references';
import {videoInputSchema} from './contract';
import {videoPreferenceSchema} from './execution-contract';
import {videoCameraSchema} from './camera';

const num=z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),name=z.string().min(1).max(160);
export const byocVideoInputSchema=z.strictObject({workflowId:name,workflowRevision:z.number().int().nonnegative().optional(),idempotencyKey:z.string().min(1).max(100),mediaType:z.literal("video").optional(),artworkId:name.optional(),imageUrl:z.string().max(16384).optional(),
  source:z.enum(["canvas","workbench","agent","workflow"]).optional(),orderedInputs:z.array(orderedInputSchema).max(256).optional(),
  nodeId:name.optional(),expectedRevision:z.number().int().nonnegative().optional(),projectKey:z.string().max(166).optional(),
  prompt:z.string().max(16384).optional(),texts:z.record(name,z.string().max(16384)).optional(),seed:num.int().optional(),seeds:z.record(name,num.int()).optional(),
  numericDefaults:z.record(name,num).optional(),numerics:z.record(name,z.record(name,num)).optional(),durationSeconds:z.number().int().positive().max(3600).optional(),
  parameters:z.record(z.string().min(1).max(100),z.json()).optional(),
  intentPreference:videoPreferenceSchema.optional(),shots:videoInputSchema.shape.shots,elements:videoInputSchema.shape.elements,camera:videoCameraSchema.optional(),
  width:videoInputSchema.shape.width,height:videoInputSchema.shape.height,providerOptions:videoInputSchema.shape.providerOptions,
  negativePrompt:z.string().max(8192).optional(),resolution:z.string().max(100).optional(),aspectRatio:z.string().max(20).optional(),generateAudio:z.boolean().optional(),watermark:z.boolean().optional(),
  references:z.array(videoReferenceSchema).max(128).optional(),inputMappings:videoWorkflowManifestSchema.shape.inputs.optional()});
