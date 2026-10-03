import "server-only";
import { getBillingRuntime } from "@/lib/billing/server";
import type { BillingProduct, ExpiryPolicy } from "@/lib/billing/types";
export type ProductReceipt = {
    configVersion: number;
    product: BillingProduct;
};
export type ResolvedItem = {
    kind: "pack" | "pro";
    itemId: string;
    title: string;
    credits: number;
    amount: number; // 分
    billingConfigVersion: number;
    expiry: ExpiryPolicy;
    billingQuote: ProductReceipt;
};
// 积分充值包由服务端解析,价格不可被前端篡改。历史授权订单仍保留记录,不再出售。
export async function resolveItem(kind: string, itemId: string): Promise<ResolvedItem | null> {
    if (kind !== "pack")
        return null;
    const snapshot = await (await getBillingRuntime()).config.current(), pack = snapshot.config.products[itemId];
    if (!pack || pack.kind !== "pack" || !pack.available)
        return null;
    return {
        kind: "pack",
        itemId,
        title: pack.title,
        credits: pack.baseCredits + pack.bonusCredits,
        amount: pack.amountFen,
        billingConfigVersion: snapshot.version,
        expiry: structuredClone(pack.expiry),
        billingQuote: { configVersion: snapshot.version, product: structuredClone(pack) },
    };
}
