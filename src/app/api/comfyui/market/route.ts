import { NextResponse } from "next/server";

import {copyComfyWorkflow, listPublicComfyWorkflows, publishComfyWorkflow} from "@/lib/comfyui/repository";
import {dbEnabled} from "@/platform/db/pool";
import { authenticatedEmail } from "@/lib/request-auth";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { clientIp } from "@/lib/ip";

// ---------------------------------------------------------------------------
// ComfyUI 工作流市场:GET 公开列表(不含自己的) / POST(publish|copy)。
// 一键导入 = 深拷贝公开工作流到自己的库;发布记录展示名(邮箱本地部分)。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor(request: Request) {
  if (!dbEnabled) return null;
  return authenticatedEmail(request);
}

export async function GET(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const market = await listPublicComfyWorkflows(email);
  return NextResponse.json({ market });
}

export async function POST(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const rateLimitResult = await checkRateLimit(`comfyui-mkt:${clientIp(request) || "0.0.0.0"}`, 30, 10 * 60 * 1000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as
    | { action?: string; id?: string; isPublic?: boolean }
    | null;
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "缺少工作流 id" }, { status: 400 });
  try {
    if (body?.action === "publish") {
      await publishComfyWorkflow(email, id, body.isPublic !== false);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "copy") {
      const newId = await copyComfyWorkflow(email, id);
      return NextResponse.json({ ok: true, savedId: newId });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "市场操作失败" },
      { status: 400 }
    );
  }
}
