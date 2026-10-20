import { NextResponse } from "next/server";
import { isFeatureId } from "@/lib/billing/rules/registry";
import { modelConfigurationEnabled } from "@/lib/model-config/requests";
import { getModelRuntime } from "@/lib/model-config/server";
import { FEATURE_BINDINGS } from "@/lib/model-config/business";
import { MODEL_BINDINGS } from "@/lib/model-config/bindings";
import { ModelConfigError } from "@/lib/model-config/types";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) {
  const feature = new URL(request.url).searchParams.get("feature");
  if (!isFeatureId(feature)) return NextResponse.json({ error: "未知业务操作" }, { status: 400 });
  try {
    if (!await modelConfigurationEnabled()) return NextResponse.json({ managed: false, feature, models: [] }, { headers: { "cache-control": "no-store" } });
    const binding = FEATURE_BINDINGS[feature];
    if (!binding) return NextResponse.json({ managed: true, feature, supported: false, error: "该操作使用独立处理器，未接入模型选择", models: [] }, { headers: { "cache-control": "no-store" } });
    const catalog = await (await getModelRuntime()).publicCatalog(MODEL_BINDINGS[binding].modality, feature);
    // Preserve the existing standalone segmentation path when no managed binding
    // owns cutout. Never publish its token or an internal/hidden model name.
    if (feature === "tool.cutout" && !catalog.available) {
      const { getModelAdministration } = await import("@/lib/model-config/server");
      const snapshot = await (await getModelAdministration()).repo.byVersion(catalog.version);
      if (!snapshot.config.business?.[feature] && !snapshot.config.bindings[binding]) {
        const { getCutoutSettings } = await import("@/lib/settings");
        const settings = await getCutoutSettings();
        if (settings.backend !== "openai" && !!settings.replicateToken) return NextResponse.json({ managed: true, supported: false, ...catalog, available: true }, { headers: { "cache-control": "no-store" } });
      }
    }
    return NextResponse.json({ managed: true, supported: true, ...catalog }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof ModelConfigError ? e.message : "模型列表暂不可用" }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
