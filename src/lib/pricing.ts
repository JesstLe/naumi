import "server-only";

/**
 * 管理员内部的「积分」定价数据（语言中立：只放数字，文案在页面字典里）。
 *
 * 数字来源：2026-10-02《Naumi竞品锚定豆定价.xlsx》与配套决策稿。
 * 展示名称统一为积分，数值保持报告原口径，不将跨平台单位视为等值。
 * 仅供管理员后台调研展示；实际扣费仍由 QUALITY_CREDITS 管理。
 * Token质量路线与EXT按张路线必须分开，不能互换成本或模型名。
 */

/** 积分套餐：套餐决定积分单价。 */
export type PricingPackage = {
  id: string;
  /** monthly = 连续包月；yearly = 年付、按月发放、不自动续订 */
  kind: "monthly" | "yearly";
  /** 实付人民币元 */
  priceYuan: number;
  /** 套期内积分总量（年包为 12 个月合计） */
  credits: number;
  /** 每月发放的积分数 */
  monthlyCredits: number;
  /** 是否推荐 */
  highlighted?: boolean;
};

export type ResolutionKey = "1k" | "2k" | "4k" | "flat";

/** 单图档位：模型 × 分辨率决定一张扣几积分。 */
export type ImageTier = {
  id: string;
  model: string;
  rows: { resolution: ResolutionKey; credits: number }[];
};

/** 套图：图像费 + 编排费分开列示，便于部分失败时按张结算。 */
export type SuiteBundle = {
  id: string;
  images: number;
  /** 每张图像扣积分 */
  imageCreditsEach: number;
  /** 整套编排扣积分 */
  orchestrationCredits: number;
};

export const PRICING_PACKAGES: PricingPackage[] = [
  {
    id: "trial-monthly",
    kind: "monthly",
    priceYuan: 29,
    credits: 190,
    monthlyCredits: 190,
  },
  {
    id: "standard-monthly",
    kind: "monthly",
    priceYuan: 99,
    credits: 775,
    monthlyCredits: 775,
    highlighted: true,
  },
  {
    id: "bulk-monthly",
    kind: "monthly",
    priceYuan: 299,
    credits: 2500,
    monthlyCredits: 2500,
  },
  {
    id: "team-yearly",
    kind: "yearly",
    priceYuan: 1099,
    credits: 12000,
    monthlyCredits: 1000,
  },
  {
    id: "volume-yearly",
    kind: "yearly",
    priceYuan: 4499,
    credits: 60000,
    monthlyCredits: 5000,
  },
];

export const IMAGE_TIERS: ImageTier[] = [
  {
    id: "swift",
    model: "GPT 2 EXT",
    rows: [
      { resolution: "1k", credits: 1.7 },
      { resolution: "2k", credits: 2.55 },
      { resolution: "4k", credits: 3.7 },
    ],
  },
  {
    id: "standard",
    model: "Nano Banana 2 EXT",
    rows: [
      { resolution: "1k", credits: 3 },
      { resolution: "2k", credits: 4 },
      { resolution: "4k", credits: 5 },
    ],
  },
  {
    id: "flagship",
    model: "Nano Banana Pro EXT",
    rows: [
      { resolution: "1k", credits: 5 },
      { resolution: "2k", credits: 5 },
      { resolution: "4k", credits: 6 },
    ],
  },
  {
    id: "batch",
    model: "Seedream 5.0 Flash",
    rows: [{ resolution: "flat", credits: 2 }],
  },
];

export const RESEARCH_DATE = "2026-10-02";
export const QUALITY_MODELS = [
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
] as const;
export const RESEARCH_QUALITIES = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ResearchQuality = (typeof RESEARCH_QUALITIES)[number];
export type QualityQuote = {
  resolution: "1k" | "2k" | "4k";
  pixels: string;
  quality: ResearchQuality;
  targetCredits: number;
  variableCostYuan: number;
  minimumCredits: number;
  protectedCredits: number;
};

// 来源：质量定价!F/I/L/N，第7至35行flare记录。sunburst对应记录相同。
// 最低与35%情景按4499/60000元每积分计算；并非已启用的固定单张价。
export const QUALITY_QUOTES: QualityQuote[] = [
  {
    resolution: "1k",
    pixels: "1024×1024",
    quality: "low",
    targetCredits: 1,
    variableCostYuan: 0.0814190776832,
    minimumCredits: 1.1,
    protectedCredits: 1.69,
  },
  {
    resolution: "1k",
    pixels: "1024×1024",
    quality: "medium",
    targetCredits: 1,
    variableCostYuan: 0.1259223016088,
    minimumCredits: 1.69,
    protectedCredits: 2.61,
  },
  {
    resolution: "1k",
    pixels: "1024×1024",
    quality: "high",
    targetCredits: 2,
    variableCostYuan: 0.3671187868352,
    minimumCredits: 4.93,
    protectedCredits: 7.61,
  },
  {
    resolution: "1k",
    pixels: "1024×1024",
    quality: "xhigh",
    targetCredits: 4,
    variableCostYuan: 0.6172891731824,
    minimumCredits: 8.29,
    protectedCredits: 12.79,
  },
  {
    resolution: "1k",
    pixels: "1024×1024",
    quality: "max",
    targetCredits: 9,
    variableCostYuan: 1.3319047277408,
    minimumCredits: 17.87,
    protectedCredits: 27.59,
  },
  {
    resolution: "2k",
    pixels: "2048×2048",
    quality: "low",
    targetCredits: 1,
    variableCostYuan: 0.1182303863624,
    minimumCredits: 1.59,
    protectedCredits: 2.45,
  },
  {
    resolution: "2k",
    pixels: "2048×2048",
    quality: "medium",
    targetCredits: 1,
    variableCostYuan: 0.2088851017664,
    minimumCredits: 2.81,
    protectedCredits: 4.33,
  },
  {
    resolution: "2k",
    pixels: "2048×2048",
    quality: "high",
    targetCredits: 5,
    variableCostYuan: 0.6989699874656,
    minimumCredits: 9.38,
    protectedCredits: 14.48,
  },
  {
    resolution: "2k",
    pixels: "2048×2048",
    quality: "xhigh",
    targetCredits: 8,
    variableCostYuan: 1.2071858162456,
    minimumCredits: 16.2,
    protectedCredits: 25,
  },
  {
    resolution: "2k",
    pixels: "2048×2048",
    quality: "max",
    targetCredits: 18,
    variableCostYuan: 2.6593095302624,
    minimumCredits: 35.68,
    protectedCredits: 55.08,
  },
  {
    resolution: "4k",
    pixels: "2880×2880",
    quality: "low",
    targetCredits: 1,
    variableCostYuan: 0.1662132862328,
    minimumCredits: 2.24,
    protectedCredits: 3.45,
  },
  {
    resolution: "4k",
    pixels: "2880×2880",
    quality: "medium",
    targetCredits: 2,
    variableCostYuan: 0.3171213377336,
    minimumCredits: 4.26,
    protectedCredits: 6.57,
  },
  {
    resolution: "4k",
    pixels: "2880×2880",
    quality: "high",
    targetCredits: 8,
    variableCostYuan: 1.131548649656,
    minimumCredits: 15.19,
    protectedCredits: 23.44,
  },
  {
    resolution: "4k",
    pixels: "2880×2880",
    quality: "xhigh",
    targetCredits: 14,
    variableCostYuan: 1.9761942000464,
    minimumCredits: 26.52,
    protectedCredits: 40.93,
  },
  {
    resolution: "4k",
    pixels: "2880×2880",
    quality: "max",
    targetCredits: 30,
    variableCostYuan: 4.3894410381848,
    minimumCredits: 58.9,
    protectedCredits: 90.9,
  },
];

/** 测算保持未舍入的套餐积分单价，最终积分只向上取整到0.01。 */
export function budgetCredits(
  costYuan: number,
  pkg: PricingPackage,
  margin = 0.35,
): number {
  return (
    Math.ceil(
      (costYuan / (1 - 0.006 - margin) / (pkg.priceYuan / pkg.credits)) * 100,
    ) / 100
  );
}

export const SUITE_BUNDLES: SuiteBundle[] = [
  { id: "suite-7", images: 7, imageCreditsEach: 4, orchestrationCredits: 4.6 },
  {
    id: "suite-13",
    images: 13,
    imageCreditsEach: 4,
    orchestrationCredits: 9.2,
  },
];

/** 参考折算使用的套餐：常用月包（99 元 / 775 积分）。 */
export const REFERENCE_PACKAGE_ID = "standard-monthly";

export function getReferencePackage(): PricingPackage {
  return (
    PRICING_PACKAGES.find((p) => p.id === REFERENCE_PACKAGE_ID) ??
    PRICING_PACKAGES[0]
  );
}

/** 积分 → 人民币（按某套餐的积分单价折算），保留两位小数。 */
export function yuanFromCredits(credits: number, pkg: PricingPackage): number {
  return Math.round(credits * (pkg.priceYuan / pkg.credits) * 100) / 100;
}

/** 积分单价（元/积分），保留三位小数。 */
export function yuanPerCredit(pkg: PricingPackage): number {
  return Math.round((pkg.priceYuan / pkg.credits) * 1000) / 1000;
}

/** 每月积分全部用于均衡档 2K（4 积分/张）时约可出的张数。 */
export function monthlyStandard2KImages(pkg: PricingPackage): number {
  return Math.floor(pkg.monthlyCredits / 4);
}

/** 展示积分数：整数不带小数，小数最多保留两位。 */
export function formatCredits(credits: number): string {
  return Number(credits.toFixed(2)).toString();
}

/** 展示人民币：去掉多余的小数零（4.16 → "4.16"，7.80 → "7.8"）。 */
export function formatYuan(yuan: number): string {
  return yuan.toFixed(2).replace(/\.?0+$/, "");
}

/** Confidential report context; never embed it in public JavaScript chunks. */
export const RESEARCH_NOTES = [
  [
    "测算按最低套餐单价4499元/60000积分，含0.6%收款费，向上取整至0.01积分。35%是报告中的可选贡献率情景，尚未选定为售价。",
    "Estimates use ¥4499 / 60,000 credits, include a 0.6% payment fee and round credits up to 0.01. The optional 35% contribution scenario has not been adopted as a price."
  ],
  [
    "最低单价年包下，报告的30个质量情景均为负贡献。例如4K*超高目标14积分，成本约1.976元/张，不亏测算26.52积分。模型名称相似不代表与竞品同等效果。",
    "All 30 quality scenarios have negative contribution at the lowest annual unit price. 4K* extra high targets 14 credits, estimated cost ¥1.976/image, break-even 26.52 credits. Similar names do not prove equivalent results."
  ],
  [
    "基准为1000文本输入token、无参考图、每次1张。文本输入$4/M、图像输入$6.4/M、图像输出$24/M；实际usage、参考图、搜索、审核和重抽会改变费用。",
    "Baseline: 1,000 text input tokens, no references, one output. Text input $4/M, image input $6.4/M, image output $24/M. Actual usage, references, search, moderation and retries change costs."
  ],
  [
    "规划假设：汇率6.7351，结算缓冲3%，每成功张额外付费重抽0.10次，运行及存储传输0.015元/张。贡献率未扣固定运维、人工、税费和获客。",
    "Assumptions: USD/CNY 6.7351, 3% settlement buffer, 0.10 extra paid retries per successful image, ¥0.015/image operation and storage. Contribution excludes fixed operation, labor, tax and acquisition."
  ]
] as const;
