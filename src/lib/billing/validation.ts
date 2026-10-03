import { z } from "zod";
import { FEATURE_IDS } from "./rules/registry";
export const publicFactsSchema = z.object({ feature: z.enum(FEATURE_IDS), quantity: z.number().int().min(1).max(10000), quality: z.string().max(20).optional(), resolution: z.string().max(20).optional(), modelId: z.string().max(120).optional() }).strict();
export const factsSchema = publicFactsSchema.extend({ quality: z.string().max(20), resolution: z.string().max(20), providerId: z.string().max(120).optional(), metered: z.boolean(), byok: z.boolean(), paidFen: z.number().int().nonnegative(), userGroup: z.string().max(120) }).strict();
export const resultSchema = z.object({ state: z.enum(["succeeded", "failed", "unknown"]), items: z.array(z.object({ id: z.string().min(1).max(200), state: z.enum(["succeeded", "failed", "unknown"]), executedQuality: z.string().max(20).optional(), platformFunded: z.boolean().optional() }).strict()).max(10000) }).strict();
