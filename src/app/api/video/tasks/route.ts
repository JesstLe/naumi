import { NextResponse } from "next/server";

import {
  addArtworks,
  dbEnabled,
  getVideoTask,
  refundCredits,
  updateVideoTask,
} from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";
import {
  fetchVideoContent,
  getVideoStatus,
  resolveVideoConfig,
} from "@/lib/video/client";

// ---------------------------------------------------------------------------
// 视频任务查询(惰性轮询):前端每次 GET,服务端查一次上游并回写。
// completed 时拉回视频 → 转存 /media → 落画布视频节点(category="video")→
// 返回 artworkId 供前端 mergeWorks 挂树。失败自动退积分。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function GET(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!email || !id) return NextResponse.json({ error: "缺少任务 id" }, { status: 400 });

  const task = await getVideoTask(email, id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (task.status !== "processing") {
    return NextResponse.json({ ok: true, task });
  }

  const cfg = resolveVideoConfig();
  if (!cfg) return NextResponse.json({ ok: true, task });

  try {
    const status = await getVideoStatus(cfg, task.upstreamId);
    if (status.status === "failed") {
      await updateVideoTask(email, id, {
        status: "failed",
        error: status.error || "上游生成失败",
      });
      await refundCredits(email, Number(process.env.VIDEO_TASK_COST || 20) || 20).catch(() => {});
      return NextResponse.json({
        ok: true,
        task: { ...task, status: "failed", error: status.error || "上游生成失败" },
      });
    }
    if (status.status !== "completed") {
      await updateVideoTask(email, id, { progress: Math.min(95, status.progress) });
      return NextResponse.json({
        ok: true,
        task: { ...task, status: "processing", progress: Math.min(95, status.progress) },
      });
    }

    // 完成:拉回视频转存,落画布视频节点
    const file = await fetchVideoContent(cfg, task.upstreamId);
    const artworkId = `vid-art-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let url = `data:${file.mime};base64,${file.buffer.toString("base64")}`;
    if (storageEnabled) {
      url = await uploadImage(new Uint8Array(file.buffer), file.mime, `videos/${artworkId}.mp4`);
    }
    await addArtworks(email, [{
      id: artworkId,
      title: `视频 · ${task.prompt.slice(0, 24)}`,
      category: "video",
      prompt: task.prompt,
      status: "completed",
      image: url,
      gradient: "from-slate-100 to-zinc-100",
      style: null,
      ratio: null,
      resolution: "1K",
      source: null,
      parentId: null,
      parentIds: [],
      origin: "canvas",
      width: 0,
      height: 0,
      videoUrl: url,
    }], `vid-${Date.now()}`);
    await updateVideoTask(email, id, {
      status: "completed",
      progress: 100,
      artworkId,
      videoUrl: url,
    });
    return NextResponse.json({ ok: true, task: { ...task, status: "completed", artworkId, videoUrl: url } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "视频任务查询失败";
    // 查询类瞬时失败不改任务状态(下次轮询重试);明确的失败才终止
    if (/上游生成失败|视频超过/.test(message)) {
      await updateVideoTask(email, id, { status: "failed", error: message });
      await refundCredits(email, Number(process.env.VIDEO_TASK_COST || 20) || 20).catch(() => {});
      return NextResponse.json({ ok: true, task: { ...task, status: "failed", error: message } });
    }
    return NextResponse.json({ ok: true, task, warning: message });
  }
}
