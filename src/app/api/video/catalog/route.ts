import { NextResponse } from "next/server";

import { configuredVideoCatalog } from "@/lib/video/capabilities";
import { configuredVideoProviders, publicProviderSnapshot } from "@/lib/video/providers/config";
import { videoCostPublic } from "@/lib/video/service";

// ---------------------------------------------------------------------------
// 视频能力目录(§6):供应商、模型、能力声明与价格展示。
// UI 表单由本目录驱动;服务端创建时按同一份声明二次校验。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configs = configuredVideoProviders();
  const models = configuredVideoCatalog();
  const providers = configs.map((cfg) => ({
    ...publicProviderSnapshot(cfg),
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
    costPerTask: videoCostPublic(),
    models,
  });
}
