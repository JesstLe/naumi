import { z } from "zod";
import { FEATURE_IDS } from "../billing/rules/registry";
import { billingPricingSchema } from "../billing/rules/pricing-schema";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const micros = z.string().regex(/^(0|[1-9]\d{0,14})$/);
export const fixedMonthlyCostsSchema = z.array(z.strictObject({ id, name: z.string().trim().min(1).max(100), amountCnyMicros: micros, enabled: z.boolean() })).max(100);
export const procurementSchema = z.strictObject({
  confirmed: z.boolean().optional(),
  currency: z.enum(["CNY", "USD"]), source: z.string().trim().min(1).max(200), updatedAt: z.iso.datetime(),
  cnyPerUnitMicros: micros.optional(),
  // A bundled image/task price never also bills tokens.
  basis: z.enum(["image", "task", "tokens"]), amountMicros: micros.optional(),
  inputMicrosPerMillion: micros.optional(), outputMicrosPerMillion: micros.optional(),
  cachedInputMicrosPerMillion: micros.optional(), imageInputMicrosPerMillion: micros.optional(),
});
export const requestConditionsSchema = z.strictObject({
  task: z.array(z.enum(["draft", "product", "detail", "layout"])).min(1).optional(),
  quality: z.array(z.string().min(1).max(10)).min(1).optional(), resolution: z.array(z.enum(["1K", "2K", "4K"])).min(1).optional(),
  minReferences: z.number().int().min(0).max(32).optional(), maxReferences: z.number().int().min(0).max(32).optional(),
  minInputLength: z.number().int().min(0).max(1000000).optional(), maxInputLength: z.number().int().min(0).max(1000000).optional(),
});
export const businessRoutingSchema = z.strictObject({
  enabled: z.boolean(), defaultUpstreamId: id,
  maxAttempts: z.number().int().min(1).max(5), costCapCnyMicros: micros,
  rules: z.array(z.discriminatedUnion("stage", [
    z.strictObject({ id, priority: z.number().int().min(0).max(100000), stage: z.literal("request"), when: requestConditionsSchema, targetUpstreamId: id }),
    z.strictObject({ id, priority: z.number().int().min(0).max(100000), stage: z.literal("failure"), when: z.strictObject({ status: z.array(z.union([z.literal(400), z.literal(401), z.literal(403), z.literal(404), z.literal(422), z.literal(429)])).min(1) }), targetUpstreamId: id }),
  ])).max(100),
});
export const postprocessSchema = z.strictObject({
  enabled: z.boolean(), kind: z.enum(["resize", "ai-upscale", "native"]),
  processor: z.enum(["sharp-lanczos3", "replicate-real-esrgan", "none"]),
  width: z.number().int().min(64).max(8192), height: z.number().int().min(64).max(8192),
  failure: z.enum(["hold", "keep-base"]),
});
export const businessOptionSchema = z.strictObject({
  modelId: id, enabled: z.boolean(), sort: z.number().int().min(0).max(100000),
  unit: z.enum(["image", "item", "task"]), pricing: billingPricingSchema.optional(),
  parameters: z.strictObject({ ratios: z.array(z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/)).min(1).max(30).optional(), qualities: z.array(z.enum(["low", "medium", "high", "xhigh", "max", "auto"])).min(1).max(6).optional(), resolutions: z.array(z.enum(["1K", "2K", "4K"])).min(1).max(3).optional(), inputTypes: z.array(z.enum(["text", "image", "mask"])).min(1).max(3).optional() }).optional(),
  routing: businessRoutingSchema.optional(), postprocess: postprocessSchema.optional(),
});
export const businessFeaturesSchema = z.partialRecord(z.enum(FEATURE_IDS), z.strictObject({ enabled: z.boolean(), defaultModelId: id, inheritExisting:z.boolean().optional(), options: z.array(businessOptionSchema).min(1).max(100) }));
export type BusinessOption = z.infer<typeof businessOptionSchema>;
export type Procurement = z.infer<typeof procurementSchema>;
export type BusinessRouting = z.infer<typeof businessRoutingSchema>;
export type Postprocess = z.infer<typeof postprocessSchema>;
