"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { IMAGE_QUALITY_IDS, type ImageQualityId } from "@/lib/image-quality";
import { imageBillCredits } from "@/lib/mock-data";
import { updateCurrentImageQuality } from "@/lib/image-quality-preference";

export const IMAGE_QUALITY_STORAGE_KEY = "naumi:image-quality";
const QualityContext = createContext<{
  quality: ImageQualityId;
  setQuality: (quality: string) => void;
  capable: boolean;
  experimental: boolean;
  costPerImage: number;
  imageCost: (resolution?: string) => number;
} | null>(null);

export function ImageQualityProvider({ children }: { children: ReactNode }) {
  const [quality, updateQuality] = useState<ImageQualityId>("medium");
  const [capable, setCapable] = useState(false);
  const [experimental, setExperimental] = useState(false);
  const [metered, setMetered] = useState(true);
  function setQuality(value: string) {
    const next = IMAGE_QUALITY_IDS.includes(value as ImageQualityId) ? value as ImageQualityId : "medium";
    updateQuality(next);
    updateCurrentImageQuality(next);
    try { localStorage.setItem(IMAGE_QUALITY_STORAGE_KEY, next); } catch { /* Optional preference. */ }
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { cache: "no-store" }).then(res => res.json()).then(config => {
      if (cancelled) return;
      setCapable(!!config.imageQualityCapable);
      setExperimental(!!config.imageQualityExperimental);
      setMetered(!config.db || config.creditsMetered !== false);
      let saved = "medium";
      try { saved = localStorage.getItem(IMAGE_QUALITY_STORAGE_KEY) || "medium"; } catch { /* Optional preference. */ }
      setQuality(config.imageQualityCapable ? saved : "medium");
    }).catch(() => { if (!cancelled) setQuality("medium"); });
    return () => { cancelled = true; };
  }, []);
  const imageCost = (resolution = "1K") => metered ? imageBillCredits(quality, resolution) : 0;
  return <QualityContext.Provider value={{ quality, setQuality, capable, experimental, costPerImage: imageCost(), imageCost }}>{children}</QualityContext.Provider>;
}

export function useImageQuality() {
  const value = useContext(QualityContext);
  if (!value) throw new Error("ImageQualityProvider is missing");
  return value;
}
