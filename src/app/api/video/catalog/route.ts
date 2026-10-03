import { NextResponse } from "next/server";

import { configuredVideoCatalog } from "@/lib/video/capabilities";
import { configuredVideoProviders, publicProviderSnapshot } from "@/lib/video/providers/config";
import { videoCostPublic } from "@/lib/video/service";
import {billingErrorResponse} from "@/lib/billing/request";
import { modelConfigurationEnabled } from "@/lib/model-config/requests";
import { getModelRuntime } from "@/lib/model-config/server";
import { getVideoModelCapability } from "@/lib/video/capabilities";

// ---------------------------------------------------------------------------
// 视频能力目录(§6):供应商、模型、能力声明与价格展示。
// UI 表单由本目录驱动;服务端创建时按同一份声明二次校验。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
 try{
  if (await modelConfigurationEnabled()) {
    const snapshot = await (await getModelRuntime()).current();
    const models = snapshot.config.publicModels.filter(m => m.modality === "video" && m.visible && m.enabled).map(m => {
      const u = snapshot.config.upstreamModels.find(u => u.id === m.target.id)!;
      const p = snapshot.config.providers.find(p => p.id === u.providerId)!;
      return { ...getVideoModelCapability(p.protocol === "openai-videos" ? "openai-videos" : p.id, u.model), modelId: m.id, providerId: "managed-video", label: m.label, isDefault: snapshot.config.bindings["video.generate"] === m.id };
    });
    const defaultModel = models.find(m => m.isDefault)?.modelId || models[0]?.modelId || "";
    const providers = models.length ? [{ id: "managed-video", label: "视频模型", defaultModel, models, configured: true }] : [];
    return NextResponse.json({ ok: true, version: snapshot.version, configured: !!models.length, provider: providers[0] ? { id: "managed-video", label: "视频模型" } : null, providers, defaultProvider: providers[0]?.id || "", defaultModel, costPerTask: await videoCostPublic(), models }, { headers: { "cache-control": "private, no-store" } });
  }
  const configs = configuredVideoProviders();
  const models = configuredVideoCatalog();
  const providers = configs.map((cfg) => ({
    id: cfg.id, label: cfg.label,
    configured: true,
    defaultModel: cfg.defaultModel,
    models: models.filter((model) => model.providerId === cfg.id),
  }));
  const first = providers[0];
  return NextResponse.json({
    ok: true,
    configured: providers.length > 0,
    provider: first ? { id: first.id, label: first.label } : null,
    providers,
    defaultProvider: first?.id || "",
    defaultModel: first?.defaultModel || "",
    costPerTask: await videoCostPublic(),
    models,
  });
 }catch(e){return billingErrorResponse(e)}
}
