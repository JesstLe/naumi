"use client";
import { useState } from "react";
import type { ModelConfig } from "@/lib/model-config/types";
import type { ConfigSnapshot, Pricing } from "@/lib/billing/types";
import { FEATURE_LABELS } from "@/lib/billing/labels";
import type { FeatureId } from "@/lib/billing/rules/registry";
import { batchFeatureAvailability, planModelBatch, type BatchInput } from "@/lib/model-config/batch";
import { cnyCredits } from "@/lib/billing/money";
import { MoneyField } from "./business-editor";
import { buttonClass, Choice, Panel, TextField, Toggle } from "./fields";

export function ModelBatchEditor({ config, billing, onChange, onNavigate }: {
  config: ModelConfig; billing?: ConfigSnapshot; onChange: (config: ModelConfig) => void;
  onNavigate: (tab: "providers" | "upstreamModels" | "business") => void;
}) {
  const upstreams = config.upstreamModels.filter(u => u.enabled && config.providers.some(p => p.id === u.providerId && p.enabled));
  const [mode, setMode] = useState<"new" | "existing">("new"), [upstreamId, setUpstream] = useState(upstreams[0]?.id || ""),
    [modelId, setModelId] = useState(""), [label, setLabel] = useState(""), [features, setFeatures] = useState<FeatureId[]>([]),
    [overwritePrice, setOverwrite] = useState(false), [direct, setDirect] = useState(false), [setDefault, setDefaultModel] = useState(true),
    [unit, setUnit] = useState<BatchInput["unit"]>("image"), [message, setMessage] = useState(""), [preview, setPreview] = useState(false),
    [pricing, setPricing] = useState<Pricing>({ mode: "cny-fixed", amountMicros: "1000000", creditsPerCnyMicros: "100000000", rounding: "ceil" });
  const upstream = config.upstreamModels.find(u => u.id === upstreamId), provider = config.providers.find(p => p.id === upstream?.providerId);
  const availability = batchFeatureAvailability(config, upstreamId);
  const aliases = config.publicModels.filter(m => m.enabled && m.visible && m.target.type === "upstream");
  function resetPreview() { setPreview(false); setMessage(""); }
  function chooseUpstream(id: string) { setUpstream(id); setFeatures([]); const image = config.upstreamModels.find(u => u.id === id)?.modality === "image"; setUnit(image ? "image" : "task"); if (config.upstreamModels.find(u => u.id === id)?.modality !== "text" && pricing.mode === "usage") setPricing({ mode: "cny-fixed", amountMicros: "1000000", creditsPerCnyMicros: pricing.creditsPerCnyMicros, rounding: pricing.rounding }); resetPreview(); }
  function chooseAlias(id: string) { const m = aliases.find(m => m.id === id); if (!m || m.target.type !== "upstream") return; setModelId(id); setLabel(m.label); chooseUpstream(m.target.id); }
  const input: BatchInput = { mode, upstreamId, modelId, label, features, pricing, unit, overwritePrice, direct, setDefault };
  let plan: ReturnType<typeof planModelBatch> | undefined, error = "";
  try { plan = planModelBatch(config, input); } catch (e) { error = e instanceof Error ? e.message : "配置无效"; }
  const cost = upstream?.procurement, reference = upstream?.costRef ? billing?.config.costs[upstream.costRef] : undefined;
  const costKnown = cost && cost.confirmed !== false;
  let quote = "";
  if (pricing.mode === "cny-fixed" || pricing.mode === "usage") {
    try { quote = pricing.mode === "cny-fixed" ? `示例：成功 1 个结算单位，¥${Number(pricing.amountMicros) / 1000000}，${cnyCredits(pricing.amountMicros, pricing)} 积分。` : `本次授权预占最多 ${cnyCredits(pricing.authorizationCnyMicros, pricing)} 积分，按真实用量结算。`; } catch { quote = "价格或兑换率无效，请检查后预览。"; }
  }
  return <div className="space-y-5" data-testid="model-batch-editor">
    <Panel title="1. 选择模型">
      <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} onClick={() => onNavigate("providers")}>供应商与自动模型目录</button><button type="button" className={buttonClass} onClick={() => onNavigate("upstreamModels")}>登记上游与核验能力</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Choice label="配置方式" value={mode} options={[{ value: "new", label: "新增前端公开模型" }, { value: "existing", label: "复用已有公开模型" }]} onChange={v => { setMode(v as "new" | "existing"); setModelId(""); setLabel(""); setFeatures([]); resetPreview(); }} />
        {mode === "new" ? <Choice label="实际供应商 / 上游模型" value={upstreamId} options={upstreams.map(u => ({ value: u.id, label: `${config.providers.find(p => p.id === u.providerId)?.name} / ${u.model}${u.capabilities.verified ? "" : " · 能力未核验"}` }))} onChange={chooseUpstream} /> : <Choice label="复用公开模型" value={modelId} options={[{ value: "", label: "选择模型" }, ...aliases.map(m => ({ value: m.id, label: `${m.label} · ${m.id}` }))]} onChange={chooseAlias} />}
        {mode === "new" && <TextField label="前端公开模型 ID" value={modelId} onChange={v => { setModelId(v); resetPreview(); }} />}
        <TextField label="前端展示名称" value={label} onChange={v => { setLabel(v); resetPreview(); }} />
      </div>
      <p className="break-all text-sm text-c-text2">实际调用：{provider?.name || "未选择"} / {upstream?.model || "未选择"}。公开 ID 与上游 ID 分开，复用模型不更换共享上游。</p>
      <p className="text-sm">采购成本：{costKnown ? `${cost.currency} · ${cost.basis} · ${cost.basis === "tokens" ? "按输入输出用量" : Number(cost.amountMicros) / 1000000}` : reference && reference.currency !== "credits" ? `${reference.currency} · ${reference.unit} · ${Number(reference.amountMicros) / 1000000}（已有计费配置）` : "成本未知"}；来源：{cost?.source || reference?.source || "未登记"}；更新时间：{cost?.updatedAt || "未知"}</p>
    </Panel>
    <Panel title="2. 设置基础售价">
      <div className="grid gap-4 md:grid-cols-3">
        <Choice label="基础收费模式" value={pricing.mode} options={[{ value: "cny-fixed", label: "人民币固定收费" }, ...(upstream?.modality === "text" ? [{ value: "usage", label: "人民币实际用量" }] : [])]} onChange={v => { setPricing(v === "usage" ? { mode: "usage", inputMicrosPerMillion: "1000000", outputMicrosPerMillion: "2000000", authorizationCnyMicros: "1000000", creditsPerCnyMicros: "100000000", rounding: "ceil" } : { mode: "cny-fixed", amountMicros: "1000000", creditsPerCnyMicros: "100000000", rounding: "ceil" }); if (v === "usage") setUnit("task"); resetPreview(); }} />
        <Choice label="基础成功结算单位" value={unit} options={[...(upstream?.modality === "image" && pricing.mode !== "usage" ? [{ value: "image", label: "每张成功输出" }] : []), { value: "task", label: "每次成功任务" }, ...(pricing.mode !== "usage" ? [{ value: "item", label: "每个成功结果" }] : [])]} onChange={v => { setUnit(v as BatchInput["unit"]); resetPreview(); }} />
        {pricing.mode === "cny-fixed" && <MoneyField label="基础售价（人民币元 / 成功单位）" value={pricing.amountMicros} onChange={v => { setPricing({ ...pricing, amountMicros: v }); resetPreview(); }} />}
        {pricing.mode === "usage" && <><MoneyField label="输入售价（元 / 百万 token）" value={pricing.inputMicrosPerMillion} onChange={v => { setPricing({ ...pricing, inputMicrosPerMillion: v }); resetPreview(); }} /><MoneyField label="输出售价（元 / 百万 token）" value={pricing.outputMicrosPerMillion} onChange={v => { setPricing({ ...pricing, outputMicrosPerMillion: v }); resetPreview(); }} /><MoneyField label="用户授权上限（元）" value={pricing.authorizationCnyMicros} onChange={v => { setPricing({ ...pricing, authorizationCnyMicros: v }); resetPreview(); }} /></>}
        {(pricing.mode === "cny-fixed" || pricing.mode === "usage") && <><MoneyField label="每人民币元兑换积分" value={pricing.creditsPerCnyMicros} onChange={v => { setPricing({ ...pricing, creditsPerCnyMicros: v }); resetPreview(); }} /><Choice label="积分整数舍入" value={pricing.rounding} options={[{ value: "ceil", label: "向上" }, { value: "floor", label: "向下" }, { value: "nearest", label: "四舍五入" }]} onChange={v => { setPricing({ ...pricing, rounding: v as "ceil" | "floor" | "nearest" }); resetPreview(); }} /></>}
      </div>
      <Toggle label="覆盖勾选功能中此模型已有的价格与收费单位" value={overwritePrice} onChange={v => { setOverwrite(v); resetPreview(); }} />
      <p className="text-sm" data-testid="batch-price-example">{quote}</p>
      <p className="text-xs text-c-text3">默认只给新增选项设置基础价；已有特殊价格、规格差价和其他模型价格保留。采购成本不会随售价更改。</p>
    </Panel>
    <Panel title="3. 选择应用功能">
      <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} onClick={() => { setFeatures(availability.filter(a => a.compatible).map(a => a.feature)); resetPreview(); }}>全选兼容功能</button><button type="button" className={buttonClass} onClick={() => { setFeatures(availability.filter(a => a.compatible && !config.business?.[a.feature]).map(a => a.feature)); resetPreview(); }}>只选未配置功能</button><button type="button" className={buttonClass} onClick={() => { setFeatures([]); resetPreview(); }}>清空选择</button></div>
      <div className="grid gap-2 md:grid-cols-2">{availability.map(a => <label key={a.feature} className={`flex items-start gap-3 border-b border-c-border py-3 text-sm ${a.compatible ? "" : "text-c-text3"}`}><input type="checkbox" className="mt-1" disabled={!a.compatible} checked={features.includes(a.feature)} onChange={e => { setFeatures(e.target.checked ? [...features, a.feature] : features.filter(id => id !== a.feature)); resetPreview(); }} /><span>{FEATURE_LABELS[a.feature]}<span className="mt-1 block text-xs text-c-text3">{a.compatible ? `当前默认：${config.business?.[a.feature]?.defaultModelId || "沿用默认用途"}` : a.reason}</span></span></label>)}</div>
      <div className="flex flex-wrap gap-4"><Toggle label="将此模型设为勾选功能的默认模型" value={setDefault} onChange={v => { setDefaultModel(v); resetPreview(); }} /><Toggle label="关闭勾选功能中此模型的路由，直接调用所选上游" value={direct} onChange={v => { setDirect(v); resetPreview(); }} /></div>
      <p className="text-xs text-c-text3">默认保留已有路由、参数、后处理及其他模型选项。停用功能不会自动启用；未勾选功能的默认模型不变。</p>
    </Panel>
    <Panel title="4. 预览并加入统一发布草稿">
      <p className="text-sm">已选 {features.length} 个功能；本页修改与单功能配置共用一个草稿、一个发布版本。</p>
      <button type="button" className={buttonClass} onClick={() => { setPreview(true); setMessage(""); }}>预览批量变更</button>
      {preview && error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {preview && plan && <>
        {plan.sharedLabelFeatures.length > 0 && <p className="text-sm">展示名称属于共享公开模型，修改后也影响：{plan.sharedLabelFeatures.map(id => FEATURE_LABELS[id as FeatureId] || id).join("、")}。</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["功能", "默认模型变化", "售价", "路由"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{plan.changes.map(c => <tr key={c.feature} className="border-t border-c-border"><td className="p-2">{FEATURE_LABELS[c.feature]}</td><td className="break-all p-2">{c.beforeDefault} → {c.afterDefault}</td><td className="p-2">{c.price}</td><td className="p-2">{c.route}</td></tr>)}</tbody></table></div>
        <button type="button" className={buttonClass} disabled={!plan.changed} onClick={() => { onChange(plan!.config); setMode("existing"); setPreview(false); setMessage("批量配置已加入当前草稿，尚未生效。使用下方校验并预览发布差异，确认后统一应用。"); }}>确认批量修改草稿</button>
      </>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <button type="button" className={buttonClass} onClick={() => onNavigate("business")}>单功能价格、参数与路由例外</button>
    </Panel>
  </div>;
}
