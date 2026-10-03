"use client";
import { useMemo } from "react";
import { useBilling } from "./client";
import type { CreditPack } from "@/lib/mock-data";
export function useBillingProducts() {
    const billing = useBilling(), packs = useMemo<CreditPack[]>(() => billing.catalog?.products.map(p => ({ id: p.id, credits: p.credits, base: p.baseCredits, bonus: p.bonusCredits, price: `¥${(p.amountFen / 100).toFixed(2)}`, priceValue: p.amountFen / 100, fen: p.amountFen, discount: p.bonusCredits > 0 && p.credits > 0 ? `赠送 ${p.bonusCredits.toLocaleString("zh-CN")} 积分` : undefined })) ?? [], [billing.catalog]);
    const buy = async (url: string, init: RequestInit) => {
        if (!billing.catalog)
            throw new Error("商品价格加载中，请稍后重试");
        const body = JSON.parse(String(init.body || "{}")), product = billing.catalog.products.find(p => p.id === body.itemId);
        if (!product)
            throw new Error("商品已停售，请刷新后重试");
        const response = await fetch(url, { ...init, body: JSON.stringify({ ...body, billingVersion: billing.catalog.version, billingCredits: product.credits, billingAmountFen: product.amountFen }) });
        if (response.status === 409)
            await billing.refresh();
        return response;
    };
    return { packs, buy, loading: billing.loading, error: billing.error };
}
