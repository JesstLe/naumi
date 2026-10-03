/** Explicit compatibility helpers for frozen pre-module tasks and fixtures.
 * Never import bootstrap configuration into browser code or price a new task here.
 */
import type { BillingConfig } from "./types";
import type { CreditPack, QualityCostAudit } from "@/lib/mock-data";
import { quote } from "./quote";
export function imageBillCredits(config: BillingConfig, requested: string, resolution = "1K") {
    return quote({ version: 0, config }, { feature: "image.generate", quantity: 1, quality: requested, resolution, metered: true, byok: false, userGroup: "default", paidFen: 0 }).requestedCredits;
}
export function qualityBillCredits(config: BillingConfig, requested: string) { return imageBillCredits(config, requested); }
export function qualityCostAudit(config: BillingConfig, input: {
    requested: string;
    executed: string;
    upstream: string;
    images: number;
    reason: string;
    billedCredits: number;
    platformFunded: boolean;
    resolution?: string;
}): QualityCostAudit {
    const cost = input.platformFunded ? input.images * imageBillCredits(config, input.executed, input.resolution) : 0;
    return { requestedQuality: input.requested, executedQuality: input.executed, upstream: input.upstream, images: input.images, billedCredits: input.billedCredits, costCredits: cost, marginCredits: input.billedCredits - cost, reason: input.reason };
}
export function getCreditPack(config: BillingConfig, id: string): CreditPack | undefined { const p = config.products[id]; if (!p || p.kind !== "pack")
    return; return { id: p.id, fen: p.amountFen, credits: p.baseCredits + p.bonusCredits, base: p.baseCredits, bonus: p.bonusCredits, price: `¥${p.amountFen / 100}`, priceValue: p.amountFen / 100, discount: p.bonusCredits ? `赠送 ${p.bonusCredits} 积分` : undefined }; }
