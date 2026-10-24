import { NextResponse } from "next/server";

import {deleteFinishedVideoTask, getVideoTask} from "@/lib/video/task-repository";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";
import { safeError } from "@/lib/api-error";
import { publicVideoTaskView } from "@/lib/video/service";
import {publicVideoTaskSnapshot} from "@/lib/video/task-snapshot";
import {sameSiteBiMutation} from "@/lib/bi/access";

// ---------------------------------------------------------------------------
// 单任务只读查询(§6):纯 DB 读,不触发上游轮询。
// 轻量唤醒/结算走 GET /api/video/tasks?id=;恢复扫描由常驻 worker 承担。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const email = await authorizedTargetEmail(request,new URL(request.url).searchParams.get("email"),true);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "缺少任务 id" }, { status: 400 });
  const task = await getVideoTask(email, id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, task: publicVideoTaskView(task),snapshot:publicVideoTaskSnapshot(task) },{headers:{"cache-control":"private, no-store"}});
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站删除"},{status:403});
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "缺少任务 id" }, { status: 400 });
  try {
    const deleted = await deleteFinishedVideoTask(email, id);
    if (!deleted) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    return NextResponse.json({ error: safeError(error, "删除任务失败") }, { status: 409 });
  }
}
