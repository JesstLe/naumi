"use client";
import { useFeatureModels } from "@/lib/model-config/feature-client";
import { adminConfiguredFeature } from "@/lib/model-config/selection-policy";
import type { FeatureId } from "@/lib/billing/rules/registry";
export function FeatureModelSelect({ feature, disabled = false }: { feature: FeatureId; disabled?: boolean }) {
  const { catalog, selected, setSelected, error } = useFeatureModels(feature);
  if (adminConfiguredFeature(feature)) return null;
  if (error) return <p role="alert" className="text-xs text-red-700">{error}</p>;
  if (!catalog?.managed || catalog.supported === false) return null;
  return <label className="grid gap-1.5 text-xs text-c-text">执行模型<select aria-label={`${feature} 模型`} value={selected} onChange={e => setSelected(e.target.value)} disabled={disabled || !catalog.models.length} className="w-full rounded-md border border-c-border bg-white px-3 py-2 text-sm">{catalog.models.length ? catalog.models.map(m => <option key={m.id} value={m.id}>{m.label}{m.creditHint?` · ${m.creditHint}`:""}</option>) : <option value="">当前功能没有启用模型</option>}</select></label>;
}
