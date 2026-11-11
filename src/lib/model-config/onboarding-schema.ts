import {z} from 'zod';
import {modelConfigSchema} from './schema';
import {FEATURE_IDS,QUALITY_IDS,RESOLUTION_IDS} from '../billing/rules/registry';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const credits=z.number().int().min(0).max(2147483647);
const fixed=z.strictObject({mode:z.literal('fixed'),credits});
const matrix=z.strictObject({mode:z.literal('matrix'),prices:z.record(z.enum(QUALITY_IDS),z.record(z.enum(RESOLUTION_IDS),credits.nullable()))});
const explicitPrice=z.union([fixed,matrix]);
const entry=z.strictObject({publicId:id,label:z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/),
 source:z.union([z.strictObject({upstreamId:id}),z.strictObject({upstream:modelConfigSchema.shape.upstreamModels.element})]),
 features:z.array(z.enum(FEATURE_IDS)).min(1).max(FEATURE_IDS.length),
 price:z.union([z.strictObject({mode:z.literal('copy'),sourceModelId:id}),explicitPrice,z.strictObject({mode:z.literal('per-feature'),prices:z.partialRecord(z.enum(FEATURE_IDS),explicitPrice)})]),
});
export const onboardingFields={entries:z.array(entry).min(1).max(12),enabled:z.boolean(),capabilityConfirmed:z.boolean(),expectedBillingVersion:z.number().int().positive()};
