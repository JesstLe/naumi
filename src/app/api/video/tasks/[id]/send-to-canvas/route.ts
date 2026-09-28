import { NextResponse } from "next/server";

import { addArtworks, dbEnabled, getVideoTask, listArtworksByIds, setArtworkOrigin } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { safeError } from "@/lib/api-error";

// ---------------------------------------------------------------------------
// 发送到画布(§6):completed 任务把结果定位/补建为画布视频作品,返回 artworkId。
// 常规完成时作品已存在(vid-art-<taskId>)——校验仍在则直接返回;
// 作品被删过则从 videoUrl 补建一条(无血缘,独立根节点)。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = context.params;
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const task = await getVideoTask(email, id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (task.status !== "completed" || !task.videoUrl) {
    return NextResponse.json({ error: "任务尚未成功完成" }, { status: 400 });
  }

  try {
    if (task.artworkId) {
      const existing = await listArtworksByIds(email, [task.artworkId]);
      if (existing.length) {
        await setArtworkOrigin(email, task.artworkId, "canvas");
        return NextResponse.json({ ok: true, artworkId: task.artworkId, reused: true });
      }
    }
    const artworkId = task.artworkId || `vid-art-${id}`;
    await addArtworks(email, [{
      id: artworkId,
      title: `视频 · ${task.prompt.slice(0, 24)}`,
      category: "video",
      prompt: task.prompt,
      status: "completed",
      image: task.videoUrl,
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
      videoUrl: task.videoUrl,
    }], `vid-${Date.now()}`);
    return NextResponse.json({ ok: true, artworkId });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "发送到画布失败") },
      { status: 502 }
    );
  }
}
