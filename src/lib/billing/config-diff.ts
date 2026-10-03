import type { BillingConfig } from "./types";
import { FEATURE_LABELS } from "./labels";
import { QUALITY_LABELS, costLabel } from "./business";
import { microsToDecimal } from "./decimal";
export type ConfigChange = {
    path: string[];
    before: unknown;
    after: unknown;
};
export function configChanges(before: unknown, after: unknown, path: string[] = []): ConfigChange[] {
    if (JSON.stringify(before) === JSON.stringify(after))
        return [];
    if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after))
        return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).flatMap(key => configChanges((before as any)[key], (after as any)[key], [...path, key]));
    return [{ path, before, after }];
}
const LABELS: Record<string, string> = { features: "功能", pricing: "价格", quality: "质量单价", resolutionExtra: "分辨率附加积分", settlement: "结算策略", rules: "规则", enabled: "参与计费", credits: "积分", amount: "数量", expiry: "有效期", value: "时长", unit: "单位", costs: "估计成本", products: "商品", amountFen: "售价（分）", baseCredits: "基础积分", bonusCredits: "赠送积分", available: "开放购买", switches: "开关", metering: "积分计费", commerce: "商品购买", recharge: "在线充值", thresholds: "门槛", agentConfirmCredits: "Agent 确认积分", highQualityPaidFen: "累计付款（分）", signup: "注册赠送", purchase: "购买", redeem: "兑换码", admin: "人工赠送", debitOrder: "扣款顺序", staleReservationMinutes: "旧预占等待分钟", factorBps: "成本乘数（基点）", amountMicros: "成本（百万分之一单位）", costKey: "成本项", currency: "币种", byokBps: "自带接口收费（基点）", failureBps: "失败收费（基点）", reserveBps: "预占（基点）" };
function describe(value: unknown): string { if (value === undefined)
    return "未设置"; if (typeof value === "boolean")
    return value ? "开启" : "关闭"; if (value && typeof value === "object")
    return Array.isArray(value) ? value.map(describe).join("；") : Object.entries(value).map(([key, item]) => `${LABELS[key] || key} ${describe(item)}`).join("，"); return String(value); }
const VALUES: Record<string,string> = {image:"每张图片",item:"每个结果",task:"每次任务",requested:"用户选择的质量",executed:"实际执行质量","successful-units":"只计成功结果","whole-request":"成功后计整笔请求",hold:"保留预占等待恢复",manual:"人工核对",on:"开启",off:"关闭","legacy-auto":"沿用原运行模式",fixed:"固定积分","quality-resolution":"质量与分辨率",tiers:"分档价格","cost-plus":"成本加成"};
export function describeChange(change: ConfigChange) {
    const key=change.path[change.path.length-1];
    const names:Record<string,string>={amountFen:"售价（元）",minPaidFen:"最低累计付款（元）",highQualityPaidFen:"累计付款（元）",amountMicros:"成本金额",factorBps:"成本乘数（%）",byokBps:"自带接口收费（%）",failureBps:"失败收费（%）",reserveBps:"预占比例（%）"};
    const format=(value:unknown)=>{
        if(value===undefined)return "未设置";
        if(["amountFen","minPaidFen","highQualityPaidFen"].includes(key)&&typeof value==="number")return `¥${(value/100).toFixed(2)}`;
        if(["factorBps","byokBps","failureBps","reserveBps"].includes(key)&&typeof value==="number")return `${value/100}%`;
        if(key==="amountMicros"&&typeof value==="string"&&/^\d+$/.test(value))return microsToDecimal(value);
        return typeof value==="string"&&VALUES[value]?VALUES[value]:describe(value);
    };
    const path=change.path.map((part,index)=>change.path[0]==="costs"&&index===1?costLabel(part):FEATURE_LABELS[part as keyof typeof FEATURE_LABELS]||QUALITY_LABELS[part]||names[part]||LABELS[part]||part).join(" · ");
    return `${path}：${format(change.before)} → ${format(change.after)}`;
}
/** Apply only explicitly edited paths, preserving unrelated concurrent changes. */
export function mergeConfigDraft(base: BillingConfig, draft: BillingConfig, latest: BillingConfig) {
    const config = structuredClone(latest), conflicts: string[] = [];
    for (const change of configChanges(base, draft)) {
        let target: any = config, old: any = latest;
        for (const key of change.path.slice(0, -1)) {
            target[key] ??= {};
            target = target[key];
            old = old?.[key];
        }
        const key = change.path[change.path.length - 1];
        if (JSON.stringify(old?.[key]) !== JSON.stringify(change.before) && JSON.stringify(old?.[key]) !== JSON.stringify(change.after))
            conflicts.push(describeChange({ ...change, before: old?.[key] }));
        if (change.after === undefined)
            delete target[key];
        else
            target[key] = structuredClone(change.after);
    }
    return { config, conflicts };
}
