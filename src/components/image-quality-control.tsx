"use client";

import { useImageQuality } from "@/lib/image-quality-context";
import { CANVAS_QUALITIES } from "@/lib/canvas/generation-parameters";
import { IMAGE_QUALITY_IDS } from "@/lib/image-quality";
import {useBilling} from "@/lib/billing/client";
import {usePathname} from "next/navigation";
import {CATEGORY_FEATURES} from "@/lib/billing/feature-map";
import { useI18n } from "@/lib/i18n/locale-context";
import { ImageQualitySelect } from "@/components/ui/image-quality-select";

export const QUALITY_TOOL_CATEGORIES = new Set(["retouch", "recolor", "replicate", "garment3d", "packaging3d", "garment", "avatar", "style", "tryon", "dewatermark", "dewrinkle", "inpaint", "print"]);

export function ImageQualityControl({ feature: requestedFeature, disabled = false, compact = false, resolution = "1K", value, modelId, binding }: { feature?: import("@/lib/billing/types").FeatureId; disabled?: boolean; compact?: boolean; resolution?: string; value?: string; modelId?: string; binding?: string }) {
  const { quality, setQuality, qualityLabels, capable, experimental, allowedQualities, modelConfig } = useImageQuality(requestedFeature, modelId, binding);
  const { t } = useI18n();
  const {catalog}=useBilling(),pathname=usePathname(),feature=requestedFeature??CATEGORY_FEATURES[pathname.split('/')[1]]??"image.generate";
  const labels = { low: "gen.qLow", medium: "gen.qMedium", high: "gen.qHigh", xhigh: "gen.qXhigh", max: "gen.qMax" } as const;
  const selectedModel = modelConfig?.imageModels?.find(m => m.id === (modelId || modelConfig.imageModelBindings?.[binding || "image.generate"] || modelConfig.defaultImageModel));
  const nativeResolutions = !modelId && binding ? modelConfig?.imageBindingCapabilities?.[binding]?.nativeResolutions ?? selectedModel?.nativeResolutions : selectedModel?.nativeResolutions;
  const nativeHint = modelConfig?.modelVersion && resolution !== "1K" ? nativeResolutions?.includes(resolution) ? `${resolution} 使用原生尺寸通道` : `${resolution} 使用基础出图后放大；仍按所选尺寸报价` : "";
  return <div className={compact ? "min-w-28" : "space-y-2"}>
    <div className="flex items-center gap-2 text-xs">
      {!compact && <span>{t("gen.qualityLabel")}</span>}
      <ImageQualitySelect label={t("gen.qualityLabel")} title={nativeHint} value={value || quality}
        onChange={setQuality} disabled={disabled} compact={compact} canvas={pathname === "/canvas"}
        options={(pathname === "/canvas" ? CANVAS_QUALITIES : IMAGE_QUALITY_IDS).map(id => ({
          value: id, disabled: !allowedQualities.includes(id),
          label: `${qualityLabels[id] || t(labels[id])} · ${catalog?.features[feature]?.prices[id]?.[resolution]??"—"} 积分/张`,
        }))} />
    </div>
    {!compact && <p className="text-[11px] leading-relaxed text-c-text3">{!capable ? t("gen.qualityPending") : experimental ? t("gen.qualityBeta") : ""}</p>}
  </div>;
}
