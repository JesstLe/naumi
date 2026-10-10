"use client";
import { useCallback, useEffect, useState } from "react";
import { authHeader } from "@/lib/supabase";
import { priceTableConversion, type Image25TablePayload, type Image25Quality, type Image25Tier } from "@/lib/model-config/image25-price-table";

const tierNames: Record<Image25Tier, string> = { gold: "黄金档", platinum: "铂金档", diamond: "钻石档", site_official: "网站官方价" };
const qualityNames: Record<Image25Quality, string> = { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
const selectClass = "border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400";
export function Image25PriceTable() {
  const [data, setData] = useState<Image25TablePayload | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [model, setModel] = useState("gpt-image-2.5-flare"), [tier, setTier] = useState<Image25Tier>("gold"),
    [resolution, setResolution] = useState("all"), [ratio, setRatio] = useState("all"),
    [quality, setQuality] = useState<Image25Quality | "all">("all"), [currency, setCurrency] = useState("CNY");
  const load = useCallback(async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const response = await fetch("/api/admin/billing/image25-prices", { headers: await authHeader(), cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "当前账号没有查看价格表的权限。" : "价格表读取失败，请重试。");
      setData(await response.json());
    } catch (e) { setError(e instanceof Error ? e.message : "价格表读取失败。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const rows = data?.rows.filter(row => (resolution === "all" || row.resolution === resolution) && (ratio === "all" || row.ratio === ratio)) || [];
  const qualities = data?.qualities.filter(q => quality === "all" || q === quality) || [];
  const converted = currency === "CNY" && !!data?.conversion;
  const displayPrice = (usd: string) => converted ? `¥${priceTableConversion(usd, data!.conversion).cny}` : `$${usd}`;
  const download = () => {
    if (!data) return;
    const content = { ...data, selectedModel: model, selectedTier: tier, selectedCurrency: converted ? "CNY" : "USD", rows,
      selectedPrices: rows.flatMap(row => qualities.map(q => ({ model, ratio: row.ratio, resolution: row.resolution, quality: q, tier,
        ...row.prices[q][tier], outputCny: priceTableConversion(row.prices[q][tier].outputUsd, data.conversion).cny,
        saleCny: priceTableConversion(row.prices[q][tier].saleUsd, data.conversion).cny }))) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `apimart-image25-output-x3-${tier}.json`; a.click(); URL.revokeObjectURL(url);
  };
  return <main className="mx-auto min-w-0 max-w-7xl space-y-5 bg-white px-5 py-6 text-slate-900" data-testid="image25-price-table">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
      <div><h1 className="text-2xl font-semibold">APIMart · Image 2.5 原生价格表</h1><p className="mt-2 text-sm text-slate-600">人民币单张售价 = 输出美元参考价 × 3 × 汇率。供应商完整成本另行记录。</p></div>
      <div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={loading} className={selectClass}>刷新价格表</button><button type="button" onClick={download} disabled={!data} className={selectClass}>下载价格明细</button></div>
    </header>
    {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading && <p role="status" className="text-sm text-slate-600">正在读取价格表…</p>}
    {data && <>
      <div className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        当前为定价表，未应用到线上扣费。公开会员档不代表账号实际折扣；输出参考价不是完整 API 成本。原生表不适用于 EXT。
      </div>
      <div className="flex flex-wrap gap-4" aria-label="价格表筛选">
        <label className="flex flex-col gap-1 text-xs text-slate-600">实际模型<select aria-label="实际模型" className={selectClass} value={model} onChange={e => setModel(e.target.value)}>{data.models.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">参考价格档<select aria-label="参考价格档" className={selectClass} value={tier} onChange={e => setTier(e.target.value as Image25Tier)}>{data.tiers.map(id => <option key={id} value={id}>{tierNames[id]}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">分辨率<select aria-label="分辨率" className={selectClass} value={resolution} onChange={e => setResolution(e.target.value)}><option value="all">全部分辨率</option>{["1k", "2k", "4k"].map(id => <option key={id} value={id}>{id.toUpperCase()}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">比例<select aria-label="比例" className={selectClass} value={ratio} onChange={e => setRatio(e.target.value)}><option value="all">全部比例</option>{Array.from(new Set(data.rows.map(row => row.ratio))).map(id => <option key={id} value={id}>{id}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">原生质量<select aria-label="原生质量" className={selectClass} value={quality} onChange={e => setQuality(e.target.value as Image25Quality | "all")}><option value="all">全部质量</option>{data.qualities.map(id => <option key={id} value={id}>{qualityNames[id]}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">显示币种<select aria-label="显示币种" className={selectClass} value={currency} onChange={e => setCurrency(e.target.value)}><option value="CNY">人民币 CNY</option><option value="USD">美元 USD</option></select></label>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600"><p>{model} · {tierNames[tier]} · {rows.length} 组规格 / {rows.length * qualities.length} 项价格 · 倍率固定 3</p><p>价格来源核查：{data.sourceCheckedAt} · 金额保留计算精度</p></div>
      {converted && data.conversion && <p className="text-sm text-slate-700">本表汇率：1 USD = {priceTableConversion("1", data.conversion).cny} CNY · {data.conversion.basis === "budget" ? "预算折算估计，非实际充值汇率" : "已生效换算配置"}</p>}
      <div className="max-h-[65vh] overflow-auto border border-slate-200" tabIndex={0} aria-label="可滚动的输出价与售价矩阵">
        <table className="w-full border-collapse text-right text-xs tabular-nums" aria-label="原生输出参考价与三倍售价">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700"><tr>
            <th rowSpan={2} className="whitespace-nowrap border-b border-slate-300 px-3 py-3 text-left">比例</th><th rowSpan={2} className="whitespace-nowrap border-b border-slate-300 px-3 py-3 text-left">分辨率</th><th rowSpan={2} className="whitespace-nowrap border-b border-slate-300 px-3 py-3 text-left">实际像素</th>
            {qualities.map(q => <th key={q} colSpan={2} className="border-b border-l border-slate-300 px-3 py-3 text-center">{qualityNames[q]}{q === "medium" ? "（现有质量上限）" : ""}</th>)}
          </tr><tr>{qualities.flatMap(q => [<th key={`${q}-output`} className="whitespace-nowrap border-b border-l border-slate-300 px-3 py-2 font-normal">输出参考价</th>, <th key={`${q}-sale`} className="whitespace-nowrap border-b border-slate-300 px-3 py-2">售价 ×3</th>])}</tr></thead>
          <tbody>{rows.map(row => <tr key={`${row.resolution}:${row.ratio}`} data-testid={`price-row-${row.resolution}-${row.ratio}`} className="border-b border-slate-200 even:bg-slate-50 hover:bg-slate-100">
            <th scope="row" className="whitespace-nowrap px-3 py-3 text-left font-medium">{row.ratio}</th><td className="whitespace-nowrap px-3 py-3 text-left">{row.resolution.toUpperCase()}</td><td className="whitespace-nowrap px-3 py-3 text-left text-slate-600">{row.pixels.replace("x", "×")}</td>
            {qualities.flatMap(q => { const cell = row.prices[q][tier]; const points = converted ? priceTableConversion(cell.saleUsd, data.conversion).credits : null; return [
              <td key={`${q}-output`} title={`输出 ${cell.outputTokens} tokens；不含输入`} className="whitespace-nowrap border-l border-slate-200 px-3 py-3 text-slate-600">{displayPrice(cell.outputUsd)}</td>,
              <td key={`${q}-sale`} title={`$${cell.outputUsd} × 3 = $${cell.saleUsd}`} className="whitespace-nowrap px-3 py-3 font-semibold">{displayPrice(cell.saleUsd)}{points !== null && <span className="mt-1 block font-normal text-slate-500">{points} 积分 / 张（参考）</span>}</td>,
            ]; })}
          </tr>)}</tbody>
        </table>
      </div>
      <section className="space-y-2 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-600">
        <p>高于 medium 的档位是原生能力参考，并未改变当前生图质量上限。若实际按 medium 执行，应采用 medium 的输出价 ×3，不能用请求的 high / max 档重复抬价。auto、自定义像素不猜固定报价。</p>
        <p>{data.conversionNotice}</p>
        {data.conversion && <p>换算依据：{data.conversion.evidence}；更新时间：{data.conversion.updatedAt}。{data.conversion.basis === "budget" ? "预算汇率：人民币金额为折算估计，非实际充值汇率。" : "人民币显示保留六位小数，积分按已有规则最终舍入。"}</p>}
        <p>售价减输出价不是实际利润；只有真实输入、输出及其他成本齐全后才能核算。原生 4K 是档位，1:1 对应 2880×2880，并非 4096×4096。</p>
        <p>来源：<a href={data.sourceUrls.pricing} target="_blank" rel="noreferrer" className="underline">APIMart 价格中心</a>　<a href={data.sourceUrls.native} target="_blank" rel="noreferrer" className="underline">原生参数与 token 矩阵</a>。Flare 与 Sunburst 共用此价格矩阵。</p>
      </section>
    </>}
  </main>;
}
