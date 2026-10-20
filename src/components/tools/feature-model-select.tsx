"use client";
import { useFeatureModels } from "@/lib/model-config/feature-client";
import { adminConfiguredFeature } from "@/lib/model-config/selection-policy";
import type { FeatureId } from "@/lib/billing/rules/registry";
import {SelectMenu} from "@/components/ui/select-menu";
import {ModelIcon} from "@/components/ui/model-icon";
import {useI18n} from "@/lib/i18n/locale-context";
import {useAuth} from "@/lib/auth-context";
import {useFeatureAccess} from "@/lib/feature-access/client";
import {featureExecutionBlock, featureExecutionMessage} from "@/lib/model-config/feature-availability";
export function FeatureModelSelect({ feature, disabled = false }: { feature: FeatureId; disabled?: boolean }) {
  const { catalog, selected, setSelected, error } = useFeatureModels(feature);
  const {locale}=useI18n();
  const {ready:authReady}=useAuth(),{ready:accessReady}=useFeatureAccess();
  const blocked = featureExecutionBlock(catalog, error);
  if (blocked) return <p role={error ? "alert" : "status"} className={error ? "text-xs text-red-700" : "text-xs text-c-text2"}>{featureExecutionMessage(blocked, locale)}</p>;
  if (adminConfiguredFeature(feature)) return null;
  if (!catalog?.managed || catalog.supported === false) return null;
  const label=locale==="en"?"Model":"执行模型";
  return <div className="grid min-w-0 gap-1.5 text-xs text-c-text"><span>{label}</span><SelectMenu label={label} value={selected} onChange={setSelected} disabled={disabled || !authReady || !accessReady || !catalog.models.length} className="w-full" options={catalog.models.map(m=>({value:m.id,label:<span className="flex min-w-0 items-center gap-2"><ModelIcon modelId={m.id} modelName={m.label} size={16}/><span className="min-w-0 truncate">{m.label}</span></span>}))} />{!catalog.models.length&&<p role="status">{locale==="en"?"No enabled model":"当前功能没有启用模型"}</p>}</div>;
}
