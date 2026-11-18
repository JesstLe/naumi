"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CANVAS_QUALITIES, normalizeCanvasQuality } from "@/lib/canvas/generation-parameters";
import { IMAGE_QUALITY_IDS, type ImageQualityId } from "@/lib/image-quality";
import {useBilling} from "@/lib/billing/client";
import { useAppPathname } from "@/lib/app-router-pathname";
import {CATEGORY_FEATURES} from "@/lib/billing/feature-map";
import type {FeatureId} from "@/lib/billing/types";
import { updateCurrentImageQuality } from "@/lib/image-quality-preference";
import { authHeader } from "./supabase";
import { useFeatureModels, useFeatureCatalogScope, currentFeatureCatalogScope } from "./model-config/feature-client";
import { availableImageQualities, rememberModelCatalogVersion, MODEL_CATALOG_REFRESH, type PublicImageConfiguration } from "./model-config/public-client";

export const IMAGE_QUALITY_STORAGE_KEY = "naumi:image-quality";
const QualityContext = createContext<{
  quality: ImageQualityId;
  setQuality: (quality: string) => void;
  capable: boolean;
  experimental: boolean;
  costPerImage: number;
  imageCost: (resolution?: string) => number;
  modelConfig: PublicImageConfiguration | null;
} | null>(null);

export function ImageQualityProvider({ children }: { children: ReactNode }) {
  const [quality, updateQuality] = useState<ImageQualityId>("medium");
  const scope = useFeatureCatalogScope();
  const [configuration, setConfiguration] = useState<{scope:string;value:PublicImageConfiguration} | null>(null);
  const modelConfig = configuration?.scope === scope ? configuration.value : null;
  const capable = !!modelConfig?.imageQualityCapable, experimental = !!modelConfig?.imageQualityExperimental;
  function setQuality(value: string) {
    const next = IMAGE_QUALITY_IDS.includes(value as ImageQualityId) ? value as ImageQualityId : "medium";
    updateQuality(next);
    updateCurrentImageQuality(next);
    try { localStorage.setItem(IMAGE_QUALITY_STORAGE_KEY, next); } catch { /* Optional preference. */ }
  }
  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    const load = () => { const request = ++revision;
      const current = () => !cancelled && scope === currentFeatureCatalogScope() && request === revision;
      void (async () => { const headers = await authHeader(); if (!current()) return;
      const res = await fetch("/api/config", { cache: "no-store", headers });
      if (!res.ok) throw new Error("模型列表暂不可用");
      const config = await res.json();
      if (!current()) return;
      setConfiguration({scope,value:config});
      rememberModelCatalogVersion(config.modelVersion);
      let saved = "medium";
      try { saved = localStorage.getItem(IMAGE_QUALITY_STORAGE_KEY) || "medium"; } catch { /* Optional preference. */ }
      const allowed = availableImageQualities(config);
      setQuality(allowed.includes(saved as ImageQualityId) ? saved : allowed[0]);
      })().catch(() => { if (current()) setQuality("medium"); });
    };
    load(); window.addEventListener(MODEL_CATALOG_REFRESH, load);
    return () => { cancelled = true; window.removeEventListener(MODEL_CATALOG_REFRESH, load); };
  }, [scope]);
  const {catalog}=useBilling();
  const imageCost = (resolution = "1K") => catalog?.features["image.generate"].prices[quality]?.[resolution]??0;
  return <QualityContext.Provider value={{ quality, setQuality, capable, experimental, modelConfig, costPerImage: imageCost(), imageCost }}>{children}</QualityContext.Provider>;
}

export function useImageQuality(feature?:FeatureId, modelId?: string, purpose?: string) {
  const value = useContext(QualityContext);
  if (!value) throw new Error("ImageQualityProvider is missing");
  const pathname=useAppPathname(),{catalog}=useBilling(),selected=feature??CATEGORY_FEATURES[pathname.split('/')[1]]??"image.generate";
  const { catalog: featureCatalog, selected: selectedModel } = useFeatureModels(selected);
  const binding = purpose || (["image.generate", "image.suite", "image.aplus"].includes(selected) ? "image.generate" : selected === "tool.cutout" ? "image.cutout" : "image.edit");
  const configured = featureCatalog?.models.find(m => m.id === (modelId || selectedModel));
  const modelQualities = configured?.qualities?.length ? IMAGE_QUALITY_IDS.filter(q => configured.qualities!.includes(q)) : availableImageQualities(value.modelConfig, modelId, binding);
  const allowedQualities = pathname === "/canvas" ? modelQualities.filter(q => (CANVAS_QUALITIES as readonly string[]).includes(q)) : modelQualities;
  const preferred = pathname === "/canvas" ? normalizeCanvasQuality(value.quality) : value.quality;
  const quality = allowedQualities.includes(preferred) ? preferred : allowedQualities[0] || "medium";
  const imageCost=(resolution="1K")=>catalog?.features[selected]?.prices[quality]?.[resolution]??0;
  const qualityLabels = configured?.qualityLabels || value.modelConfig?.imageModels?.find(m => m.id === modelId)?.qualityLabels || {};
  return {...value,quality,qualityLabels,allowedQualities,capable: allowedQualities.length > 1,imageCost,costPerImage:imageCost()};
}
