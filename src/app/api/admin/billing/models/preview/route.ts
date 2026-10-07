import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "@/lib/bi/access";
import { getModelAdministration } from "@/lib/model-config/server";
import { businessPreview } from "@/lib/model-config/business-preview";
import { FEATURE_IDS } from "@/lib/billing/rules/registry";
import { ModelConfigError } from "@/lib/model-config/types";
export const runtime = "nodejs", dynamic = "force-dynamic";
const schema = z.strictObject({ draftId: z.uuid(), expectedRevision: z.number().int().positive(), feature: z.enum(FEATURE_IDS), modelId: z.string().max(100), quality: z.string().max(10), resolution: z.enum(["1K", "2K", "4K"]), references: z.number().int().min(0).max(32), inputLength: z.number().int().min(0).max(1000000), task: z.enum(["draft", "product", "detail", "layout"]) });
export async function POST(request: Request) {
  const auth = await biAuthorize(request); if (auth instanceof Response) return auth;
  if (!sameSiteBiMutation(request)) return biJson({ error: "不允许跨站修改" }, 403);
  try {
    const raw = await request.text(); if (raw.length > 20000) return biJson({ error: "请求过大" }, 413);
    const input = schema.parse(JSON.parse(raw)), admin = await getModelAdministration(), draft = await admin.repo.draft(auth.actor);
    if (draft.id !== input.draftId || draft.revision !== input.expectedRevision) return biJson({ error: "草稿已更新，请重新保存" }, 409);
    return biJson(businessPreview({ version: draft.basedOnVersion, digest: "", config: draft.config }, await admin.billing.current(), { feature: input.feature, modelId: input.modelId, quantity: 1, quality: input.quality, resolution: input.resolution, metered: true, byok: false, paidFen: 0, userGroup: "default" }, { task: input.task, quality: input.quality, resolution: input.resolution, references: input.references, inputLength: input.inputLength, needsEdit: input.references > 0, needsText: false, preserveIdentity: input.references > 0, nativeResolution: input.resolution !== "1K" }));
  } catch (e) { return biJson({ error: e instanceof ModelConfigError ? e.message : "报价模拟参数无效", code: e instanceof ModelConfigError ? e.code : "INVALID_REQUEST" }, e instanceof ModelConfigError ? e.status : 400); }
}
