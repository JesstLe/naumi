"use client";
import { useFeatureModels } from "../model-config/feature-client";
import { useImageQuality } from "@/lib/image-quality-context";
import { useBillingEstimate, type QuoteInput } from "./client";
export function useFeatureBilling(feature: QuoteInput["feature"], input: Partial<Omit<QuoteInput, "feature">> = {}) { const { selected } = useFeatureModels(feature); const { quality } = useImageQuality(feature); return useBillingEstimate({ feature, quantity: input.quantity ?? 1, quality, resolution: "1K", modelId: selected || undefined, ...input }); }
