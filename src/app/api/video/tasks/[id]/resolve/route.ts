import { NextResponse } from "next/server";

import { bindUnknownVideoTaskUpstream, failVideoTask, getVideoTask } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { safeError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { id: string } }) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const task = await getVideoTask(email, context.params.id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (task.status !== "needs_attention") {
    return NextResponse.json({ error: "任务当前不需要人工核对" }, { status: 409 });
  }
  const body = await request.json().catch(() => null) as { action?: string; upstreamId?: string } | null;
  try {
    if (body?.action === "bind") {
      const ok = await bindUnknownVideoTaskUpstream({
        email,
        id: task.id,
        upstreamId: String(body.upstreamId || ""),
      });
      if (!ok) return NextResponse.json({ error: "请填写核对后的上游任务 ID" }, { status: 400 });
      return NextResponse.json({ ok: true, status: "processing" });
    }
    if (body?.action === "cancel_confirmed_not_created") {
      await failVideoTask({ email, id: task.id, error: "已人工确认上游未创建，任务取消并释放预扣" });
      return NextResponse.json({ ok: true, status: "failed" });
    }
    return NextResponse.json({ error: "无效的核对动作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: safeError(error, "核对任务失败") }, { status: 409 });
  }
}
