/**
 * 客户可见的「积分」定价数据（语言中立：只放数字，文案在页面字典里）。
 *
 * 数字来源：2026-10-02《Naumi 竞品锚定积分定价》决策稿
 * （Naumi竞品锚定积分定价.xlsx / Naumi竞品锚定积分套餐决策稿.docx）。
 * 状态：待负责人最终审核；调价只改本文件，页面自动同步。
 *
 * 内部备注（不得渲染到页面）：
 * - 当前上游按张接口无独立 quality 参数，因此只按「模型 × 分辨率」计价，
 *   销售页不出现低／中／高等质量档；接入支持质量参数的供应商后再扩展。
 * - GPT Image 2.5 档为低价候选，与竞品的质量对齐尚未实测验证。
 * - Seedream 4.5（3 积分/张）毛利过薄，仅限量测试，暂不进销售页。
 * - 套餐条款（连续包月、年包按月发放、当期未用不结转、折扣不叠加）
 *   为拟定条款，正式上线前需再次确认。
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
  { id: "trial-monthly", kind: "monthly", priceYuan: 29, credits: 190, monthlyCredits: 190 },
  { id: "standard-monthly", kind: "monthly", priceYuan: 99, credits: 775, monthlyCredits: 775, highlighted: true },
  { id: "bulk-monthly", kind: "monthly", priceYuan: 299, credits: 2500, monthlyCredits: 2500 },
  { id: "team-yearly", kind: "yearly", priceYuan: 1099, credits: 12000, monthlyCredits: 1000 },
  { id: "volume-yearly", kind: "yearly", priceYuan: 4499, credits: 60000, monthlyCredits: 5000 },
];

export const IMAGE_TIERS: ImageTier[] = [
  {
    id: "swift",
    rows: [
      { resolution: "1k", credits: 1.7 },
      { resolution: "2k", credits: 2.55 },
      { resolution: "4k", credits: 3.7 },
    ],
  },
  {
    id: "standard",
    rows: [
      { resolution: "1k", credits: 3 },
      { resolution: "2k", credits: 4 },
      { resolution: "4k", credits: 5 },
    ],
  },
  {
    id: "flagship",
    rows: [
      { resolution: "1k", credits: 5 },
      { resolution: "2k", credits: 5 },
      { resolution: "4k", credits: 6 },
    ],
  },
  {
    id: "batch",
    rows: [{ resolution: "flat", credits: 2 }],
  },
];

export const SUITE_BUNDLES: SuiteBundle[] = [
  { id: "suite-7", images: 7, imageCreditsEach: 4, orchestrationCredits: 4.6 },
  { id: "suite-13", images: 13, imageCreditsEach: 4, orchestrationCredits: 9.2 },
];

/** 参考折算使用的套餐：常用月包（99 元 / 775 积分）。 */
export const REFERENCE_PACKAGE_ID = "standard-monthly";

export function getReferencePackage(): PricingPackage {
  return (
    PRICING_PACKAGES.find((p) => p.id === REFERENCE_PACKAGE_ID) ?? PRICING_PACKAGES[0]
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
