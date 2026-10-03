"use client";
import { useState } from "react";
import type { CostRate } from "@/lib/billing/types";
import { Choice, Field, MoneyField, control } from "./fields";
export function CostEditor({ costs, onChange }: {
    costs: Record<string, CostRate>;
    onChange: (costs: Record<string, CostRate>) => void;
}) {
    const [selected, setSelected] = useState(Object.keys(costs)[0] || ""), [newKey, setNewKey] = useState("");
    const value = costs[selected];
    const update = (change: Partial<CostRate>) => onChange({ ...costs, [selected]: { ...value, ...change } });
    return <div className="space-y-4"><p className="text-sm text-muted-foreground">这里维护供应商估计成本。固定积分价格不会随成本改变；使用成本加成时会影响新报价。金额直接填写人民币、美元或积分，最多保留六位小数。</p><Choice label="成本项" value={selected} options={Object.keys(costs).map(k => [k, k])} onChange={setSelected}/>{value && <div className="grid gap-3 sm:grid-cols-2"><Choice label="成本币种" value={value.currency} options={[["CNY", "人民币"], ["USD", "美元"], ["credits", "历史积分估计"]]} onChange={currency => update({ currency: currency as CostRate["currency"], source: currency === "credits" ? "legacy-credit-estimate" : "manual-estimate" })}/><MoneyField label="成本金额" value={value.amountMicros} onChange={amountMicros => update({ amountMicros })}/><Choice label="成本计量单位" value={value.unit} options={[["image", "每张图片"], ["item", "每个结果"], ["task", "每笔任务"]]} onChange={unit => update({ unit: unit as CostRate["unit"] })}/>{value.currency === "USD" && <MoneyField label="一美元折合人民币（元）" value={value.cnyPerUnitMicros || "0"} onChange={cnyPerUnitMicros => update({ cnyPerUnitMicros })}/>}</div>}<div className="flex flex-col gap-2 sm:flex-row"><input className={control} aria-label="新成本项标识" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="供应商:模型:质量:分辨率"/><button type="button" className="shrink-0 rounded-lg border px-4 py-2 text-sm" onClick={() => { const key = newKey.trim(); if (key && !costs[key]) {
        onChange({ ...costs, [key]: { currency: "CNY", amountMicros: "0", unit: "image", source: "manual-estimate" } });
        setSelected(key);
        setNewKey("");
    } }}>添加成本项</button></div></div>;
}
