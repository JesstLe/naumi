"use client";
import { useState } from "react";
import type { PricingPackage, ImageTier, QualityQuote, SuiteBundle } from "@/lib/pricing";

const formatCredits = (value: number) => Number(value.toFixed(2)).toString();
const formatYuan = (value: number) => value.toFixed(2).replace(/\.?0+$/, "");
const yuanFromCredits = (credits: number, pkg: PricingPackage) => Math.round(credits * pkg.priceYuan / pkg.credits * 100) / 100;

type ResearchProps = {
  english: boolean;
  packages: PricingPackage[];
  tiers: ImageTier[];
  models: readonly string[];
  quotes: QualityQuote[];
  qualities: readonly string[];
  notes: readonly (readonly [string, string])[];
  bundles: SuiteBundle[];
};

// Numeric quotes arrive only as props after the server has checked administrator access.
export function PricingResearch({ english, packages: PRICING_PACKAGES, tiers: IMAGE_TIERS, models: QUALITY_MODELS, quotes: QUALITY_QUOTES, qualities: RESEARCH_QUALITIES, notes, bundles }: ResearchProps) {
  const t = (zh: string, en: string) => (english ? en : zh);
  const names: Record<string, string> = {
    low: t("低", "Low"),
    medium: t("标准", "Medium"),
    high: t("高", "High"),
    xhigh: t("超高", "Extra high"),
    max: t("最高", "Max"),
  };
  const [basis, setBasis] = useState<
    "protectedCredits" | "minimumCredits" | "targetCredits"
  >("protectedCredits");
  const [packageId, setPackageId] = useState("standard-monthly");
  const [route, setRoute] = useState("standard");
  const [resolution, setResolution] = useState("2k");
  const [quality, setQuality] = useState("high");
  const [model, setModel] = useState<string>(QUALITY_MODELS[0]);
  const [images, setImages] = useState(1);
  const pkg = PRICING_PACKAGES.find((p) => p.id === packageId)!;
  const token = route === "token";
  const tier = IMAGE_TIERS.find((p) => p.id === route) ?? IMAGE_TIERS[1];
  const quote = QUALITY_QUOTES.find(
    (q) => q.resolution === resolution && q.quality === quality,
  )!;
  const each = token
    ? quote[basis]
    : (tier.rows.find((r) => r.resolution === resolution) ?? tier.rows[0])
        .credits;
  const orchestration = bundles.find((bundle) => bundle.images === images)?.orchestrationCredits ?? 0;
  const total = each * images + orchestration;
  const basisNames = {
    protectedCredits: t("35%贡献率情景", "35% contribution scenario"),
    minimumCredits: t("不亏测算", "Break-even estimate"),
    targetCredits: t("竞品目标（不启用）", "Competitor target (disabled)"),
  };
  const selectClass =
    "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <>
      <section
        id="quality-pricing"
        className="scroll-mt-24 border-t border-border pt-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="text-2xl font-semibold">
              {t(
                "GPT 2.5 质量参数报价测算",
                "GPT 2.5 quality pricing estimates",
              )}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t(
                "Token路线。Flare与Sunburst分别支持五档quality；报告费率相同，效果尚未对齐。以下为预算参考，不是固定扣费承诺。",
                "Token billing. Flare and Sunburst support five quality levels. Reported rates match; output quality has not been compared. These are budget estimates, not fixed charges.",
              )}
            </p>
          </div>
          <label className="min-w-56 text-sm font-medium">
            {t("查看测算口径", "Estimate basis")}
            <select
              aria-label={t("查看测算口径", "Estimate basis")}
              className={selectClass}
              value={basis}
              onChange={(e) => setBasis(e.target.value as typeof basis)}
            >
              {Object.entries(basisNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="mt-6 overflow-x-auto rounded-xl border border-border"
          tabIndex={0}
          role="region"
          aria-label={t(
            "质量参数积分矩阵，可横向滚动",
            "Quality credit matrix, horizontally scrollable",
          )}
        >
          <table className="w-full min-w-[620px] text-left text-sm">
            <caption className="sr-only">
              {t(
                "每成功张的调研积分测算",
                "Research credit estimates per successful image",
              )}
            </caption>
            <thead className="bg-secondary">
              <tr>
                <th scope="col" className="p-4">
                  {t("1:1尺寸", "1:1 size")}
                </th>
                {RESEARCH_QUALITIES.map((q) => (
                  <th key={q} scope="col" className="p-4 text-right">
                    {names[q]}
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {q}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["1k", "2k", "4k"] as const).map((r) => (
                <tr key={r} className="border-t border-border">
                  <th scope="row" className="p-4 font-medium">
                    {r.toUpperCase()}
                    {r === "4k" ? "*" : ""}
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {QUALITY_QUOTES.find((q) => q.resolution === r)!.pixels}
                    </span>
                  </th>
                  {RESEARCH_QUALITIES.map((q) => (
                    <td key={q} className="p-4 text-right tabular-nums">
                      <strong className="text-lg font-semibold">
                        {formatCredits(
                          QUALITY_QUOTES.find(
                            (x) => x.resolution === r && x.quality === q,
                          )![basis],
                        )}
                      </strong>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {t("积分", "credits")}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(notes[0][0], notes[0][1])}
        </p>
        <div className="mt-5 border-l-2 border-amber-500 pl-4 text-sm leading-6">
          <p className="font-semibold">
            {t(
              "竞品目标价暂不启用",
              "Competitor target prices remain disabled",
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(notes[1][0], notes[1][1])}
          </p>
        </div>
        <details className="mt-5 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t("参数范围与测算假设", "Parameters and estimate assumptions")}
          </summary>
          <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            <p className="break-words">{QUALITY_MODELS.join(" / ")}</p>
            <p>
              {t(notes[2][0], notes[2][1])}
            </p>
            <p>
              {t(notes[3][0], notes[3][1])}
            </p>
            <p>
              {t(
                "4K*为厂商档位：1:1为2880×2880，16:9为3840×2160，不表示方图4096×4096。精确size覆盖resolution，auto须按实际usage评估。",
                "Supplier 4K*: 1:1 is 2880×2880, 16:9 is 3840×2160, not square 4096×4096. Exact size overrides resolution; auto requires actual-usage evaluation.",
              )}
            </p>
          </div>
        </details>
      </section>
      <section
        id="estimate"
        className="scroll-mt-24 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-8"
      >
        <h2 className="text-2xl font-semibold">
          {t("按你的用量折算", "Estimate your usage")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(
            "只计算调研方案，不创建订单或生成任务。人民币单价假设套餐额度全部用完。",
            "Research calculator only, no orders or generation tasks. RMB unit prices assume full package consumption.",
          )}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">
            {t("套餐", "Package")}
            <select
              aria-label={t("测算套餐", "Estimate package")}
              className={selectClass}
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            >
              {PRICING_PACKAGES.map((p) => (
                <option key={p.id} value={p.id}>
                  ¥{p.priceYuan} / {p.credits.toLocaleString()}{" "}
                  {t("积分", "credits")}
                  {p.kind === "yearly"
                    ? t("（年付）", " (annual)")
                    : t("（月付）", " (monthly)")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            {t("模型路线", "Model route")}
            <select
              aria-label={t("测算模型路线", "Estimate model route")}
              className={selectClass}
              value={route}
              onChange={(e) => {
                setRoute(e.target.value);
                setImages(1);
              }}
            >
              <option value="token">GPT 2.5 · Token</option>
              {IMAGE_TIERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.model}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            {t("分辨率", "Resolution")}
            <select
              aria-label={t("测算分辨率", "Estimate resolution")}
              className={selectClass}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            >
              {["1k", "2k", "4k"].map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                  {r === "4k" && (token || route === "swift") ? "*" : ""}
                </option>
              ))}
            </select>
          </label>
          {token ? (
            <>
              <label className="text-sm font-medium">
                {t("API模型", "API model")}
                <select
                  aria-label={t("测算API模型", "Estimate API model")}
                  className={selectClass}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {QUALITY_MODELS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {t("质量参数", "Quality parameter")}
                <select
                  aria-label={t("测算质量", "Estimate quality")}
                  className={selectClass}
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                >
                  {RESEARCH_QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {names[q]} · {q}
                    </option>
                  ))}
                </select>
              </label>
              <p className="self-end pb-3 text-sm text-muted-foreground">
                {basisNames[basis]}
              </p>
            </>
          ) : (
            <label className="text-sm font-medium">
              {t("图片数量", "Image count")}
              <select
                aria-label={t("测算图片数量", "Estimate image count")}
                className={selectClass}
                value={images}
                onChange={(e) => setImages(Number(e.target.value))}
              >
                <option value={1}>{t("单张", "Single image")}</option>
                <option value={7}>{t("7张套图", "7-image suite")}</option>
                <option value={13}>{t("13张套图", "13-image suite")}</option>
              </select>
            </label>
          )}
        </div>
        <div
          aria-live="polite"
          aria-atomic="true"
          className="mt-7 border-t border-primary/20 pt-6"
        >
          <p className="break-words text-sm text-muted-foreground">
            {token ? model : tier.model} · {resolution.toUpperCase()}
            {token ? ` · ${quality}` : ` · ${images} ${t("张", "images")}`}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <strong
              className="text-3xl font-semibold tabular-nums"
              data-testid="estimate-credits"
            >
              {formatCredits(total)} {t("积分", "credits")}
            </strong>
            <span className="text-lg tabular-nums" data-testid="estimate-yuan">
              ≈ ¥{formatYuan(yuanFromCredits(total, pkg))}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("调研测算，未启用", "Research estimate, inactive")}
            </span>
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("图片费用", "Image fee")}: {formatCredits(each)} × {images}
            {orchestration > 0 &&
              ` + ${t("编排费用", "orchestration")}: ${orchestration}`}
            。
            {token
              ? t(
                  "实际费用取决于usage和输入；不保证固定单张价。",
                  "Actual cost depends on usage and inputs; a fixed per-image price is not guaranteed.",
                )
              : t(
                  "按张路线未核验独立quality价，不能当成高质量Token路线。",
                  "No independent quality price has been verified; this cannot substitute for a high-quality Token route.",
                )}
          </p>
        </div>
      </section>
    </>
  );
}
