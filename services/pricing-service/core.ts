import { z } from "zod";
import { rounded } from "../../src/lib/billing/money";

export const QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const;
export const MODEL_IDS = ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-image-2.5-ext"] as const;
export const TIERS = ["gold", "platinum", "diamond", "site_official"] as const;
const decimal = z.string().regex(/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/);
const positive = decimal.refine(v => micros(v) > BigInt(0), "金额必须大于0");
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const ratesSchema = z.strictObject({ text_input_uncached: decimal, text_input_cached: decimal, image_input_uncached: decimal, image_input_cached: decimal, image_output: decimal });
const specSchema = z.strictObject({ resolution: z.enum(["1K", "2K", "4K"]), ratio: z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/), quality: z.enum(QUALITIES) });
export const quickPresetSchema = z.strictObject({
  publicId: id, label: z.string().trim().min(1).max(80), supplier: z.literal("apimart"),
  actualModel: z.enum(MODEL_IDS), upstreamVersion: z.enum(["flare", "sunburst"]).optional(),
  spec: specSchema, saleCny: decimal.optional(),
});
export type QuickPreset = z.infer<typeof quickPresetSchema>;
export const configSchema = z.strictObject({
  schemaVersion: z.literal(1), tier: z.enum(TIERS), multiplier: positive.refine(v => micros(v) <= BigInt(100000000), "倍率上限100"),
  fx: z.strictObject({ usdToCny: positive, basis: z.enum(["budget", "admin-rate", "recharge"]), evidence: z.string().trim().min(1).max(300) }),
  qualityPolicy: z.enum(["full", "cap-medium"]),
  creditConversion: z.strictObject({ creditsPerCny: positive, rounding: z.enum(["ceil", "floor", "nearest"]) }).nullable(),
  aliases: z.array(z.strictObject({ publicId: id, label: z.string().trim().min(1).max(80), model: z.enum(MODEL_IDS), version: z.enum(["flare", "sunburst"]).optional(), enabled: z.boolean(), multiplier: positive.optional(), supplier: z.literal("apimart").optional(), quickSpec: specSchema.optional() })).min(1).max(30),
  nativeRates: z.record(z.enum(TIERS), ratesSchema),
  extPrices: z.record(z.enum(TIERS), z.strictObject({ "1K": decimal, "2K": decimal, "4K": decimal })),
  // Explicit manual unit sales are distinct from supplier procurement costs.
  fixedSales: z.record(z.string().max(200), decimal).default({}),
  note: z.string().max(1000),
}).superRefine((c, ctx) => {
  if (new Set(c.aliases.map(a => a.publicId)).size !== c.aliases.length) ctx.addIssue({ code: "custom", message: "公开模型ID重复", path: ["aliases"] });
  for (const [i, a] of Array.from(c.aliases.entries())) {
    if ((a.model === "gpt-image-2.5-ext") !== !!a.version) ctx.addIssue({ code: "custom", message: "仅EXT需要flare/sunburst版本", path: ["aliases", i, "version"] });
    if (a.multiplier && micros(a.multiplier) > BigInt(100000000)) ctx.addIssue({ code: "custom", message: "独立倍率上限100", path: ["aliases", i, "multiplier"] });
  }
  if (!c.aliases.some(a => a.enabled)) ctx.addIssue({ code: "custom", message: "至少启用一个模型" });
});
export type PricingConfig = z.infer<typeof configSchema>;
export type Catalog = {
  sources: Record<string, string>; checked_date: string;
  native: { models: string[]; usd_per_million_tokens: PricingConfig["nativeRates"]; output_reference_matrix: { size: string; resolution: string; pixels: string; qualities: Record<string, { output_tokens_reference: number }> }[] };
  ext: { versions: string[]; parameters: { size: { enum: string[] } }; rollout_notice: string; prices_per_successfully_delivered_image: Record<string, Record<string, { usd_per_image_derived_from_site_credit_ratio: string }>> };
};
export function initialConfig(catalog: Catalog): PricingConfig {
  return configSchema.parse({ schemaVersion: 1, tier: "gold", multiplier: "3", fx: { usdToCny: "7", basis: "budget", evidence: "2026-10-08 售价表展示假设，未核验充值成本" },
    qualityPolicy: "full", creditConversion: null,
    aliases: [
      { publicId: "gpt-image2.5", label: "灵动2.5", model: "gpt-image-2.5-flare", enabled: true },
      { publicId: "image25-sunburst", label: "原生 Sunburst", model: "gpt-image-2.5-sunburst", enabled: true },
      { publicId: "image25-ext-flare", label: "EXT Flare", model: "gpt-image-2.5-ext", version: "flare", enabled: true },
      { publicId: "image25-ext-sunburst", label: "EXT Sunburst", model: "gpt-image-2.5-ext", version: "sunburst", enabled: true },
    ], nativeRates: catalog.native.usd_per_million_tokens,
    extPrices: Object.fromEntries(TIERS.map(t => [t, Object.fromEntries(["1K", "2K", "4K"].map(r => [r, catalog.ext.prices_per_successfully_delivered_image[r][t].usd_per_image_derived_from_site_credit_ratio]))])),
    fixedSales: {}, note: "独立验收，不接生产扣费。原生表仅输出部分，EXT账号升级待确认。" });
}
export type Rational = { n: bigint; d: bigint };
const MICRO = BigInt(1000000);
export function micros(s: string): bigint {
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(s)) throw new Error("十进制金额格式无效（最多6位小数）");
  const [i, f = ""] = s.split("."); return BigInt(i) * MICRO + BigInt(f.padEnd(6, "0"));
}
const money = (s: string): Rational => ({ n: micros(s), d: MICRO });
const add = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const mul = (a: Rational, b: Rational): Rational => ({ n: a.n * b.n, d: a.d * b.d });
export function decimalString(a: Rational, places = 9): string {
  const scale = BigInt("1" + "0".repeat(places)), n = rounded(a.n * scale, a.d, "nearest");
  return `${n / scale}.${(n % scale).toString().padStart(places, "0")}`;
}
export function exactReceipt(a: Rational) { return { numerator: a.n.toString(), denominator: a.d.toString() }; }
const usageSchema = z.strictObject(Object.fromEntries(["textInput", "cachedTextInput", "imageInput", "cachedImageInput", "imageOutput"].map(k => [k, z.number().int().min(0).max(1000000000)])) as {
  textInput: z.ZodNumber; cachedTextInput: z.ZodNumber; imageInput: z.ZodNumber; cachedImageInput: z.ZodNumber; imageOutput: z.ZodNumber;
});
export const quoteSchema = z.strictObject({
  publicId: id, resolution: z.enum(["1K", "2K", "4K"]), ratio: z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/),
  quality: z.enum([...QUALITIES, "auto"]), quantity: z.number().int().min(1).max(4).default(1),
  usage: usageSchema.optional(), reportedTotalUsd: decimal.optional(),
});
export type QuoteRequest = z.infer<typeof quoteSchema>;
export function quoteKey(r: Pick<QuoteRequest, "publicId" | "resolution" | "ratio" | "quality">) { return `${r.publicId}|${r.resolution}|${r.ratio}|${r.quality}`; }
export function validateConfig(value: unknown, catalog: Catalog): PricingConfig {
  const c = configSchema.parse(value);
  for (const alias of c.aliases) {
    if (!catalog.native.models.includes(alias.model) && alias.model !== "gpt-image-2.5-ext") throw new Error("目录中不存在实际模型");
    if (alias.version && !catalog.ext.versions.includes(alias.version)) throw new Error("目录中不存在EXT版本");
    if (alias.quickSpec && alias.enabled) price(c, catalog, { publicId: alias.publicId, ...alias.quickSpec, quantity: 1 });
  }
  for (const key of Object.keys(c.fixedSales)) {
    const [publicId, resolution, ratio, quality, extra] = key.split("|");
    const alias = c.aliases.find(a => a.publicId === publicId);
    if (!alias || extra || !["1K", "2K", "4K"].includes(resolution) || !QUALITIES.includes(quality as any)) throw new Error(`固定售价规格无效：${key}`);
    if (alias.model.endsWith("-ext") ? !catalog.ext.parameters.size.enum.includes(ratio) : !catalog.native.output_reference_matrix.some(r => r.size === ratio && r.resolution.toUpperCase() === resolution)) throw new Error(`模型不支持此售价规格：${key}`);
  }
  return c;
}
/** Quick MVP uses the same versioned configuration and exact pricing engine. */
export function prepareQuickPreset(config: PricingConfig, catalog: Catalog, input: unknown) {
  const preset = quickPresetSchema.parse(input);
  if ((preset.actualModel === "gpt-image-2.5-ext") !== !!preset.upstreamVersion) throw new Error("仅EXT需要flare/sunburst版本");
  const next = structuredClone(config);
  const alias: PricingConfig["aliases"][number] = { publicId: preset.publicId, label: preset.label, supplier: preset.supplier,
    model: preset.actualModel, ...(preset.upstreamVersion ? { version: preset.upstreamVersion } : {}), enabled: true, multiplier: "3", quickSpec: preset.spec };
  const index = next.aliases.findIndex(a => a.publicId === preset.publicId);
  if (index < 0) next.aliases.push(alias); else next.aliases[index] = alias;
  // Replacing an alias must not inherit stale fixed prices from its previous supplier/model.
  for (const key of Object.keys(next.fixedSales)) if (key.startsWith(preset.publicId + "|")) delete next.fixedSales[key];
  validateConfig(next, catalog);
  const request = { publicId: preset.publicId, ...preset.spec, quantity: 1 };
  const suggestion = price(next, catalog, request);
  if (preset.saleCny !== undefined) {
    const quality = suggestion.effective.quality || preset.spec.quality;
    next.fixedSales[quoteKey({ ...request, quality: quality as any })] = preset.saleCny;
  }
  validateConfig(next, catalog);
  return { config: next, preset, preview: { ...price(next, catalog, request), suggestedSaleCny: suggestion.saleCny,
    supplier: "apimart", catalogDate: catalog.checked_date, sources: catalog.sources, tier: next.tier,
    outputUnit: preset.actualModel.endsWith("-ext") ? "元/交付张（包价）" : "元/张（输出参考估计）", simulated: true, productionApplied: false } };
}
/** Pure engine: no fetch, credentials, wallet mutation, DB or configuration globals. */
export function price(config: PricingConfig, catalog: Catalog, input: unknown) {
  const r = quoteSchema.parse(input), alias = config.aliases.find(a => a.publicId === r.publicId && a.enabled);
  if (!alias) throw new Error("该公开模型未启用或不存在");
  const ext = alias.model === "gpt-image-2.5-ext";
  const effectiveQuality = ext ? null : config.qualityPolicy === "cap-medium" ? (r.quality === "low" ? "low" : "medium") : r.quality;
  const matrix = catalog.native.output_reference_matrix.find(m => m.size === r.ratio && m.resolution.toUpperCase() === r.resolution);
  if (ext ? !catalog.ext.parameters.size.enum.includes(r.ratio) : !matrix) throw new Error("该模型不支持所选比例/分辨率");
  const q = effectiveQuality === "auto" ? "max" : effectiveQuality;
  let cost: Rational | null = null, source = "pending", scope = "unknown", referenceTokens: number | null = null;
  if (r.reportedTotalUsd !== undefined) { cost = money(r.reportedTotalUsd); source = "reported-test-input"; scope = "full-call"; }
  else if (ext) { cost = mul(money(config.extPrices[config.tier][r.resolution]), { n: BigInt(r.quantity), d: BigInt(1) }); source = "catalog-bundle-estimate"; scope = "full-call-estimate"; }
  else if (r.usage) {
    const rates = config.nativeRates[config.tier];
    const dims = ["textInput", "cachedTextInput", "imageInput", "cachedImageInput", "imageOutput"] as const;
    const keys = ["text_input_uncached", "text_input_cached", "image_input_uncached", "image_input_cached", "image_output"] as const;
    cost = { n: BigInt(0), d: BigInt(1) };
    for (let i = 0; i < dims.length; i++) cost = add(cost, mul(money(rates[keys[i]]), { n: BigInt(r.usage[dims[i]]), d: MICRO }));
    source = "usage-estimate"; scope = "full-call-estimate";
  } else if (matrix && q) {
    referenceTokens = matrix.qualities[q].output_tokens_reference * r.quantity;
    cost = mul(money(config.nativeRates[config.tier].image_output), { n: BigInt(referenceTokens), d: MICRO }); source = "output-reference-estimate"; scope = "output-only";
  }
  const cny = cost && mul(cost, money(config.fx.usdToCny)), multiplier = alias.multiplier || config.multiplier;
  const fixed = config.fixedSales[quoteKey({ ...r, quality: (effectiveQuality || r.quality) as any })];
  const sale = fixed !== undefined ? mul(money(fixed), { n: BigInt(r.quantity), d: BigInt(1) }) : cny && mul(cny, money(multiplier));
  const profit = sale && cny ? { n: sale.n * cny.d - cny.n * sale.d, d: sale.d * cny.d } : null;
  const credits = sale && config.creditConversion ? rounded(sale.n * micros(config.creditConversion.creditsPerCny), sale.d * MICRO, config.creditConversion.rounding).toString() : null;
  return {
    publicId: alias.publicId, label: alias.label, actualModel: alias.model, upstreamVersion: alias.version || null,
    requested: r, effective: { resolution: ext ? r.resolution : r.resolution.toLowerCase(), size: r.ratio, ...(effectiveQuality ? { quality: effectiveQuality } : {}) },
    costSource: source, costScope: scope, status: cost ? "estimated" : "pending", referenceTokens,
    costUsd: cost ? decimalString(cost) : null, costCny: cny ? decimalString(cny) : null,
    costUsdExact: cost ? exactReceipt(cost) : null, costCnyExact: cny ? exactReceipt(cny) : null,
    multiplier, saleCny: sale ? decimalString(sale) : null, pricingMode: fixed !== undefined ? "fixed-unit" : "cost-plus",
    saleExact: sale ? exactReceipt(sale) : null, credits, fx: config.fx,
    profitCny: profit ? (profit.n < BigInt(0) ? "-" + decimalString({ n: -profit.n, d: profit.d }) : decimalString(profit)) : null,
    profitLabel: "售价减API成本", profitFinal: false, supplierCostVerified: false,
    warnings: [scope === "output-only" ? "只包含输出；输入费用未齐，不是完整调用报价" : "", config.fx.basis === "budget" ? "人民币使用预算汇率，折算估计" : "", effectiveQuality === "auto" ? "auto展示max预留估计；实际档位待返回" : "", ext ? catalog.ext.rollout_notice : "", !config.creditConversion ? "积分兑换未配置" : "", r.reportedTotalUsd !== undefined ? "费用为手工试算输入，未与供应商账单核验" : ""].filter(Boolean),
  };
}
export function matrix(config: PricingConfig, catalog: Catalog, publicId: string, resolution?: string) {
  const alias = config.aliases.find(a => a.publicId === publicId && a.enabled);
  if (!alias) throw new Error("公开模型不存在或已停用");
  const ext = alias.model.endsWith("-ext");
  const specs = ext ? ["1K", "2K", "4K"].flatMap(r => catalog.ext.parameters.size.enum.filter(v => v !== "auto").map(ratio => ({ resolution: r, ratio, pixels: null }))) : catalog.native.output_reference_matrix.map(r => ({ resolution: r.resolution.toUpperCase(), ratio: r.size, pixels: r.pixels }));
  return specs.filter(s => !resolution || s.resolution === resolution).map(s => ({ ...s, cells: Object.fromEntries(QUALITIES.map(quality => [quality, price(config, catalog, { publicId, resolution: s.resolution, ratio: s.ratio, quality, quantity: 1 })])) }));
}
