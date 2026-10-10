import type {MetadataQualityDefaults} from "../supplier-models/quality-defaults";
import { z } from "zod";
import { ModelConfigError, type ModelConfig, type UpstreamModel } from "./types";

export const DISPLAY_QUALITY_IDS = ["low", "medium", "high", "xhigh", "max"] as const;
export const DEFAULT_QUALITY_LABELS = { low: "低", medium: "标准", high: "高", xhigh: "超高", max: "最高" };
export const qualityPolicySchema = z.strictObject({
  mode: z.enum(["map", "passthrough", "omit"]),
  choices: z.array(z.strictObject({ id: z.enum(DISPLAY_QUALITY_IDS), label: z.string().trim().min(1).max(30), value: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/).optional() })).min(1).max(5),
  evidence: z.strictObject({ status: z.enum(["unverified", "documented", "accepted", "rejected"]), source: z.string().trim().max(1000), checkedAt: z.string().max(30) }).optional(),
}).superRefine((p, ctx) => {
  if (new Set(p.choices.map(c => c.id)).size !== p.choices.length) ctx.addIssue({ code: "custom", message: "质量档位不能重复" });
  if (p.mode === "map" && p.choices.some(c => !c.value)) ctx.addIssue({ code: "custom", message: "每个显示档位需要填写上游值" });
  if (p.evidence?.status !== undefined && p.evidence.status !== "unverified" && !p.evidence.source) ctx.addIssue({ code: "custom", message: "请记录参数核对依据" });
});
export type QualityPolicy = z.infer<typeof qualityPolicySchema>;
export function policyQuality(policy: QualityPolicy | undefined, requested: unknown): string | undefined {
  if (!policy) return typeof requested === "string" ? requested : undefined;
  const id = typeof requested === "string" ? requested : "medium";
  const choice = policy.choices.find(c => c.id === id);
  if (!choice) throw new ModelConfigError("MODEL_PARAMETER_UNAVAILABLE", "该模型未开放此质量档位，请刷新参数列表", 409);
  return policy.mode === "omit" ? undefined : policy.mode === "passthrough" ? choice.id : choice.value;
}
export function qualityPresentation(upstreams: UpstreamModel[]) {
  const policy = upstreams.find(u => u.parameterMap.qualityPolicy)?.parameterMap.qualityPolicy;
  return policy ? { qualities: policy.choices.map(c => c.id), qualityLabels: Object.fromEntries(policy.choices.map(c => [c.id, c.label])) } : undefined;
}
export function qualityConfiguration(config: ModelConfig, ids: string[]) {
  const routes = ids.map(id => config.upstreamModels.find(u => u.id === id)!).filter(Boolean);
  const presentation = qualityPresentation(routes);
  const first = routes[0];
  const qualities = presentation?.qualities || DISPLAY_QUALITY_IDS.filter(q => first?.capabilities.qualities.includes(q));
  const choices = (qualities.length ? qualities : ["medium" as const]).map(id => ({ id, label: presentation?.qualityLabels[id] || DEFAULT_QUALITY_LABELS[id] }));
  return { choices, routes: routes.map(u => {
    const provider = config.providers.find(p => p.id === u.providerId)!;
    const policy = u.parameterMap.qualityPolicy;
    return { upstreamId: u.id, model: u.model, provider: provider.name, protocol: provider.protocol,
      editable: ["openai-images", "new-api-flow"].includes(provider.protocol) && !config.publicModels.some(m=>m.enabled && m.target.type === "pool" && config.pools.find(p=>p.id===m.target.id)?.candidates.includes(u.id)),
      mode: policy?.mode || (Object.keys(u.parameterMap.quality || {}).length ? "map" : u.capabilities.qualities.length ? "passthrough" : "omit"),
      values: Object.fromEntries(DISPLAY_QUALITY_IDS.map(id => [id, policy?.choices.find(c => c.id === id)?.value || u.parameterMap.quality?.[id] || id])),
      evidence: policy?.evidence || { status: "unverified", source: "", checkedAt: "" }, configured: Boolean(policy), metadataDefaults:null as MetadataQualityDefaults|null, metadataRef:null as {id:string;revision:number}|null };
  }) };
}
