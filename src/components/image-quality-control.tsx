"use client";

import { useImageQuality } from "@/lib/image-quality-context";
import { IMAGE_QUALITY_IDS } from "@/lib/image-quality";
import {useBilling} from "@/lib/billing/client";
import {usePathname} from "next/navigation";
import {CATEGORY_FEATURES} from "@/lib/billing/feature-map";
import { useI18n } from "@/lib/i18n/locale-context";

export const QUALITY_TOOL_CATEGORIES = new Set(["retouch", "recolor", "replicate", "garment3d", "packaging3d", "garment", "avatar", "style", "tryon", "dewatermark", "dewrinkle", "inpaint", "print"]);

export function ImageQualityControl({ disabled = false, compact = false, resolution = "1K", value }: { disabled?: boolean; compact?: boolean; resolution?: string; value?: string }) {
  const { quality, setQuality, capable, experimental } = useImageQuality();
  const { t } = useI18n();
  const {catalog}=useBilling(),pathname=usePathname(),feature=CATEGORY_FEATURES[pathname.split('/')[1]]??"image.generate";
  const labels = { low: "gen.qLow", medium: "gen.qMedium", high: "gen.qHigh", xhigh: "gen.qXhigh", max: "gen.qMax" } as const;
  return <div className={compact ? "min-w-28" : "space-y-2"}>
    <label className="flex items-center gap-2 text-xs">
      {!compact && <span>{t("gen.qualityLabel")}</span>}
      <select aria-label={t("gen.qualityLabel")} value={value || quality} onChange={event => setQuality(event.target.value)} disabled={disabled}
        className={compact ? "canvas-ui-control max-w-40 rounded-[9px] border px-2 py-1.5 text-[12px]" : "w-full rounded-lg border border-c-border bg-c-card px-3 py-2 text-sm text-c-text"}>
        {IMAGE_QUALITY_IDS.map(id => <option key={id} value={id} disabled={id !== "medium" && !capable}>{t(labels[id])} · {catalog?.features[feature]?.prices[id]?.[resolution]??"—"} 积分/张</option>)}
      </select>
    </label>
    {!compact && <p className="text-[11px] leading-relaxed text-c-text3">{!capable ? t("gen.qualityPending") : experimental ? t("gen.qualityBeta") : ""}</p>}
  </div>;
}
