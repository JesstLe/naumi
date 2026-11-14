import {z} from 'zod';
import {videoExecutionIntentSchema,videoProfileOutputSchema,videoDiagnosticSchema} from './execution-contract';
export const videoPreviewValueSchema=z.strictObject({draftRevision:z.number().int().nonnegative(),planDigest:z.string().regex(/^[a-f0-9]{64}$/),
  modelVersion:z.number().int().positive(),modelDigest:z.string().regex(/^[a-f0-9]{64}$/),publicModelId:z.string().min(1).max(200),
  intent:videoExecutionIntentSchema,requestedParameters:z.record(z.string(),z.json()),effectiveParameters:z.record(z.string(),z.json()),billingFacts:videoProfileOutputSchema.shape.billingFacts});
export const videoPreviewResponseSchema=z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),value:videoPreviewValueSchema}),z.strictObject({ok:z.literal(false),diagnostics:z.array(videoDiagnosticSchema).min(1)}),
]);
export type VideoPreviewValue=z.infer<typeof videoPreviewValueSchema>;
