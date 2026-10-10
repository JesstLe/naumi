import reference from "../../../docs/apimart-image25-pricing-20261008.json";

// This is a selling-price reference, not the procurement or live billing rule.
export const IMAGE25_SALE_MULTIPLIER = 3;
export const IMAGE25_QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const;
export const IMAGE25_TIERS = ["gold", "platinum", "diamond", "site_official"] as const;
export type Image25Tier = (typeof IMAGE25_TIERS)[number];
export type Image25Quality = (typeof IMAGE25_QUALITIES)[number];
export const IMAGE25_NATIVE_MODELS = ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"] as const;
const NANO = BigInt(1_000_000_000), MICRO = BigInt(1_000_000);

/** Exact decimal parsing: no Number/parseFloat in monetary arithmetic. */
export function usdNanos(value: string): bigint {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,9})?$/.test(value)) throw new Error("美元金额格式无效");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * NANO + BigInt(fraction.padEnd(9, "0"));
}
function positiveMicros(value: string): bigint {
  if (!/^[1-9]\d{0,14}$/.test(value)) throw new Error("换算参数无效");
  return BigInt(value);
}
export function decimalNanos(value: bigint): string {
  if (value < BigInt(0)) throw new Error("金额不能为负数");
  const fraction = (value % NANO).toString().padStart(9, "0").replace(/0+$/, "");
  return `${value / NANO}${fraction ? "." + fraction : ""}`;
}
function round(n: bigint, d: bigint, mode: "ceil" | "nearest" | "floor") {
  return mode === "ceil" ? (n + d - BigInt(1)) / d : mode === "nearest" ? (n + d / BigInt(2)) / d : n / d;
}
export type TableConversion = {
  rateMicros: string;
  basis: "recharge" | "admin-rate" | "budget";
  evidence: string;
  updatedAt: string;
  creditsPerCnyMicros?: string;
  rounding?: "ceil" | "nearest" | "floor";
  modelVersion: number;
  referenceOnly?: boolean;
};
// A visible fallback only for reference-table conversion. It is explicitly a
// budget estimate until an administrator publishes a recharge or admin rate.
export const IMAGE25_BUDGET_FX: TableConversion = {
  rateMicros: "7000000",
  basis: "budget",
  evidence: "预算换算：1 USD = 7.000000 CNY（待管理员核验）",
  updatedAt: "2026-10-08T00:00:00Z",
  modelVersion: 1,
  referenceOnly: true,
};
export function validTableConversion(value: TableConversion | null | undefined): TableConversion | null {
  if (!value || !value.evidence.trim() || !Number.isSafeInteger(value.modelVersion) || value.modelVersion < 1 || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  try { positiveMicros(value.rateMicros); } catch { return null; }
  if (!["recharge", "admin-rate", "budget"].includes(value.basis)) return null;
  const result = { ...value };
  try { positiveMicros(result.creditsPerCnyMicros || ""); } catch { delete result.creditsPerCnyMicros; }
  if (!["ceil", "floor", "nearest"].includes(result.rounding || "")) delete result.rounding;
  return result;
}
/** Convert and finally round once. A six-place display must not feed points. */
export function priceTableConversion(usd: string, conversion?: TableConversion | null, quantity = 1) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error("数量无效");
  const c = validTableConversion(conversion);
  if (!c) return { cny: null, credits: null };
  const n = usdNanos(usd) * positiveMicros(c.rateMicros) * BigInt(quantity);
  const den = NANO * MICRO;
  const displayMicros = round(n * MICRO, den, "nearest");
  const cny = `${displayMicros / MICRO}.${(displayMicros % MICRO).toString().padStart(6, "0")}`;
  const credits = c.creditsPerCnyMicros && c.rounding
    ? round(n * positiveMicros(c.creditsPerCnyMicros), den * MICRO, c.rounding).toString()
    : null;
  return { cny, credits };
}
export type Image25PriceCell = { outputTokens: number; outputUsd: string; saleUsd: string };
export type Image25PriceRow = {
  ratio: string; resolution: "1k" | "2k" | "4k"; pixels: string;
  prices: Record<Image25Quality, Record<Image25Tier, Image25PriceCell>>;
};
export function buildImage25PriceTable(): Image25PriceRow[] {
  const seen = new Set<string>();
  if (reference.native.output_reference_matrix.length !== 45) throw new Error("价格矩阵不完整");
  return reference.native.output_reference_matrix.map(row => {
    if (!["1k", "2k", "4k"].includes(row.resolution) || seen.has(`${row.resolution}:${row.size}`)) throw new Error("价格矩阵规格无效");
    seen.add(`${row.resolution}:${row.size}`);
    const prices = {} as Image25PriceRow["prices"];
    for (const quality of IMAGE25_QUALITIES) {
      const source = row.qualities[quality];
      if (!Number.isSafeInteger(source.output_tokens_reference) || source.output_tokens_reference <= 0) throw new Error("输出 token 无效");
      prices[quality] = {} as Record<Image25Tier, Image25PriceCell>;
      for (const tier of IMAGE25_TIERS) {
        const rate = usdNanos(reference.native.usd_per_million_tokens[tier].image_output);
        const numerator = BigInt(source.output_tokens_reference) * rate;
        if (numerator % MICRO !== BigInt(0)) throw new Error("价格精度不足，禁止截断");
        const output = numerator / MICRO;
        if (output !== usdNanos(source.output_only_usd_estimate[tier])) throw new Error("输出参考价格与原始单价不符");
        prices[quality][tier] = {
          outputTokens: source.output_tokens_reference,
          outputUsd: decimalNanos(output),
          saleUsd: decimalNanos(output * BigInt(IMAGE25_SALE_MULTIPLIER)),
        };
      }
    }
    return { ratio: row.size, resolution: row.resolution as Image25PriceRow["resolution"], pixels: row.pixels, prices };
  });
}
export function image25TablePayload(conversion: TableConversion | null = null, conversionNotice = "") {
  const validated = validTableConversion(conversion);
  const rows = buildImage25PriceTable().map(row => ({ ...row,
    prices: Object.fromEntries(IMAGE25_QUALITIES.map(q => [q, Object.fromEntries(IMAGE25_TIERS.map(tier => {
      const cell = row.prices[q][tier];
      return [tier, { ...cell, outputCny: priceTableConversion(cell.outputUsd, validated).cny, saleCny: priceTableConversion(cell.saleUsd, validated).cny }];
    }))])) as Record<Image25Quality, Record<Image25Tier, Image25PriceCell & { outputCny: string | null; saleCny: string | null }>>,
  }));
  return {
    schemaVersion: 2,
    displayCurrency: "CNY" as const,
    sourceCheckedAt: reference.checked_date,
    sourceUrls: { pricing: reference.sources.pricing, native: reference.sources.native },
    models: IMAGE25_NATIVE_MODELS, qualities: IMAGE25_QUALITIES, tiers: IMAGE25_TIERS,
    multiplier: IMAGE25_SALE_MULTIPLIER, pricingBasis: "native-output-reference" as const,
    liveBillingChanged: false, accountTierVerified: false,
    conversion: validated, conversionNotice,
    rows,
  };
}
export type Image25TablePayload = ReturnType<typeof image25TablePayload>;
