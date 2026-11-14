import {z} from "zod";
import {videoInputSchema} from "./contract";
import {videoWorkflowManifestSchema} from "./workflow-schema";
import { videoNodeIdSchema } from "../canvas/video-node-schema";
import { videoProjectKeySchema } from "../canvas/project-key";
import {videoCameraSchema} from "./camera";
import {videoPreferenceSchema} from './execution-contract';
export {videoCameraSchema} from "./camera";
export const videoSubmissionSchema=videoInputSchema.partial().extend({
  durationSeconds:z.number().finite().optional(),
  intentPreference:videoPreferenceSchema.optional(),parameters:z.record(z.string().min(1).max(100),z.json()).optional(),
  source:z.enum(["canvas","workbench","agent","workflow"]).optional(),sourceId:z.string().max(200).optional(),projectKey:videoProjectKeySchema.optional(),
  nodeId:videoNodeIdSchema.optional(),nodeRevision:z.number().int().nonnegative().optional(),
  providerId:z.string().max(100).optional(),modelId:z.string().max(160).optional(),idempotencyKey:z.string().trim().min(1).max(100).optional(),
  seconds:z.string().max(12).optional(),size:z.string().max(100).optional(),artworkId:z.string().max(160).optional(),imageUrl:z.string().max(16384).optional(),
  camera:videoCameraSchema.optional(),workflowManifest:videoWorkflowManifestSchema.optional(),workflowTaskId:videoNodeIdSchema.optional(),
  retryOf:z.string().min(1).max(160).optional(),
  billingConfirmation:z.strictObject({version:z.number().int().positive().optional(),credits:z.number().finite().nonnegative().optional()}).optional(),
});
