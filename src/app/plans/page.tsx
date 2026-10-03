import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Coins,
  ImageIcon,
  ShieldCheck,
  Layers,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { BRAND } from "@/lib/brand";
import { editionName } from "@/lib/edition";
import { getSitePage } from "@/lib/settings";
import { CustomPage } from "@/components/custom-page";
import { publicCommerceEnabled } from "@/lib/commerce";
import {
  PRICING_PACKAGES,
  IMAGE_TIERS,
  SUITE_BUNDLES,
  getReferencePackage,
  yuanFromCredits,
  yuanPerCredit,
  monthlyStandard2KImages,
  formatCredits,
  formatYuan,
  type ResolutionKey,
} from "@/lib/pricing";

export const metadata = { title: `定价 — ${BRAND}` };

// 客户可见定价页（积分计价）。云版渲染本页；自部署实例仍渲染站长自定义「定价」页。
// 数字全部来自 src/lib/pricing.ts（2026-10-02 决策稿），本文件只放文案与排版。

type Copy = {
  draftNotice: string;
  kicker: string;
  title: string;
  intro: string;
  mechanicsLabel: string;
  mechanics: { icon: LucideIcon; title: string; desc: string }[];
  plansLabel: string;
  plansSub: string;
  planNames: Record<string, string>;
  perMonth: string;
  perYear: string;
  creditsPerMonth: (n: string) => string;
  creditsMonthlyGrant: (perMonth: string, total: string) => string;
  creditUnitPrice: (n: string) => string;
  fullUse: (n: number) => string;
  fullUseMonthly: (n: number) => string;
  recommended: string;
  plansFootnote: string;
  tiersLabel: string;
  tiersSub: string;
  tierNames: Record<string, string>;
  tierTaglines: Record<string, string>;
  resolutionLabels: Record<ResolutionKey, string>;
  referencePrice: (from: string, to: string) => string;
  suitesLabel: string;
  suitesSub: string;
  suiteNames: Record<string, string>;
  suiteBasis: string;
  imageFee: (images: number, each: number, total: string) => string;
  orchestrationFee: (n: string) => string;
  total: (n: string) => string;
  suiteReference: (n: string) => string;
  rulesLabel: string;
  rules: string[];
  faqLabel: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  currencyNote: string;
};

const zh: Copy = {
  draftNotice: "以下是待审核的积分定价参考方案，并非当前充值或扣费标准。内测实际消耗以生成前提示和积分使用记录为准。",
  kicker: "定价",
  title: "积分方案参考",
  intro:
    "充值获得积分即可出图：套餐决定一积分多少钱，模型与分辨率决定一张扣几积分。每次生成前，界面都会先显示本次扣积分数量，确认后才开始执行；生成失败自动退积分。",
  mechanicsLabel: "怎么计费",
  mechanics: [
    {
      icon: Coins,
      title: "套餐定积分价",
      desc: "五档套餐，积分单价最低 0.075 元；买得越多，一积分越便宜。",
    },
    {
      icon: ImageIcon,
      title: "按张扣积分",
      desc: "一张图一笔账：按你选择的模型与分辨率扣积分，当前内测使用整数积分，小数价目仅供方案评审。",
    },
    {
      icon: ShieldCheck,
      title: "失败不白花钱",
      desc: "系统失败、无产出自动全额退积分；套图部分失败按成功张数结算。",
    },
  ],
  plansLabel: "充值套餐",
  plansSub:
    "月包连续订阅、可随时取消；年包一次性预付、按月发放、到期不自动续订。当期未用完的积分不结转，请按用量选择。",
  planNames: {
    "trial-monthly": "体验月包",
    "standard-monthly": "常用月包",
    "bulk-monthly": "批量月包",
    "team-yearly": "团队年包",
    "volume-yearly": "批量年包",
  },
  perMonth: "/月",
  perYear: "/年",
  creditsPerMonth: (n: string) => `每月 ${n} 积分`,
  creditsMonthlyGrant: (perMonth: string, total: string) =>
    `每月发放 ${perMonth} 积分 · 共 ${total} 积分`,
  creditUnitPrice: (n: string) => `积分单价约 ${n} 元`,
  fullUse: (n: number) => `满用约 ${n} 张均衡档 2K`,
  fullUseMonthly: (n: number) => `每月满用约 ${n} 张均衡档 2K`,
  recommended: "推荐",
  plansFootnote: "积分单价 = 套餐价格 ÷ 积分数；出图张数按均衡档 2K（4 积分/张）满用估算。",
  tiersLabel: "单张扣积分",
  tiersSub:
    "一张图扣多少积分由「模型 × 分辨率」决定。参考价按常用月包（99 元 / 775 积分）折算，实际随所购套餐变化。",
  tierNames: {
    swift: "速度档 · GPT Image 2.5",
    standard: "均衡档 · Nano Banana 2",
    flagship: "旗舰档 · Nano Banana Pro",
    batch: "批量档 · Seedream 5.0 Flash",
  },
  tierTaglines: {
    swift: "出图快、单价低，适合大批量初稿与选款",
    standard: "主力模型，画质与成本均衡，日常出图首选",
    flagship: "最高画质定位，适合主图与对细节要求高的场景",
    batch: "高速批量出图，各分辨率统一价",
  },
  resolutionLabels: { "1k": "1K", "2k": "2K", "4k": "4K", flat: "统一价" },
  referencePrice: (from: string, to: string) =>
    from === to ? `参考约 ${from} 元/张` : `参考约 ${from}–${to} 元/张`,
  suitesLabel: "商品套图",
  suitesSub:
    "一次生成整套电商图：图像费与编排费分开列示，部分失败时图像费按成功张数结算、编排费单独计。",
  suiteNames: { "suite-7": "标准套图 · 7 张", "suite-13": "完整套图 · 13 张" },
  suiteBasis: "均衡档 Nano Banana 2 · 2K",
  imageFee: (images: number, each: number, total: string) => `图像费 ${total} 积分（${each} 积分 × ${images} 张）`,
  orchestrationFee: (s: string) => `编排费 ${s} 积分`,
  total: (s: string) => `合计 ${s} 积分`,
  suiteReference: (s: string) => `常用月包折算约 ${s} 元/套`,
  rulesLabel: "计费与服务规则",
  rules: [
    "生成前确认：每次生成前界面显示本次扣积分总数，确认后才开始执行。",
    "失败退积分：系统原因失败、没有产出的图片自动全额退积分。",
    "部分成功：套图部分失败时，图像费按成功张数结算，编排费单独列示。",
    "内测计费：使用整数积分，按质量档测试单价结算；本页小数价目尚未启用。",
    "套餐规则：月包连续订阅、可随时取消；年包按月发放、不自动续订；当期未用完的积分不结转。",
    "价格透明：套餐与扣积分标准如调整将提前公告，不与赠积分、折扣叠加。",
  ],
  faqLabel: "常见问题",
  faq: [
    {
      q: "一积分是多少钱？",
      a: "取决于套餐：体验月包约 0.153 元/积分，批量年包低至 0.075 元/积分。页面中的参考价均按常用月包（约 0.128 元/积分）折算。",
    },
    {
      q: "不买套餐能出图吗？",
      a: "先选购任意套餐获得积分，之后所有生成按张扣积分，用完可随时续购。",
    },
    {
      q: "1K / 2K / 4K 是什么？",
      a: "输出图片的分辨率档位：1K 适合快速预览与选款，2K 适合日常上架，4K 适合主图放大与印刷物料。",
    },
    {
      q: "生成失败会扣积分吗？",
      a: "系统失败、无产出的图片自动全额退积分；套图按成功张数结算，不会为失败的张数付费。",
    },
    {
      q: "积分有有效期吗？",
      a: "月包积分当月有效；年包积分按月发放、不自动续订。当期未用完不结转，请按实际用量选择套餐。",
    },
    {
      q: "企业客户怎么合作？",
      a: "大批量、多席位或私有化部署需求请联系我们，按用量与服务单独报价。",
    },
  ],
  ctaPrimary: "开始生成",
  ctaSecondary: "企业客户联系我们",
  ctaTitle: "选好套餐，马上开始",
  currencyNote: "本页价格均为人民币。",
};

const en: Copy = {
  draftNotice: "This credit pricing proposal is pending review. It is not the current top-up or billing schedule. Beta charges follow the estimate shown before generation and the account usage record.",
  kicker: "Pricing",
  title: "Credit pricing proposal",
  intro:
    "Top up credits and start generating: your plan sets the price per credit, and the model and resolution set the credits per image. Every generation shows its credit cost up front and only runs after you confirm; failed generations are refunded automatically.",
  mechanicsLabel: "How billing works",
  mechanics: [
    {
      icon: Coins,
      title: "Plans set the credit price",
      desc: "Five plans, down to ¥0.075 per credit — the bigger the plan, the cheaper the credit.",
    },
    {
      icon: ImageIcon,
      title: "Pay per image",
      desc: "The proposed rates follow model × resolution. Beta billing uses whole credits; decimal rates remain a proposal.",
    },
    {
      icon: ShieldCheck,
      title: "Failures are free",
      desc: "No output, no charge — system failures are refunded in full; suites settle per successful image.",
    },
  ],
  plansLabel: "Top-up plans",
  plansSub:
    "Monthly plans auto-renew and can be cancelled anytime; yearly plans are prepaid, granted monthly, and do not auto-renew. Credits do not roll over — pick a plan that matches your volume.",
  planNames: {
    "trial-monthly": "Starter",
    "standard-monthly": "Standard",
    "bulk-monthly": "Bulk",
    "team-yearly": "Team",
    "volume-yearly": "Volume",
  },
  perMonth: "/mo",
  perYear: "/yr",
  creditsPerMonth: (n: string) => `${n} credits / month`,
  creditsMonthlyGrant: (perMonth: string, total: string) =>
    `${perMonth} credits / month · ${total} total`,
  creditUnitPrice: (n: string) => `≈ ¥${n} / credit`,
  fullUse: (n: number) => `~${n} images at Standard 2K`,
  fullUseMonthly: (n: number) => `~${n} images at Standard 2K / month`,
  recommended: "Recommended",
  plansFootnote:
    "Credit price = plan price ÷ credits; image counts assume full use at Standard 2K (4 credits/image).",
  tiersLabel: "Credits per image",
  tiersSub:
    "The credits per image follow the model × resolution you pick. Reference prices are converted at the Standard monthly plan (¥99 / 775 credits); actual prices vary with your plan.",
  tierNames: {
    swift: "Swift · GPT Image 2.5",
    standard: "Standard · Nano Banana 2",
    flagship: "Flagship · Nano Banana Pro",
    batch: "Batch · Seedream 5.0 Flash",
  },
  tierTaglines: {
    swift: "Fast and low-cost — bulk drafts and selection",
    standard: "The everyday workhorse balancing quality and cost",
    flagship: "Top quality for hero images and detail-critical work",
    batch: "High-throughput batch generation, one price for all resolutions",
  },
  resolutionLabels: { "1k": "1K", "2k": "2K", "4k": "4K", flat: "Flat" },
  referencePrice: (from: string, to: string) =>
    from === to ? `≈ ${from} CNY/image` : `≈ ${from}–${to} CNY/image`,
  suitesLabel: "Product suites",
  suitesSub:
    "Generate a full e-commerce set in one go: image fees and orchestration fees are listed separately, so partial failures settle per successful image.",
  suiteNames: { "suite-7": "Standard suite · 7 images", "suite-13": "Full suite · 13 images" },
  suiteBasis: "Standard Nano Banana 2 · 2K",
  imageFee: (images: number, each: number, total: string) =>
    `Image fee ${total} credits (${each} × ${images})`,
  orchestrationFee: (s: string) => `Orchestration ${s} credits`,
  total: (s: string) => `Total ${s} credits`,
  suiteReference: (s: string) => `≈ ${s} CNY/set at the Standard monthly rate`,
  rulesLabel: "Billing & service rules",
  rules: [
    "Confirm first: every generation shows its total credit cost before it runs.",
    "Automatic refunds: images that fail due to system errors with no output are refunded in full.",
    "Partial success: suites settle image fees per successful image; orchestration is listed separately.",
    "Beta billing: charges use whole credits and quality-tier test rates. The decimal proposal shown here is not active.",
    "Plan terms: monthly plans auto-renew and are cancellable anytime; yearly plans grant credits monthly and do not auto-renew; unused credits do not roll over.",
    "Transparent pricing: plan or per-image changes are announced in advance; no stacking with bonus credits or discounts.",
  ],
  faqLabel: "FAQ",
  faq: [
    {
      q: "How much is one credit?",
      a: "It depends on the plan: about ¥0.153 per credit on Starter, down to ¥0.075 on Volume. Reference prices on this page use the Standard monthly plan (≈ ¥0.128 per credit).",
    },
    {
      q: "Can I generate without a plan?",
      a: "Pick any plan to get credits first; every generation then deducts credits per image, and you can top up again anytime.",
    },
    {
      q: "What do 1K / 2K / 4K mean?",
      a: "Output resolution tiers: 1K for quick previews and selection, 2K for everyday listings, 4K for hero-image enlargements and print materials.",
    },
    {
      q: "Do failed generations cost credits?",
      a: "No — system failures with no output are refunded automatically; suites settle per successful image only.",
    },
    {
      q: "Do credits expire?",
      a: "Monthly-plan credits are valid for the month; yearly plans grant credits monthly without auto-renewal. Unused credits do not roll over, so choose by your real volume.",
    },
    {
      q: "How about enterprise cooperation?",
      a: "For volume usage, multiple seats or private deployment, contact us for a quote based on usage and service scope.",
    },
  ],
  ctaPrimary: "Start generating",
  ctaSecondary: "Talk to us",
  ctaTitle: "Pick a plan and start creating",
  currencyNote: "All prices are in CNY.",
};

function PricingPageLayout({ c }: { c: Copy }) {
  const ref = getReferencePackage();
  const monthly = PRICING_PACKAGES.filter((p) => p.kind === "monthly");
  const yearly = PRICING_PACKAGES.filter((p) => p.kind === "yearly");

  const packageCard = (p: (typeof PRICING_PACKAGES)[number]) => {
    const credits = p.credits.toLocaleString("en-US");
    const monthlyCredits = p.monthlyCredits.toLocaleString("en-US");
    return (
      <div
        key={p.id}
        className={`relative rounded-2xl border bg-card p-6 ${
          p.highlighted ? "border-primary/60 shadow-btn" : "border-border"
        }`}
      >
        {p.highlighted ? (
          <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
            {c.recommended}
          </span>
        ) : null}
        <h3 className="text-base font-semibold text-foreground">{c.planNames[p.id]}</h3>
        <p className="mt-3">
          <span className="text-3xl font-bold tracking-tight">¥{p.priceYuan}</span>
          <span className="ml-1 text-sm text-muted-foreground">
            {p.kind === "monthly" ? c.perMonth : c.perYear}
          </span>
        </p>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>
            {p.kind === "monthly"
              ? c.creditsPerMonth(monthlyCredits)
              : c.creditsMonthlyGrant(monthlyCredits, credits)}
          </li>
          <li>{c.creditUnitPrice(`${yuanPerCredit(p)}`)}</li>
          <li>
            {p.kind === "monthly"
              ? c.fullUse(monthlyStandard2KImages(p))
              : c.fullUseMonthly(monthlyStandard2KImages(p))}
          </li>
        </ul>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      {/* Hero */}
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-widest text-primary">
        <Coins className="h-4 w-4" />
        {c.kicker}
      </p>
      <p className="mb-5 rounded-xl border border-border bg-secondary p-4 text-sm leading-relaxed">{c.draftNotice}</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]">
        {c.title}
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {c.intro}
      </p>

      {/* 计费机制 3 卡 */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {c.mechanics.map((m) => (
          <div key={m.title} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
            <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
              <m.icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">{m.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 套餐 */}
      <h2 className="mt-14 text-xl font-semibold sm:text-2xl">{c.plansLabel}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{c.plansSub}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">{monthly.map(packageCard)}</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{yearly.map(packageCard)}</div>
      <p className="mt-3 text-xs text-muted-foreground">{c.plansFootnote}</p>

      {/* 单张扣积分 */}
      <h2 className="mt-14 text-xl font-semibold sm:text-2xl">{c.tiersLabel}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{c.tiersSub}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {IMAGE_TIERS.map((tier) => {
          const prices = tier.rows.map((r) => yuanFromCredits(r.credits, ref));
          const min = formatYuan(Math.min(...prices));
          const max = formatYuan(Math.max(...prices));
          return (
            <div key={tier.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{c.tierNames[tier.id]}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.tierTaglines[tier.id]}</p>
                </div>
                <Layers className="h-5 w-5 flex-none text-primary/70" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {tier.rows.map((r) => (
                  <span
                    key={r.resolution}
                    className="inline-flex items-baseline gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm"
                  >
                    <span className="text-xs text-muted-foreground">
                      {c.resolutionLabels[r.resolution]}
                    </span>
                    <span className="font-semibold">{formatCredits(r.credits)}</span>
                    <span className="text-xs text-muted-foreground">积分</span>
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {c.referencePrice(min, max)}
              </p>
            </div>
          );
        })}
      </div>

      {/* 套图 */}
      <h2 className="mt-14 text-xl font-semibold sm:text-2xl">{c.suitesLabel}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{c.suitesSub}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {SUITE_BUNDLES.map((suite) => {
          const imageCredits = suite.imageCreditsEach * suite.images;
          const total = imageCredits + suite.orchestrationCredits;
          return (
            <div key={suite.id} className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-base font-semibold text-foreground">{c.suiteNames[suite.id]}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{c.suiteBasis}</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {c.imageFee(suite.images, suite.imageCreditsEach, formatCredits(imageCredits))}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {c.orchestrationFee(formatCredits(suite.orchestrationCredits))}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3 border-t border-border pt-2">
                  <span className="font-semibold">{c.total(formatCredits(total))}</span>
                </li>
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">
                {c.suiteReference(formatYuan(yuanFromCredits(total, ref)))}
              </p>
            </div>
          );
        })}
      </div>

      {/* 规则 */}
      <h2 className="mt-14 text-xl font-semibold sm:text-2xl">{c.rulesLabel}</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {c.rules.map((rule) => (
          <li
            key={rule}
            className="rounded-2xl border border-border bg-secondary/40 px-5 py-4 text-sm leading-relaxed text-muted-foreground"
          >
            {rule}
          </li>
        ))}
      </ul>

      {/* FAQ */}
      <h2 className="mt-14 text-xl font-semibold sm:text-2xl">{c.faqLabel}</h2>
      <div className="mt-5 space-y-3">
        {c.faq.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-border bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
              {item.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-14 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
        <h2 className="text-xl font-semibold sm:text-2xl">{c.ctaTitle}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {c.currencyNote}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild variant="gradient" size="lg">
            <Link href="/generate">
              {c.ctaPrimary}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/contact">
              <Building2 className="h-4 w-4" />
              {c.ctaSecondary}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default async function PlansPage() {
  if (!publicCommerceEnabled) redirect("/");
  if (editionName !== "cloud") {
    const locale = getServerLocale();
    const custom = await getSitePage("plans");
    return (
      <CustomPage
        title={locale === "en" ? "Pricing" : "定价"}
        content={
          custom ||
          (locale === "en" ? "Content coming soon." : "内容建设中，敬请期待。")
        }
      />
    );
  }
  return <PricingPageLayout c={getServerLocale() === "en" ? en : zh} />;
}
