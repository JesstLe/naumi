import { z } from "zod";
import { BillingError, type BillingConfig, type FeatureTariff, type Pricing } from "../types";
import { FEATURE_IDS, QUALITY_IDS, RESOLUTION_IDS } from "./registry";
import { conditionsOverlap, mergeTariff } from "./evaluate";
const integer = z.number().int().nonnegative().max(2147483647);
const decimal = z.string().regex(/^(0|[1-9]\d{0,29})$/);
const expiry = z.object({ unit: z.enum(["days", "months", "years"]), value: z.number().int().min(1).max(36500) }).strict();
const prices = z.record(z.string().min(1).max(100), integer);
const pricing = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("fixed"), credits: integer }).strict(),
    z.object({ mode: z.literal("quality-resolution"), quality: prices, resolutionExtra: prices }).strict(),
    z.object({ mode: z.literal("tiers"), dimension: z.enum(["quantity", "quality", "resolution"]), prices }).strict(),
    z.object({ mode: z.literal("cost-plus"), costKey: z.string().min(1).max(300), creditsPerCnyMicros: decimal, factorBps: integer, rounding: z.enum(["ceil", "floor", "nearest"]), minimum: integer, maximum: integer }).strict(),
]);
const policy = z.object({ qualityBasis: z.enum(["requested", "executed"]), successBasis: z.enum(["successful-units", "whole-request"]), failureBps: z.number().int().min(0).max(10000), byokBps: z.number().int().min(0).max(10000), reserveBps: z.number().int().min(10000).max(100000), unknown: z.enum(["hold", "manual"]) }).strict();
const condition = z.object({ quality: z.array(z.enum(QUALITY_IDS)).min(1).optional(), resolution: z.array(z.enum(RESOLUTION_IDS)).min(1).optional(), byok: z.boolean().optional(), userGroup: z.array(z.string().min(1).max(100)).min(1).optional(), minQuantity: z.number().int().min(1).max(10000).optional(), maxQuantity: z.number().int().min(1).max(10000).optional(), minPaidFen: integer.optional(), providerId: z.array(z.string().max(300)).min(1).optional(), modelId: z.array(z.string().max(300)).min(1).optional() }).strict();
const tariff = z.object({ label: z.string().min(1).max(100), enabled: z.boolean(), unit: z.enum(["image", "item", "task"]), pricing, settlement: policy, rules: z.array(z.object({ id: z.string().min(1).max(100), priority: integer, when: condition, pricing: pricing.optional(), settlement: policy.partial().optional() }).strict()).max(100) }).strict();
const schema = z.object({ schemaVersion: z.literal(1), features: z.record(z.enum(FEATURE_IDS), tariff), costs: z.record(z.string().min(1).max(300), z.object({ currency: z.enum(["CNY", "USD", "credits"]), amountMicros: decimal, unit: z.enum(["image", "item", "task"]), cnyPerUnitMicros: decimal.optional(), source: z.enum(["manual-estimate", "legacy-credit-estimate"]) }).strict()), products: z.record(z.string().min(1).max(100), z.object({ id: z.string().min(1).max(100), kind: z.enum(["pack", "pro", "plan-display"]), title: z.string().min(1).max(200), amountFen: integer, baseCredits: integer, bonusCredits: integer, available: z.boolean(), expiry }).strict()), credits: z.object({ signup: z.object({ amount: integer, expiry }).strict(), purchase: expiry, redeem: expiry, admin: expiry, debitOrder: z.enum(["expires-first", "created-first"]), staleReservationMinutes: z.number().int().min(1).max(525600) }).strict(), switches: z.object({ metering: z.enum(["legacy-auto", "on", "off"]), commerce: z.boolean(), recharge: z.boolean() }).strict(), thresholds: z.object({ highQualityPaidFen: integer, agentConfirmCredits: integer }).strict() }).strict();
function checkPricing(p: Pricing, c: BillingConfig) {
    if (p.mode === "quality-resolution") {
        if (!QUALITY_IDS.every(k => Number.isInteger(p.quality[k])) || !RESOLUTION_IDS.every(k => Number.isInteger(p.resolutionExtra[k])))
            throw new Error("质量和分辨率价格必须完整");
    }
    if (p.mode === "tiers" && p.prices.default === undefined)
        throw new Error("分档价格必须设置默认价格");
    if (p.mode === "cost-plus") {
        const rate = c.costs[p.costKey];
        if (!rate || BigInt(p.creditsPerCnyMicros) <= BigInt(0) || p.minimum > p.maximum || rate.currency === "USD" && (!rate.cnyPerUnitMicros || BigInt(rate.cnyPerUnitMicros) <= BigInt(0)))
            throw new Error("成本报价缺少有效成本或折算率");
    }
}
function checkTariff(t: FeatureTariff, c: BillingConfig) { checkPricing(t.pricing, c); }
export function validateBillingConfig(value: unknown): BillingConfig {
    try {
        if (JSON.stringify(value).length > 1000000)
            throw new Error("配置过大");
        const c = schema.parse(value) as BillingConfig;
        for (const feature of FEATURE_IDS) {
            const t = c.features[feature];
            checkTariff(t, c);
            const ids = new Set<string>();
            for (const rule of t.rules) {
                if (ids.has(rule.id) || rule.when.minQuantity !== undefined && rule.when.maxQuantity !== undefined && rule.when.minQuantity > rule.when.maxQuantity)
                    throw new Error("规则标识重复或数量范围无效");
                ids.add(rule.id);
                checkTariff(mergeTariff(t, rule), c);
                if (t.rules.some(other => other !== rule && other.priority === rule.priority && conditionsOverlap(rule.when, other.when)))
                    throw new Error("规则优先级冲突");
            }
            t.rules.sort((a, b) => b.priority - a.priority);
        }
        for (const [id, p] of Object.entries(c.products)) {
            if (p.id !== id || p.baseCredits + p.bonusCredits > 2147483647 || p.available && p.kind !== "pack")
                throw new Error("商品配置无效或旧商品不可售");
        }
        return c;
    }
    catch (error) {
        throw new BillingError("INVALID_CONFIG", error instanceof z.ZodError ? (error.issues[0]?.message || "计费配置无效") : error instanceof Error ? error.message : "计费配置无效", 400);
    }
}
export function expiryFrom(now: Date, p: import("../types").ExpiryPolicy): Date {
    expiry.parse(p);
    const d = new Date(now);
    if (p.unit === "years")
        d.setFullYear(d.getFullYear() + p.value);
    else if (p.unit === "months")
        d.setMonth(d.getMonth() + p.value);
    else
        d.setDate(d.getDate() + p.value);
    if (!Number.isFinite(d.getTime()))
        throw new BillingError("INVALID_CONFIG", "积分有效期超出范围", 400);
    return d;
}
