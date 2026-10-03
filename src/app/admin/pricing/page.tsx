import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { PricingResearch } from "@/components/pricing-research";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { BRAND } from "@/lib/brand";
import { betaPreviewEnabled } from "@/lib/commerce";
import { IMAGE_QUALITY_IDS } from "@/lib/image-quality";
import {getBillingRuntime} from "@/lib/billing/server";
import {quote} from "@/lib/billing/quote";
import {
  PRICING_PACKAGES,
  QUALITY_MODELS,
  QUALITY_QUOTES,
  RESEARCH_QUALITIES,
  RESEARCH_NOTES,
  IMAGE_TIERS,
  SUITE_BUNDLES,
  RESEARCH_DATE,
  getReferencePackage,
  yuanFromCredits,
  monthlyStandard2KImages,
  formatCredits,
  formatYuan,
} from "@/lib/pricing";

export const metadata = { title: `内部报价 — ${BRAND}`, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  if (!(await requireAdmin(new Request("http://internal/admin/pricing", { headers: headers() })))) notFound();
  const current=await(await getBillingRuntime()).config.current();
  const currentQualityPrices=Object.fromEntries(IMAGE_QUALITY_IDS.map(quality=>[quality,quote(current,{feature:"image.generate",quantity:1,quality,resolution:"1K",byok:false,metered:true,paidFen:0,userGroup:"default"}).requestedCredits]));
  const english = getServerLocale() === "en";
  const t = (zh: string, en: string) => (english ? en : zh);
  const packageNames = [
    t("体验月包", "Trial monthly"),
    t("常用月包", "Standard monthly"),
    t("批量月包", "Bulk monthly"),
    t("团队年包", "Team annual"),
    t("批量年包", "Volume annual"),
  ];
  const qualityNames: Record<string, string> = {
    low: t("低", "Low"),
    medium: t("标准", "Medium"),
    high: t("高", "High"),
    xhigh: t("超高", "Extra high"),
    max: t("最高", "Max"),
  };
  const reference = getReferencePackage();
  const faq = [
    [
      t("内测现在怎么扣积分？", "How are beta credits charged?"),
      t(
        "当前计费由计费管理后台的版本配置决定。执行前显示准确报价；已有任务沿用创建时的价格、成功范围与失败策略。",
        "Billing follows the versioned admin configuration. Confirm the quote before execution; existing tasks retain their original prices and settlement policies.",
      ),
    ],
    [
      t("调研价格现在能购买吗？", "Can I purchase the researched plans now?"),
      t(
        "暂不能。五档套餐、模型价目、编排费和Token预算都是调研方案，尚未接入当前充值或扣费。测算器只作金额折算，不会创建订单。",
        "Not yet. These packages, model prices, orchestration fees and Token budgets are research proposals, separate from current purchase and billing. The calculator creates no orders.",
      ),
    ],
    [
      t(
        "上游不支持超高质量，会怎么扣？",
        "What if the upstream cannot support extra high quality?",
      ),
      t(
        "质量计费可配置为请求档或实际执行档，由创建任务时冻结的策略决定。回退不代表获得了超高效果；请求档、执行档与回退原因分别记录。",
        "The frozen policy determines whether requested or executed quality sets the charge. Fallback does not establish extra high output quality. Requested tier, executed tier and reason are recorded separately.",
      ),
    ],
    [
      t(
        "自带接口需要站内积分吗？",
        "Do my own API credentials consume site credits?",
      ),
      t(
        "用户自带接口的站内收费比例由计费后台设置，上游供应商可能按其规则另行收费。平台接口的质量支持与实际输出效果需要分别核验。",
        "Site charges for your own API follow the configured BYOK rate; the supplier may charge separately. Parameter support and actual output quality require separate verification.",
      ),
    ],
    [
      t(
        "积分多久有效，年包如何发放？",
        "How would credits expire and annual grants work?",
      ),
      t(
        "调研拟定月包连续续订、可取消；年包一次预付、分12个月发放、不自动续订。当期未用积分拟不结转。发放日、取消入口、退款和商用授权须在正式销售前明确；这些尚不是内测生效规则。",
        "The proposal is recurring cancellable monthly plans, and annual prepayment with 12 monthly grants and no automatic renewal. Unused period credits would not roll over. Grant dates, cancellation, refunds and commercial rights must be specified before sales; these are not active beta rules.",
      ),
    ],
    [
      t(
        "单价更低，就代表一定更便宜吗？",
        "Does a lower credit price guarantee lower costs?",
      ),
      t(
        "不一定。人民币折算按额度全部用完计算，年包需一次预付。使用率降低、重抽、参考图、备用路由和付费工具都会增加实际单张支出；跨平台积分不天然等值。",
        "No. RMB estimates assume full use, and annual plans require upfront payment. Underuse, retries, reference images, fallback routes and paid tools increase effective costs. Cross-platform credits are not inherently equivalent.",
      ),
    ],
    [
      t(
        "能证明与竞品同等质量、更便宜吗？",
        "Is equivalent quality at a lower price proven?",
      ),
      t(
        "目前不能。报告核验的是官网报价与生成前报价，没有等效质量测试或实际扣费账单。模型名称、参数或扣分相近不构成同等交付效果证明。无限画布也不等于无限生成。",
        "Not currently. The reports checked published and pre-generation prices, without equivalent-quality tests or actual billing statements. Similar names, parameters or credit amounts do not prove equivalent results. Unlimited canvas does not mean unlimited generation.",
      ),
    ],
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-primary">
          {t("内部报价 · 仅管理员可见", "Internal pricing · Administrators only")}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("积分定价方案", "Credit pricing proposal")}
        </h1>
        <p className="mt-5 text-base leading-7 text-muted-foreground">
          {t(
            "先选合适的用量，再看模型、分辨率与质量。套餐决定积分单价，按张路线与Token质量路线分别测算，让每张图和每套商品图的费用都能算清楚。",
            "Choose your usage level, then compare model, resolution and quality. Packages determine credit unit prices. Per-image routes and Token quality routes are estimated separately, with explicit image and suite fees.",
          )}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(
            "依据2026年10月2日调研与决策稿，统一使用“积分”名称。以下报价不改变当前内测扣费，也不代表这些模型已接入。",
            "Based on the October 2, 2026 research and decision memo, using credits consistently. These proposals do not change beta billing or establish model availability.",
          )}
        </p>
      </header>
      <nav
        aria-label={t("定价页导航", "Pricing page sections")}
        className="my-7 flex flex-wrap gap-x-5 gap-y-3 border-b border-border pb-5 text-sm font-medium"
      >
        {[
          ["packages", t("套餐方案", "Packages")],
          ["quality-pricing", t("质量参数", "Quality parameters")],
          ["image-pricing", t("按张路线", "Per-image routes")],
          ["estimate", t("费用测算", "Calculator")],
          ["beta-pricing", t("当前内测扣费", "Active beta pricing")],
        ]
          .filter(([id]) => id !== "beta-pricing" || betaPreviewEnabled)
          .map(([id, name]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {name}
            </a>
          ))}
      </nav>
      {betaPreviewEnabled && (
        <details
          id="beta-pricing"
          className="mb-10 scroll-mt-24 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            {t(
              "当前内测实际扣费：4 / 6 / 10 / 14 / 18积分每成功张",
              "Active beta billing: 4 / 6 / 10 / 14 / 18 credits per successful image",
            )}
          </summary>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {IMAGE_QUALITY_IDS.map((q) => (
              <div key={q} className="rounded-lg bg-background p-3">
                <p className="text-sm text-muted-foreground">
                  {qualityNames[q]}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {currentQualityPrices[q]}{" "}
                  <span className="text-xs font-normal">
                    {t("积分/张", "credits/image")}
                  </span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6">
            {t(
              "开启计费时按请求质量档及成功张数结算，分辨率不额外计分，失败张数不扣。超高回退标准执行，成功1张仍扣14积分。自带接口站内消耗为0。",
              "With metering on, billing uses requested quality and successful image count. Resolution adds no fee; failed images are not charged. Extra high falling back to medium still costs 14 credits per successful image. Your own API consumes zero site credits.",
            )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "内测额度由管理员补充，充值暂未开放。实际消耗以生成前提示和积分使用记录为准。",
              "Beta credits are issued by the administrator; purchases are closed. Check the generation estimate and credit ledger for actual consumption.",
            )}
          </p>
        </details>
      )}
      <section id="packages" className="scroll-mt-24">
        <h2 className="text-2xl font-semibold">
          {t("五档套餐方案", "Five proposed packages")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(
            "按预计月用量选择。月包拟连续订阅，年包一次预付、按月发放；发放、取消与退款细则待正式销售前确定。",
            "Choose by monthly use. Monthly plans would recur; annual plans would be prepaid and granted monthly. Grant, cancellation and refund details remain to be finalized before sales.",
          )}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-6">
          {PRICING_PACKAGES.map((p, i) => (
            <article
              key={p.id}
              className={`rounded-xl border p-5 sm:p-6 ${p.kind === "yearly" ? "sm:col-span-3" : "sm:col-span-2"} ${p.highlighted ? "border-primary bg-primary/5" : "border-border bg-background"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{packageNames[i]}</h3>
                {p.highlighted && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                    {t("常用量参考", "Regular-use reference")}
                  </span>
                )}
              </div>
              <p className="mt-5">
                <strong className="text-3xl font-semibold tabular-nums">
                  ¥{p.priceYuan}
                </strong>
                <span className="ml-1 text-sm text-muted-foreground">
                  {p.kind === "yearly" ? t("/年", "/year") : t("/月", "/month")}
                </span>
              </p>
              <p className="mt-4 text-sm font-medium">
                {p.monthlyCredits.toLocaleString()}{" "}
                {t("积分/月", "credits/month")}
              </p>
              {p.kind === "yearly" && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("一次预付，全年共", "Prepaid, annual total ")}
                  {p.credits.toLocaleString()} {t("积分", "credits")}
                </p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                ¥{(p.priceYuan / p.credits).toFixed(5)} / {t("积分", "credit")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("月额度满用约", "Full monthly use: about ")}
                {monthlyStandard2KImages(p)}
                {t("张Nano2 EXT 2K", " Nano2 EXT 2K images")}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {t(
            "张数按4积分/张向下取整。年包总额不会一次到账；拟定当期未用积分不结转，低用量先选月包。方案不叠加赠积分或折扣。",
            "Counts round down at 4 credits/image. Annual credits would not arrive all at once; unused period credits would not roll over. Lower usage favors monthly plans. No stacked bonus credits or discounts are proposed.",
          )}
        </p>
      </section>
      <div className="mt-12 space-y-12">
        <PricingResearch english={english} packages={PRICING_PACKAGES} tiers={IMAGE_TIERS} models={QUALITY_MODELS} quotes={QUALITY_QUOTES} qualities={RESEARCH_QUALITIES} notes={RESEARCH_NOTES} bundles={SUITE_BUNDLES} />
      </div>
      <section
        id="image-pricing"
        className="mt-12 scroll-mt-24 border-t border-border pt-10"
      >
        <h2 className="text-2xl font-semibold">
          {t("按张路线备选价目", "Alternative per-image routes")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {t(
            "以下按张报价与GPT 2.5 Token路线分开。报告未核验这些路线的独立quality价，不能将其标成低、高、超高效果档。EXT表示具体渠道商品，不等同于Token模型。",
            "These per-image prices are separate from GPT 2.5 Token routes. Independent quality prices were not verified; they are not low/high/extra-high output tiers. EXT identifies a supplier product, not a Token model.",
          )}
        </p>
        <div
          className="mt-6 overflow-x-auto rounded-xl border border-border"
          tabIndex={0}
          role="region"
          aria-label={t(
            "按张价目表，可横向滚动",
            "Per-image price table, horizontally scrollable",
          )}
        >
          <table className="w-full min-w-[650px] text-left text-sm">
            <caption className="sr-only">
              {t(
                "候选模型分辨率与积分",
                "Candidate models, resolution and credits",
              )}
            </caption>
            <thead className="bg-secondary">
              <tr>
                {[
                  t("渠道商品", "Supplier product"),
                  "1K",
                  "2K",
                  "4K",
                  t("常用月包折算元/张", "RMB/image with standard monthly"),
                ].map((h) => (
                  <th key={h} scope="col" className="p-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {IMAGE_TIERS.map((tier) => (
                <tr key={tier.id} className="border-t border-border">
                  <th scope="row" className="p-4 font-medium">
                    {tier.model}
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {t(
                        "候选，待接入与实测",
                        "Candidate, pending integration and testing",
                      )}
                    </span>
                  </th>
                  {["1k", "2k", "4k"].map((r) => (
                    <td key={r} className="p-4 tabular-nums">
                      {formatCredits(
                        (
                          tier.rows.find((x) => x.resolution === r) ??
                          tier.rows[0]
                        ).credits,
                      )}
                      {tier.id === "swift" && r === "4k" && "*"}
                    </td>
                  ))}
                  <td className="p-4 tabular-nums">
                    ¥
                    {formatYuan(
                      yuanFromCredits(
                        Math.min(...tier.rows.map((r) => r.credits)),
                        reference,
                      ),
                    )}
                    –
                    {formatYuan(
                      yuanFromCredits(
                        Math.max(...tier.rows.map((r) => r.credits)),
                        reference,
                      ),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(
            "单位：积分/成功张。参考元价按99元/775积分满额使用折算。GPT 2 EXT 4K*的1:1为2880×2880。Seedream 5.0 Flash各分辨率统一2积分；Seedream 4.5的3积分候选因利润空间较小，仅保留限量验证。",
            "Unit: credits per successful image. RMB estimates assume full use of ¥99 / 775 credits. GPT 2 EXT 4K* at 1:1 is 2880×2880. Seedream 5.0 Flash is 2 credits across resolutions. The 3-credit Seedream 4.5 candidate is reserved for limited validation due to narrow margins.",
          )}
        </p>
      </section>
      <section className="mt-12 border-t border-border pt-10">
        <h2 className="text-2xl font-semibold">
          {t("商品套图费用拆分", "Product suite fee breakdown")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(
            "按张备选路线：成功张数 × 模型单价 + 编排费用。Token质量路线需按整条任务usage另算，不能套用下面的固定套餐。",
            "Per-image alternatives: successful image count × model rate + orchestration. Token quality routes require task usage estimates, not these fixed suite totals.",
          )}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {SUITE_BUNDLES.map((s) => (
            <article
              key={s.id}
              className="rounded-xl border border-border bg-background p-6"
            >
              <h3 className="text-lg font-semibold">
                {s.images}
                {t("张商品套图", "-image product suite")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Nano Banana 2 EXT · 2K
              </p>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>{t("图像费用", "Image fee")}</dt>
                  <dd>
                    {s.images} × 4 = {s.images * 4} {t("积分", "credits")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{t("编排费用", "Orchestration")}</dt>
                  <dd>
                    {s.orchestrationCredits} {t("积分", "credits")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border pt-3 font-semibold">
                  <dt>{t("合计", "Total")}</dt>
                  <dd>
                    {formatCredits(s.images * 4 + s.orchestrationCredits)}{" "}
                    {t("积分", "credits")}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("常用月包满额折算约", "Full standard monthly estimate: ")}¥
                {formatYuan(
                  yuanFromCredits(
                    s.images * 4 + s.orchestrationCredits,
                    reference,
                  ),
                )}
                {t("/套", "/suite")}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {t(
            "部分失败时，方案图像费仅按成功张数计算，编排费单列；不是无限免费重抽。编排预算尚待真实usage验证，参考图、付费搜索和审核等需另核。",
            "Proposed image fees use successful counts, with orchestration separate; unlimited free retries are not included. Budgets await actual usage; references, paid search and moderation require separate estimates.",
          )}
        </p>
      </section>
      <section className="mt-12 border-t border-border pt-10">
        <h2 className="text-2xl font-semibold">
          {t("竞品比较与资料口径", "Comparisons and research basis")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(
            "五档套餐积分单价相对报告中的对应稿定套餐，条件测算低约6.55%–8.34%。额度、席位和商用授权并不相同，跨平台积分不等值，不能据此宣传同款同质更便宜。",
            "Proposed unit prices are conditionally about 6.55%–8.34% below matched Gaoding packages in the report. Allowances, seats and commercial rights differ; cross-platform credits are not equivalent. This does not prove equivalent-product quality or discounts.",
          )}
        </p>
        <details className="mt-4 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t(
              "历史四档方案为什么未直接采用？",
              "Why was the historical four-plan proposal not adopted?",
            )}
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t(
              "附件比较图的29元/100、99元/400、299元/1300、999元/4500方案，与本页五档决策稿不同。图中99元套餐标准2K/4K相对原人民币单张价分别上涨26.9%/51.5%，最低单价999元套餐仍上涨13.8%/35.9%，因此没有将它直接作为现行价或“降价”宣传。",
              "The attached chart uses ¥29/100, ¥99/400, ¥299/1300 and ¥999/4500, a different proposal. Standard 2K/4K rises 26.9%/51.5% in the ¥99 plan and 13.8%/35.9% even in the ¥999 plan. It is not presented as active pricing or a discount.",
            )}
          </p>
        </details>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          {t("资料日期", "Research date")}: {RESEARCH_DATE}。
          {t(
            "来源：参数报价核验、六平台竞品比较、Naumi上游成本与定价、质量参数与套餐决策稿。官网与生成前报价构成价格快照；尚无等效质量及完整扣账证明。",
            "Sources: parameter verification, six-platform comparison, Naumi upstream cost/pricing, quality and package memo. Published and pre-generation prices are dated snapshots, without equivalent-quality or full billing proof.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary">
          <a
            className="underline underline-offset-4"
            href="https://docs.apimart.ai/cn/api-reference/images/gpt-image-2.5/generation"
            target="_blank"
            rel="noreferrer"
          >
            {t("GPT 2.5参数文档", "GPT 2.5 parameter docs")}
          </a>
          <a
            className="underline underline-offset-4"
            href="https://apimart.ai/zh/pricing"
            target="_blank"
            rel="noreferrer"
          >
            APIMart {t("报价", "pricing")}
          </a>
          <a
            className="underline underline-offset-4"
            href="https://www.gaoding.art/pricing"
            target="_blank"
            rel="noreferrer"
          >
            {t("稿定套餐", "Gaoding plans")}
          </a>
        </div>
      </section>
      <section className="mt-12 border-t border-border pt-10">
        <h2 className="text-2xl font-semibold">
          {t("常见问题", "Common questions")}
        </h2>
        <div className="mt-5 divide-y divide-border">
          {faq.map(([q, a]) => (
            <details key={q} className="py-4">
              <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {q}
              </summary>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-5 border-t border-border pt-7">
        <p className="text-sm text-muted-foreground">
          {t(
            "继续内测，按生成前提示确认当前消耗。",
            "Continue beta testing and check the current generation estimate.",
          )}
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/admin">{t("返回管理后台", "Back to administration")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/contact">{t("反馈定价方案", "Discuss pricing")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
