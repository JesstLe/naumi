"use client";

import { useEffect, useState } from "react";
import { useImageQuality } from "@/lib/image-quality-context";
import { CANVAS_QUALITIES } from "@/lib/canvas/generation-parameters";
import { IMAGE_QUALITY_IDS } from "@/lib/image-quality";
import { useBilling, type PublicQuote, type QuoteInput } from "@/lib/billing/client";
import {usePathname} from "next/navigation";
import {CATEGORY_FEATURES} from "@/lib/billing/feature-map";
import { useI18n } from "@/lib/i18n/locale-context";
import { ImageQualitySelect } from "@/components/ui/image-quality-select";
import { useFeatureModels } from "@/lib/model-config/feature-client";

export const QUALITY_TOOL_CATEGORIES = new Set(["cutout", "upscale", "printfile", "retouch", "recolor", "replicate", "garment3d", "packaging3d", "garment", "avatar", "style", "tryon", "dewatermark", "dewrinkle", "inpaint", "print"]);

type Price = { quote?: PublicQuote; error?: string };
type PriceResult = { key: string; request: ReturnType<typeof useBilling>["quote"]; retry: number; prices: Record<string, Price> };

function priceQuote(quote: PublicQuote): Price {
  // Missing/malformed prices must not masquerade as free. Zero is a valid quote.
  return typeof quote?.credits === "number" && Number.isFinite(quote.credits) && quote.credits >= 0
    ? { quote }
    : { error: "报价金额无效" };
}

function priceText(price: Price | undefined, unit: boolean): string {
  if (price?.error) return "报价暂不可用";
  if (!price?.quote) return "报价中…";
  const estimated = price.quote.mode === "api-cost-plus" || price.quote.mode === "usage";
  return `${estimated ? "预估 " : ""}${price.quote.credits} 积分${unit ? "/张" : ""}`;
}

export function ImageQualityControl({ feature: requestedFeature, disabled = false, compact = false, resolution = "1K", value, modelId, binding, quantity = 1, ratio }: { feature?: import("@/lib/billing/types").FeatureId; disabled?: boolean; compact?: boolean; resolution?: string; value?: string; modelId?: string; binding?: string; quantity?: number; ratio?: string }) {
  const pathname = usePathname(), feature = requestedFeature ?? CATEGORY_FEATURES[pathname.split('/')[1]] ?? "image.generate", canvas = pathname === "/canvas";
  const { selected } = useFeatureModels(feature);
  const quoteModelId = modelId || selected || undefined;
  const { quality, setQuality, qualityLabels, capable, experimental, allowedQualities, modelConfig } = useImageQuality(feature, quoteModelId, binding);
  const { t } = useI18n();
  const { quote: quoteRequest } = useBilling();
  const [retry, setRetry] = useState(0);
  const [units, setUnits] = useState<PriceResult | null>(null);
  const [total, setTotal] = useState<PriceResult | null>(null);
  const labels = { low: "gen.qLow", medium: "gen.qMedium", high: "gen.qHigh", xhigh: "gen.qXhigh", max: "gen.qMax" } as const;
  const qualities = (canvas ? CANVAS_QUALITIES : IMAGE_QUALITY_IDS).filter(id => allowedQualities.includes(id));
  const selectedQuality = value || quality;
  // Serialize primitive inputs, not hook-returned objects/arrays. Unit requests
  // survive quality/count switches; BillingProvider owns their shared cache.
  const unitKey = JSON.stringify(qualities.map(quality => ({ feature, modelId: quoteModelId, quality, resolution, ratio, quantity: 1, canvas })));
  const totalKey = JSON.stringify({ feature, modelId: quoteModelId, quality: selectedQuality, resolution, ratio, quantity, canvas });

  useEffect(() => {
    let cancelled = false;
    setUnits({ key: unitKey, request: quoteRequest, retry, prices: {} });
    const inputs = JSON.parse(unitKey) as QuoteInput[];
    for (const input of inputs) {
      const save = (price: Price) => {
        if (cancelled) return;
        setUnits(current => current?.key === unitKey && current.request === quoteRequest && current.retry === retry
          ? { ...current, prices: { ...current.prices, [input.quality!]: price } }
          : current);
      };
      void Promise.resolve().then(async () => { if (!cancelled) save(priceQuote(await quoteRequest(input))); })
        .catch(error => save({ error: error instanceof Error ? error.message || "报价暂不可用" : "报价暂不可用" }));
    }
    return () => { cancelled = true; };
  }, [unitKey, quoteRequest, retry]);

  useEffect(() => {
    if (quantity <= 1) return;
    let cancelled = false;
    setTotal({ key: totalKey, request: quoteRequest, retry, prices: {} });
    const save = (price: Price) => {
      if (!cancelled) setTotal({ key: totalKey, request: quoteRequest, retry, prices: { total: price } });
    };
    void Promise.resolve().then(async () => { if (!cancelled) save(priceQuote(await quoteRequest(JSON.parse(totalKey) as QuoteInput))); })
      .catch(error => save({ error: error instanceof Error ? error.message || "报价暂不可用" : "报价暂不可用" }));
    return () => { cancelled = true; };
  }, [totalKey, quantity, quoteRequest, retry]);

  // Compare the request function as well as inputs: identity/workspace refreshes
  // replace it, so an old scope's result disappears before effects are flushed.
  const unitPrices: Record<string, Price> = units?.key === unitKey && units.request === quoteRequest && units.retry === retry ? units.prices : {};
  const totalPrice = total?.key === totalKey && total.request === quoteRequest && total.retry === retry ? total.prices.total : undefined;
  const errors = [...Object.values(unitPrices), ...(quantity > 1 && totalPrice ? [totalPrice] : [])].flatMap(price => price.error ? [price.error] : []);
  const selectedModel = modelConfig?.imageModels?.find(m => m.id === (quoteModelId || modelConfig.imageModelBindings?.[binding || "image.generate"] || modelConfig.defaultImageModel));
  const nativeResolutions = !quoteModelId && binding ? modelConfig?.imageBindingCapabilities?.[binding]?.nativeResolutions ?? selectedModel?.nativeResolutions : selectedModel?.nativeResolutions;
  const nativeHint = modelConfig?.modelVersion && resolution !== "1K" ? nativeResolutions?.includes(resolution) ? `${resolution} 使用原生尺寸通道` : `${resolution} 使用基础出图后放大；仍按所选尺寸报价` : "";
  return <div className={compact ? "min-w-28" : "space-y-2"}>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {!compact && <span className="shrink-0 whitespace-nowrap">{t("gen.qualityLabel")}</span>}
      <ImageQualitySelect label={t("gen.qualityLabel")} title={nativeHint} value={selectedQuality}
        onChange={setQuality} disabled={disabled} compact={compact} canvas={canvas}
        options={qualities.map(id => ({
          value: id,
          label: `${qualityLabels[id] || t(labels[id])} · ${priceText(unitPrices[id], true)}`,
        }))} />
      {quantity > 1 && <span data-testid="image-quality-total" role="status" className="whitespace-nowrap text-[11px] text-c-text3" title={`${quantity} 张`}>总计 {priceText(totalPrice, false)}</span>}
    </div>
    {errors.length > 0 && <div role="status" className="flex items-center gap-1.5 text-[11px] text-c-text3" title={Array.from(new Set(errors)).join("；")}>
      <span>{unitPrices[selectedQuality]?.error || totalPrice?.error ? "报价暂不可用" : "部分报价暂不可用"}</span>
      <button type="button" className="rounded px-1 py-0.5 text-primary hover:bg-c-subtle2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setRetry(current => current + 1)}>重试报价</button>
    </div>}
    {!compact && <p className="text-[11px] leading-relaxed text-c-text3">{!capable ? t("gen.qualityPending") : experimental ? t("gen.qualityBeta") : ""}</p>}
  </div>;
}
