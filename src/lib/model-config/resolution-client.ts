"use client";
import { useEffect, useMemo } from "react";
import { useFeatureModels } from "./feature-client";
import { imageModelDisplayId } from "../image-model-routing";
import type { FeatureId } from "../billing/rules/registry";
import { GENERATION_RESOLUTIONS } from "../mock-data";

export function useImageResolutions(feature: FeatureId, value: string, setValue: (value: string) => void, modelId?: string) {
  const { catalog, selected } = useFeatureModels(feature);
  const model = catalog?.models.find(m => imageModelDisplayId(m.id) === imageModelDisplayId(modelId || selected || ""));
  const resolutions = useMemo(() => model?.generationParameters?.resolutions || GENERATION_RESOLUTIONS.map(r => r.id), [model]);
  useEffect(() => {
    if (catalog && !resolutions.includes(value)) setValue(resolutions[0] || "1K");
  }, [catalog, resolutions, value, setValue]);
  return resolutions;
}
