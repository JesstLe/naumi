import { NextResponse } from "next/server";

import { authenticatedEmail } from "@/lib/request-auth";
import { safeError } from "@/lib/api-error";
import { listVideoTaskViews, pollAndSettle } from "@/lib/video/service";

// ---------------------------------------------------------------------------
// 视频任务查询(兼容契约 {ok, task}):惰性触发一次服务端轮询与结算(service)。
// 无 id 时为列表模式(§6):按状态过滤列出当前用户任务,工作台历史区数据源。
// 页面关闭也没关系——常驻 worker 会继续恢复扫描。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const VALID_STATUS = new Set(["processing", "queued", "completed", "failed"]);

export async function GET(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";

  if (!id) {
    const status = url.searchParams.get("status") || "";
    const limit = Number(url.searchParams.get("limit") || "30");
    const tasks = await listVideoTaskViews(email, {
      status: VALID_STATUS.has(status) ? status : undefined,
      limit: Number.isFinite(limit) ? limit : 30,
    });
    return NextResponse.json({ ok: true, tasks });
  }

  try {
    const task = await pollAndSettle(email, id);
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "视频任务查询失败") },
      { status: 502 }
    );
  }
}
