"use client";
import type { Pricing, SettlementPolicy } from "@/lib/billing/types";
import { QUALITY_IDS, RESOLUTION_IDS } from "@/lib/billing/rules/registry";
import { Choice, Field, NumberField, MoneyField, PercentField, control } from "./fields";
export function PricingEditor({ label, value, onChange, costKeys }: {
    label: string;
    value: Pricing;
    onChange: (value: Pricing) => void;
    costKeys: string[];
}) {
    const switchMode = (mode: string) => onChange(mode === "fixed" ? { mode, credits: 0 } : mode === "quality-resolution" ? { mode, quality: Object.fromEntries(QUALITY_IDS.map(q => [q, 0])), resolutionExtra: Object.fromEntries(RESOLUTION_IDS.map(r => [r, 0])) } : mode === "tiers" ? { mode, dimension: "quantity", prices: { default: 0 } } : { mode: "cost-plus", costKey: costKeys[0] || "", creditsPerCnyMicros: "1000000", factorBps: 10000, rounding: "ceil", minimum: 0, maximum: 2147483647 });
    return <div className="space-y-4"><Choice label={`${label} · 定价方式`} value={value.mode} options={[["fixed", "固定积分"], ["quality-resolution", "质量与分辨率"], ["tiers", "分档价格"], ["cost-plus", "成本加成"]]} onChange={switchMode}/>
 {value.mode === "fixed" && <NumberField label={`${label} · 单价`} value={value.credits} onChange={credits => onChange({ ...value, credits })}/>}
 {value.mode === "quality-resolution" && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{QUALITY_IDS.map(q => <NumberField key={q} label={`${label} · ${q} 单价`} value={value.quality[q]} onChange={n => onChange({ ...value, quality: { ...value.quality, [q]: n } })}/>)}</div><p className="text-xs text-muted-foreground">分辨率附加积分会与质量单价相加。</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{RESOLUTION_IDS.map(r => <NumberField key={r} label={`${label} · ${r} 附加积分`} value={value.resolutionExtra[r]} onChange={n => onChange({ ...value, resolutionExtra: { ...value.resolutionExtra, [r]: n } })}/>)}</div></>}
 {value.mode === "tiers" && <><Choice label="分档依据" value={value.dimension} options={[["quantity", "数量"], ["quality", "质量"], ["resolution", "分辨率"]]} onChange={dimension => onChange({ ...value, dimension: dimension as typeof value.dimension })}/>{Object.entries(value.prices).map(([key, n]) => <div key={key} className="flex items-end gap-2"><NumberField label={`档位 ${key}`} value={n} onChange={n => onChange({ ...value, prices: { ...value.prices, [key]: n } })}/>{key !== "default" && <button type="button" className="pb-2 text-sm text-destructive" onClick={() => { const prices = { ...value.prices }; delete prices[key]; onChange({ ...value, prices }); }}>删除</button>}</div>)}<Field label="新增档位"><input className={control} placeholder="输入数量、质量或分辨率，按回车添加" onKeyDown={e => { if (e.key === "Enter") {
        e.preventDefault();
        const key = e.currentTarget.value.trim();
        if (key)
            onChange({ ...value, prices: { ...value.prices, [key]: 0 } });
        e.currentTarget.value = "";
    } }}/></Field></>}
 {value.mode === "cost-plus" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Choice label="使用成本项" value={value.costKey} options={costKeys.map(k => [k, k])} onChange={costKey => onChange({ ...value, costKey })}/><MoneyField label="每元人民币兑换积分" value={value.creditsPerCnyMicros} onChange={creditsPerCnyMicros => onChange({ ...value, creditsPerCnyMicros })}/><PercentField label="成本乘数（%，100 为原成本）" value={value.factorBps} max={2147483647} onChange={factorBps => onChange({ ...value, factorBps })}/><Choice label="取整方式" value={value.rounding} options={[["ceil", "向上取整"], ["floor", "向下取整"], ["nearest", "四舍五入"]]} onChange={rounding => onChange({ ...value, rounding: rounding as typeof value.rounding })}/><NumberField label="最低积分" value={value.minimum} onChange={minimum => onChange({ ...value, minimum })}/><NumberField label="最高积分" value={value.maximum} onChange={maximum => onChange({ ...value, maximum })}/></div>}
 </div>;
}
export function SettlementEditor({ value, onChange }: {
    value: SettlementPolicy;
    onChange: (value: SettlementPolicy) => void;
}) { return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Choice label="质量计费依据" value={value.qualityBasis} options={[["requested", "用户请求质量"], ["executed", "实际执行质量"]]} onChange={qualityBasis => onChange({ ...value, qualityBasis: qualityBasis as typeof value.qualityBasis })}/><Choice label="成功计费范围" value={value.successBasis} options={[["successful-units", "只计成功数量"], ["whole-request", "成功后计整笔任务"]]} onChange={successBasis => onChange({ ...value, successBasis: successBasis as typeof value.successBasis })}/><PercentField label="失败收费比例（%）" value={value.failureBps} max={10000} onChange={failureBps => onChange({ ...value, failureBps })}/><PercentField label="自带接口收费比例（%）" value={value.byokBps} max={10000} onChange={byokBps => onChange({ ...value, byokBps })}/><PercentField label="预占比例（%）" value={value.reserveBps} min={10000} max={100000} onChange={reserveBps => onChange({ ...value, reserveBps })}/><Choice label="结果未知时" value={value.unknown} options={[["hold", "保留预占等待恢复"], ["manual", "转人工核对"]]} onChange={unknown => onChange({ ...value, unknown: unknown as typeof value.unknown })}/></div>; }
