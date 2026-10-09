"use client";
import { useCallback, useEffect, useState } from "react";
import { MODEL_CATALOG_REFRESH } from "./public-client";
import type { FeatureId } from "../billing/rules/registry";
import { compactImageModelOptions, imageModelDisplayId } from "../image-model-routing";
import { authHeader } from "../supabase";
export type FeatureCatalog = { managed: boolean; supported?: boolean; feature: FeatureId; version?: number; defaultModelId?: string; models: { id: string; label: string; modality: string; supportsEdit: boolean; qualities?: string[]; nativeResolutions?: string[] }[] };
const catalogs = new Map<FeatureId, FeatureCatalog>(), selections = new Map<FeatureId, string>();
export const FEATURE_MODEL_SELECTION = "naumi:feature-model-selected";
const EVENT = FEATURE_MODEL_SELECTION;
const inflight = new Map<FeatureId, Promise<FeatureCatalog>>();
function loadCatalog(feature: FeatureId) {
  let promise = inflight.get(feature);
  if (!promise) {
    promise = (async () => {
      const res = await fetch(`/api/models?feature=${encodeURIComponent(feature)}`, { cache: "no-store", headers: await authHeader() }), data = await res.json();
      if (!res.ok) throw new Error(data.error || "模型列表加载失败");
      if (data.models?.some((m: { modality: string }) => m.modality === "image")) {
        data.models = compactImageModelOptions(data.models, [data.defaultModelId].filter(Boolean));
        data.defaultModelId = data.models.find((m: { id: string }) => imageModelDisplayId(m.id) === imageModelDisplayId(data.defaultModelId || ""))?.id || data.models[0]?.id;
      }
      return data as FeatureCatalog;
    })();
    inflight.set(feature,promise);
    promise.finally(() => inflight.delete(feature)).catch(() => {});
  }
  return promise;
}
export function chosenFeatureModel(feature: FeatureId) { return selections.get(feature) || catalogs.get(feature)?.defaultModelId; }
export function featureModelManaged(feature: FeatureId) { return catalogs.get(feature)?.managed === true; }
export function selectFeatureModel(feature: FeatureId, id: string) {
  if (!catalogs.get(feature)?.models.some(m => m.id === id)) return;
  selections.set(feature, id);
  try { localStorage.setItem(`naumi:model:${feature}`, id); } catch {}
  window.dispatchEvent(new Event(EVENT));
}
export function useFeatureModels(feature: FeatureId) {
  const [catalog, setCatalog] = useState<FeatureCatalog | null>(catalogs.get(feature) || null), [selected, setSelected] = useState(chosenFeatureModel(feature) || ""), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await loadCatalog(feature);
        if (cancelled) return;
        catalogs.set(feature, data); setCatalog(data); setError(null);
        let saved = selections.get(feature); try { saved ||= localStorage.getItem(`naumi:model:${feature}`) || undefined; } catch {}
        const id = data.models.find(m => imageModelDisplayId(m.id) === imageModelDisplayId(saved || ""))?.id || data.defaultModelId || data.models[0]?.id;
        if (id) selections.set(feature, id); else selections.delete(feature);
        setSelected(id || "");
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "读取失败"); setCatalog(null); catalogs.delete(feature); } }
    };
    const changed = () => setSelected(chosenFeatureModel(feature) || "");
    void load(); window.addEventListener(MODEL_CATALOG_REFRESH, load); window.addEventListener(EVENT, changed);
    return () => { cancelled = true; window.removeEventListener(MODEL_CATALOG_REFRESH, load); window.removeEventListener(EVENT, changed); };
  }, [feature]);
  return { catalog, selected, error, setSelected: useCallback((id: string) => selectFeatureModel(feature, id), [feature]) };
}
