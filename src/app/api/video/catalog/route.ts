import { NextResponse } from "next/server";

import { authenticatedEmail } from "@/lib/request-auth";
import { videoCatalog } from "@/lib/video/capabilities";
import { resolveOpenAiVideosConfig } from "@/lib/video/providers/openai-videos";
import { videoCostPublic } from "@/lib/video/service";

// ---------------------------------------------------------------------------
// 视频能力目录(§6):供应商、模型、能力声明与价格展示。
// UI 表单由本目录驱动;服务端创建时按同一份声明二次校验。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = resolveOpenAiVideosConfig();
  const defaultModel = cfg?.model || "";
  return NextResponse.json({
    ok: true,
    configured: Boolean(cfg),
    provider: { id: "openai-videos", label: "OpenAI Videos 兼容" },
    defaultModel,
    costPerTask: videoCostPublic(),
    models: videoCatalog(defaultModel),
  });
}
