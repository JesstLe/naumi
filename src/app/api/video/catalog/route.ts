import { NextResponse } from "next/server";

import { configuredVideoCatalog } from "@/lib/video/capabilities";
import { configuredVideoProviders } from "@/lib/video/providers/config";
import {videoCostPublic} from "@/lib/video/queries";
import {billingErrorResponse} from "@/lib/billing/request";
import { modelConfigurationEnabled } from "@/lib/model-config/availability";
import {readPublishedModelSnapshot} from "@/lib/model-config/published";
import {publicModelCatalog} from "@/lib/model-config/public-catalog";
import { freezeManagedVideoCapability } from "@/lib/video/frozen-capability";
import { legacyVideoView } from "@/lib/video/model-definition";
import {projectVideoUiContract} from '@/lib/video/ui-projection';

// ---------------------------------------------------------------------------
// 视频能力目录(§6):供应商、模型、能力声明与价格展示。
// 新执行绑定投影公开 Profile 控件;旧能力声明仅供尚未迁移的链路使用。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
 try{
  if (await modelConfigurationEnabled()) {
    const snapshot = await readPublishedModelSnapshot();
    const catalog = publicModelCatalog(snapshot, "video", "video.generate");
    const models = await Promise.all(catalog.models.map(async publicModel => {
      const m = snapshot.config.publicModels.find(m => m.id === publicModel.id)!;
      const u = snapshot.config.upstreamModels.find(u => u.id === m.target.id)!;
      const p = snapshot.config.providers.find(p => p.id === u.providerId)!;
      const frozen=await freezeManagedVideoCapability(snapshot,u,p);
      return { ...legacyVideoView({...frozen.definition,sources:frozen.sources},{modelId:m.id,providerId:"managed-video",label:m.label}),
        ...(frozen.execution?{execution:projectVideoUiContract(frozen.execution,{publicModelId:m.id,wireModel:u.model,connectionId:p.id})}:{}),
        isDefault: (catalog.defaultModelId || snapshot.config.bindings["video.generate"]) === m.id };
    }));
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
