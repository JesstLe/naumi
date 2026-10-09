import { z } from "zod";
import {QUALITY_IDS,RESOLUTION_IDS} from "./registry";
const integer = z.number().int().nonnegative().max(2147483647);
const decimal = z.string().regex(/^(0|[1-9]\d{0,14})$/);
const prices = z.record(z.string().min(1).max(100), integer);
const conversion = { creditsPerCnyMicros: decimal.refine(v => BigInt(v) > BigInt(0), "兑换率必须大于零"), rounding: z.enum(["ceil", "floor", "nearest"]) };
export const billingPricingSchema = z.discriminatedUnion("mode", [
  z.strictObject({mode:z.literal("matrix"),prices:z.record(z.enum(QUALITY_IDS),z.record(z.enum(RESOLUTION_IDS),integer.nullable()))}),
  z.strictObject({ mode: z.literal("api-cost-plus"), factorBps: z.number().int().min(10000).max(100000), estimateCnyMicros: decimal, authorizationCnyMicros: decimal.refine(v => BigInt(v) > BigInt(0)), ...conversion }),
  z.strictObject({ mode: z.literal("fixed"), credits: integer }),
  z.strictObject({ mode: z.literal("quality-resolution"), quality: prices, resolutionExtra: prices }),
  z.strictObject({ mode: z.literal("tiers"), dimension: z.enum(["quantity", "quality", "resolution"]), prices }),
  z.strictObject({ mode: z.literal("cost-plus"), costKey: z.string().min(1).max(300), ...conversion, factorBps: integer, minimum: integer, maximum: integer }),
  z.strictObject({ mode: z.literal("cny-fixed"), amountMicros: decimal, ...conversion, variants: z.array(z.strictObject({ quality: z.string().max(10).optional(), resolution: z.string().max(10).optional(), amountMicros: decimal })).max(50).optional() }),
  z.strictObject({ mode: z.literal("usage"), inputMicrosPerMillion: decimal, outputMicrosPerMillion: decimal, cachedInputMicrosPerMillion: decimal.optional(), imageInputMicrosPerMillion: decimal.optional(), authorizationCnyMicros: decimal.refine(v => BigInt(v) > BigInt(0)), ...conversion }),
]);
