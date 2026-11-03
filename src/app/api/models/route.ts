import { NextResponse } from "next/server";
import { isFeatureId } from "@/lib/billing/rules/registry";
import { modelConfigurationEnabled } from "@/lib/model-config/availability";
import {readPublishedModelSnapshot} from "@/lib/model-config/published";
import {readPublishedModelCatalog} from "@/lib/model-config/catalog-query";
import { FEATURE_BINDINGS } from "@/lib/model-config/feature-model-policy";
import { MODEL_BINDINGS } from "@/lib/model-config/bindings";
import { ModelConfigError } from "@/lib/model-config/types";
import { frontendImageCatalog } from "@/lib/frontend-image-models";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) {
  const feature = new URL(request.url).searchParams.get("feature");
  if (!isFeatureId(feature)) return NextResponse.json({ error: "未知业务操作" }, { status: 400 });
  try {
    // Upscale uses its dedicated super-resolution processor, not an image model
    // selector. Publish its real readiness even when model management is off.
    if (feature === "tool.upscale") return NextResponse.json({ managed: true, feature, supported: false, available: !!process.env.REPLICATE_API_TOKEN?.trim(), models: [] }, { headers: { "cache-control": "no-store" } });
    if (!await modelConfigurationEnabled()) return NextResponse.json({ managed: false, feature, models: [] }, { headers: { "cache-control": "no-store" } });
    const binding = FEATURE_BINDINGS[feature];
    if (!binding) return NextResponse.json({ managed: true, feature, supported: false, error: "该操作使用独立处理器，未接入模型选择", models: [] }, { headers: { "cache-control": "no-store" } });
    const modality = MODEL_BINDINGS[binding].modality;
    const snapshot=await readPublishedModelSnapshot();
    const rawCatalog = await readPublishedModelCatalog(modality, feature,snapshot);
    const catalog = modality === "image" ? frontendImageCatalog(rawCatalog) : rawCatalog;
    // Preserve the existing standalone segmentation path when no managed binding
    // owns cutout. Never publish its token or an internal/hidden model name.
    if (feature === "tool.cutout" && !catalog.available) {
      if (!snapshot.config.business?.[feature] && !snapshot.config.bindings[binding]) {
        const { getCutoutSettings } = await import("@/lib/settings");
        const settings = await getCutoutSettings();
        if (settings.backend !== "openai" && !!settings.replicateToken) return NextResponse.json({ managed: true, supported: false, ...catalog, available: true }, { headers: { "cache-control": "no-store" } });
      }
    }
    return NextResponse.json({ managed: true, supported: true, ...catalog }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof ModelConfigError ? e.message : "模型列表暂不可用" }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
