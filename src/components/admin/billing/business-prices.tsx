"use client";
import { useState } from "react";
import type { BillingConfig, FeatureId, FeatureTariff } from "@/lib/billing/types";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import { BUSINESS_GROUPS, FEATURE_DESCRIPTIONS, pricingSummary, unitLabel } from "@/lib/billing/business";
import { estimateCost } from "@/lib/billing/costs";
import { microsToDecimal } from "@/lib/billing/decimal";
import { quote } from "@/lib/billing/quote";
import { Choice, NumberField } from "./fields";
import { PricingEditor, SettlementEditor } from "./price-editor";

export function BusinessPrices({ config, feature, onSelect, onChange, onCost }: {
    config: BillingConfig; feature: FeatureId; onSelect: (id: FeatureId) => void;
    onChange: (value: FeatureTariff) => void; onCost: () => void;
}) {
    const [groupId, setGroup] = useState("images"), [quantity, setQuantity] = useState(3);
    const group = BUSINESS_GROUPS.find(g => g.id === groupId)!, tariff = config.features[feature];
    const selectedInGroup = group.features.includes(feature);
    let example = "", cost = "未设置成本（不代表零成本）";
    try {
        const q = quote({ version: 0, config }, { feature, quantity, quality: "medium", resolution: "1K", metered: true, byok: false, paidFen: 0, userGroup: "default" });
        const estimated = estimateCost(q, {state:"succeeded",items:Array.from({length:quantity},(_,i)=>({id:String(i),state:"succeeded",executedQuality:"medium"}))});
        if(estimated) cost = `${microsToDecimal(estimated.amountMicros)} ${estimated.currency === "CNY" ? "元" : estimated.currency === "USD" ? "美元" : "积分估计"}（估计）`;
        example = `提交 ${quantity} 个结果，全部成功时预计扣 ${q.requestedCredits} 积分，提交前预占 ${q.reserveCredits} 积分。`;
    } catch { example = "草稿价格不完整，请核对价格或成本设置后再试算。"; }
    return <div className="space-y-6">
        <div className="flex flex-wrap gap-2" aria-label="业务分类">{BUSINESS_GROUPS.map(g => <button key={g.id} type="button" aria-pressed={groupId === g.id} className={`rounded-lg px-4 py-2 text-sm ${groupId === g.id ? "bg-primary text-primary-foreground" : "border"}`} onClick={() => { setGroup(g.id); onSelect(g.features[0]); }}>{g.label}</button>)}</div>
        <p className="text-sm text-muted-foreground">{group.description}</p>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-w-0"><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>业务操作</span><span>草稿价格</span></div><div className="divide-y rounded-xl border">{group.features.map(id => <button type="button" key={id} aria-label={`配置${FEATURE_LABELS[id]}`} aria-pressed={feature === id} onClick={() => onSelect(id)} className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm ${feature === id ? "bg-primary/10" : "hover:bg-muted/50"}`}><span className="font-medium">{FEATURE_LABELS[id]}{groupId === "canvas" && !id.startsWith("canvas.") && <span className="mt-1 block text-xs font-normal text-muted-foreground">与其他入口共用价格</span>}</span><span className="max-w-[55%] text-right text-xs leading-5 text-muted-foreground">{pricingSummary(config.features[id])}{config.features[id].rules.length > 0 && <span className="block">另有 {config.features[id].rules.length} 条条件规则</span>}</span></button>)}</div>{groupId === "canvas" && <p className="mt-3 text-xs leading-6 text-muted-foreground">拖动、缩放、连线、排版、复制和本地裁剪不调用 AI，不扣积分。免费 AI 操作仍可能产生供应商成本。自带 ComfyUI 工作流由用户自己的端点执行，当前不扣平台积分。</p>}</div>
            <section className="min-w-0 space-y-5" aria-label="当前功能配置">
                <div><h2 className="text-lg font-semibold">{FEATURE_LABELS[feature]}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{FEATURE_DESCRIPTIONS[feature] || `调整${FEATURE_LABELS[feature]}的积分价格与结算方式。`}</p>{!selectedInGroup && <p className="text-xs text-muted-foreground">此功能来自其他业务分类。</p>}</div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tariff.enabled} onChange={e => onChange({ ...tariff, enabled: e.target.checked })}/>本功能参与积分计费</label>
                {!tariff.enabled && <p className="rounded-lg bg-muted p-3 text-sm">当前免费。下方可先设置价格，开启本功能计费并发布后才会扣积分。</p>}
                <Choice label="计费单位" value={tariff.unit} options={[["image", "每张图片"], ["item", "每个结果"], ["task", "每次任务（不随结果数量相乘）"]]} onChange={unit => onChange({ ...tariff, unit: unit as FeatureTariff["unit"] })}/>
                <PricingEditor label={FEATURE_LABELS[feature]} value={tariff.pricing} costKeys={Object.keys(config.costs)} onChange={pricing => onChange({ ...tariff, pricing })}/>
                <div className="border-l-2 border-primary bg-primary/5 px-4 py-3"><h3 className="text-sm font-medium">扣费示例</h3><div className="my-3 max-w-40"><NumberField label="示例结果数量" value={quantity} min={1} max={10000} onChange={setQuantity}/></div><p className="text-sm" data-testid="business-example">{example}</p><p className="mt-2 text-sm">供应商成本：{cost}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">按标准质量、1K、普通用户并开启总计费试算。当前单位：每{unitLabel(tariff.unit)}。特殊用户、模型和失败情况请使用下方详细试算。</p></div>
                <p className="text-sm leading-6 text-muted-foreground">{tariff.settlement.failureBps === 0 ? "确认失败不收费。" : `确认失败按价格的 ${tariff.settlement.failureBps / 100}% 收费。`}{tariff.settlement.successBasis === "successful-units" ? "部分成功只计成功结果。" : "只要有成功结果，按整笔请求结算。"}结果不明时保留预占，等待恢复或人工核对。</p>
                <button type="button" className="text-sm text-primary underline underline-offset-4" onClick={onCost}>设置该功能的供应商成本</button>
                <details key={feature} className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">高级结算设置</summary><div className="mt-4"><SettlementEditor value={tariff.settlement} onChange={settlement => onChange({ ...tariff, settlement })}/><p className="mt-3 text-xs text-muted-foreground">按实际质量计费时，整单或整次任务采用成功结果中的最高实际单价。</p></div></details>
            </section>
        </div>
    </div>;
}
