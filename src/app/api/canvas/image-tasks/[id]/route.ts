import { NextResponse } from "next/server";

import { authenticatedEmail } from "@/lib/request-auth";
import { getCanvasImageTask, publicCanvasImageTask } from "@/lib/canvas-image-tasks";
import { getUser } from "@/lib/db";
import { safeError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const task = await getCanvasImageTask(email, String((await context.params).id || ""));
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    const user = task.status === "completed" ? await getUser(email).catch(() => null) : undefined;
    return NextResponse.json({ ok: true, task: publicCanvasImageTask(task), user });
  } catch (error) {
    return NextResponse.json({ error: safeError(error, "图片编辑任务查询失败") }, { status: 502 });
  }
}
