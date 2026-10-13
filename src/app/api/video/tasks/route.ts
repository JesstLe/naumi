import { NextResponse } from "next/server";

import { authenticatedEmail } from "@/lib/request-auth";
import { safeError } from "@/lib/api-error";
import {getVideoTaskByIdempotencyKey} from "@/lib/db";
import { listVideoTaskViews, pollAndSettle, publicVideoTaskView } from "@/lib/video/service";

// ---------------------------------------------------------------------------
// 视频任务查询(兼容契约 {ok, task}):惰性触发一次服务端轮询与结算(service)。
// 无 id 时为列表模式(§6):按状态过滤列出当前用户任务,工作台历史区数据源。
// 页面关闭也没关系——常驻 worker 会继续恢复扫描。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const VALID_STATUS = new Set(["processing", "queued", "needs_attention", "completed", "failed", "cancelled"]);

export async function GET(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const operation=url.searchParams.get("idempotencyKey");
  if(!id&&operation){const task=await getVideoTaskByIdempotencyKey(email,operation);return task?NextResponse.json({ok:true,task:publicVideoTaskView(task)}):NextResponse.json({error:"任务不存在"},{status:404});}

  if (!id) {
    const status = url.searchParams.get("status") || "";
    const source = url.searchParams.get("source") || "";
    const sourceIds = (url.searchParams.get("sourceIds") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 500);
    const limit = Number(url.searchParams.get("limit") || "30");
    const tasks = await listVideoTaskViews(email, {
      status: VALID_STATUS.has(status) ? status : undefined,
      source: ["canvas", "workbench", "agent", "workflow"].includes(source) ? source : undefined,
      sourceIds,
      projectKey: url.searchParams.get("projectKey") || undefined,
      nodeId: url.searchParams.get("nodeId") || undefined,
      limit: Number.isFinite(limit) ? limit : 30,
    });
    return NextResponse.json({ ok: true, tasks: tasks.map(publicVideoTaskView) });
  }

  try {
    const task = await pollAndSettle(email, id);
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, task: publicVideoTaskView(task) });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "视频任务查询失败") },
      { status: 502 }
    );
  }
}
