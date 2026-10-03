import { NextResponse } from "next/server";

import { authenticatedEmail } from "@/lib/request-auth";
import { enqueueTextEditTask, listCanvasImageTasks, publicCanvasImageTask } from "@/lib/canvas-image-tasks";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`canvas-image-task:${clientIp(request) || "0.0.0.0"}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "图片编辑操作过于频繁，请稍后再试" }, { status: 429 });
  }
  try {
    const body = await request.json();
    if (String(body?.kind || "text-edit") !== "text-edit") {
      return NextResponse.json({ error: "暂不支持该图片编辑任务" }, { status: 400 });
    }
    const task = await enqueueTextEditTask(email, { ...body, quality: body.quality ?? request.headers.get("x-naumi-image-quality") ?? "medium" });
    return NextResponse.json({ ok: true, taskId: task.id, task: publicCanvasImageTask(task) }, { status: 202 });
  } catch (error) {
    const message = safeError(error, "图片编辑任务创建失败");
    const status = message.includes("积分不足") ? 402 : message.includes("不存在") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "50");
  const sourceArtworkIds = (url.searchParams.get("sourceIds") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 500);
  const tasks = await listCanvasImageTasks(email, Number.isFinite(limit) ? limit : 50, sourceArtworkIds);
  return NextResponse.json({ ok: true, tasks: tasks.map(publicCanvasImageTask) });
}
