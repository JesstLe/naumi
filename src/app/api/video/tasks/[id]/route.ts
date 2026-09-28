import { NextResponse } from "next/server";

import { getVideoTask } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";

// ---------------------------------------------------------------------------
// 单任务只读查询(§6):纯 DB 读,不触发上游轮询。
// 轻量唤醒/结算走 GET /api/video/tasks?id=;恢复扫描由常驻 worker 承担。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = context.params;
  if (!id) return NextResponse.json({ error: "缺少任务 id" }, { status: 400 });
  const task = await getVideoTask(email, id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, task });
}
