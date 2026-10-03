"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { IMAGE_QUALITY_IDS, type ImageQualityId } from "@/lib/image-quality";
import {useBilling} from "@/lib/billing/client";
import {usePathname} from "next/navigation";
import {CATEGORY_FEATURES} from "@/lib/billing/feature-map";
import type {FeatureId} from "@/lib/billing/types";
import { updateCurrentImageQuality } from "@/lib/image-quality-preference";
import { authHeader } from "./supabase";
import { useAuth } from "./auth-context";
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
  const [capable, setCapable] = useState(false);
  const [experimental, setExperimental] = useState(false);
  const [metered, setMetered] = useState(true);
  const [modelConfig, setModelConfig] = useState<PublicImageConfiguration | null>(null);
  const { user } = useAuth();
  function setQuality(value: string) {
    const next = IMAGE_QUALITY_IDS.includes(value as ImageQualityId) ? value as ImageQualityId : "medium";
    updateQuality(next);
    updateCurrentImageQuality(next);
    try { localStorage.setItem(IMAGE_QUALITY_STORAGE_KEY, next); } catch { /* Optional preference. */ }
  }
  useEffect(() => {
    let cancelled = false;
    const load = () => void authHeader().then(headers => fetch("/api/config", { cache: "no-store", headers })).then(async res => { if (!res.ok) throw new Error("模型列表暂不可用"); return res.json(); }).then(config => {
      if (cancelled) return;
      setModelConfig(config);
      rememberModelCatalogVersion(config.modelVersion);
      setCapable(!!config.imageQualityCapable);
      setExperimental(!!config.imageQualityExperimental);
      setMetered(!config.db || config.creditsMetered !== false);
      let saved = "medium";
      try { saved = localStorage.getItem(IMAGE_QUALITY_STORAGE_KEY) || "medium"; } catch { /* Optional preference. */ }
      const allowed = availableImageQualities(config);
      setQuality(allowed.includes(saved as ImageQualityId) ? saved : allowed[0]);
    }).catch(() => { if (!cancelled) setQuality("medium"); });
    load(); window.addEventListener(MODEL_CATALOG_REFRESH, load);
    return () => { cancelled = true; window.removeEventListener(MODEL_CATALOG_REFRESH, load); };
  }, [user?.email]);
  const {catalog}=useBilling();
  const imageCost = (resolution = "1K") => catalog?.features["image.generate"].prices[quality]?.[resolution]??0;
  return <QualityContext.Provider value={{ quality, setQuality, capable, experimental, modelConfig, costPerImage: imageCost(), imageCost }}>{children}</QualityContext.Provider>;
}

export function useImageQuality(feature?:FeatureId, modelId?: string, purpose?: string) {
  const value = useContext(QualityContext);
  if (!value) throw new Error("ImageQualityProvider is missing");
  const pathname=usePathname(),{catalog}=useBilling(),selected=feature??CATEGORY_FEATURES[pathname.split('/')[1]]??"image.generate";
  const binding = purpose || (["image.generate", "image.suite", "image.aplus"].includes(selected) ? "image.generate" : selected === "tool.cutout" ? "image.cutout" : "image.edit");
  const allowedQualities = availableImageQualities(value.modelConfig, modelId, binding);
  const quality = allowedQualities.includes(value.quality) ? value.quality : allowedQualities[0];
  const imageCost=(resolution="1K")=>catalog?.features[selected]?.prices[quality]?.[resolution]??0;
  return {...value,quality,allowedQualities,capable: allowedQualities.length > 1,imageCost,costPerImage:imageCost()};
}
