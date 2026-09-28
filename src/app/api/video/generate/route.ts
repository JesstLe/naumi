import { NextResponse } from "next/server";

import {
  createVideoTask,
  addReservation,
  dbEnabled,
  getUser,
  listArtworksByIds,
  reserveCredits,
  settleReservation,
} from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { readCanvasImage } from "@/lib/canvas-image-input";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";
import {
  createVideoTask as createUpstreamTask,
  resolveVideoConfig,
  videoCost,
} from "@/lib/video/client";

// ---------------------------------------------------------------------------
// 视频生成:创建上游任务(OpenAI videos 协议)并预扣积分。
// 前端随后轮询 GET /api/video/tasks?id= 由服务端惰性查上游、转存、落画布节点。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_SECONDS = new Set(["4", "8", "12"]);
const ALLOWED_SIZES = new Set(["1280x720", "720x1280", "1024x1024", "720x1080", "1080x720"]);

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`video-gen:${clientIp(request) || "0.0.0.0"}`, 6, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "视频生成过于频繁，请稍后再试" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as
    | { prompt?: string; artworkId?: string; imageUrl?: string; seconds?: string; size?: string }
    | null;
  const prompt = String(body?.prompt || "").trim().slice(0, 1000);
  const seconds = ALLOWED_SECONDS.has(String(body?.seconds)) ? String(body?.seconds) : "4";
  const size = ALLOWED_SIZES.has(String(body?.size)) ? String(body?.size) : "1280x720";
  const artworkId = String(body?.artworkId || "").trim();
  // agent 场景:无画布节点,直接传[商品图] URL
  const imageUrl = String(body?.imageUrl || "").trim().slice(0, 600);
  if (!email || !prompt) {
    return NextResponse.json({ error: "请填写视频描述" }, { status: 400 });
  }

  const cfg = resolveVideoConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "视频服务未配置(需在服务器设置 VIDEO_API_BASE_URL/KEY/MODEL)" },
      { status: 503 }
    );
  }

  const cost = videoCost();
  let reserved = false;
  const taskId = `vid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  try {
    // 图生视频:带上选中画布图或 agent 传入的图片 URL 作为参考帧(文生视频可不带)
    let image: { bytes: Buffer; mime: string; filename: string } | undefined;
    if (artworkId) {
      const source = (await listArtworksByIds(email, [artworkId]))[0];
      if (!source) return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });
      const img = await readCanvasImage(source.image, request.url);
      image = { bytes: img.buffer, mime: img.mimeType, filename: `naumi-${source.id}.png` };
    } else if (imageUrl) {
      const img = await readCanvasImage(imageUrl, request.url);
      image = { bytes: img.buffer, mime: img.mimeType, filename: `naumi-agent-${Date.now()}.png` };
    }

    if (dbEnabled) {
      reserved = await reserveCredits(email, cost);
      if (!reserved) return NextResponse.json({ error: `积分不足，本条视频需要 ${cost} 积分` }, { status: 402 });
      await addReservation(taskId, email, cost);
    }

    const created = await createUpstreamTask(cfg, { prompt, seconds, size, image });
    const task = await createVideoTask({
      id: taskId,
      email,
      upstreamId: created.upstreamId,
      model: cfg.model,
      prompt,
      size,
      seconds,
      cost,
      requestBody: created.requestBody,
    });
    const user = dbEnabled ? await getUser(email).catch(() => null) : null;
    return NextResponse.json({ ok: true, taskId: task.id, cost, user });
  } catch (error) {
    if (reserved && dbEnabled) {
      const { refundCredits } = await import("@/lib/db");
      await refundCredits(email, cost).catch(() => {});
      await settleReservation(taskId).catch(() => {});
    }
    return NextResponse.json(
      { error: safeError(error, "视频任务创建失败") },
      { status: 502 }
    );
  }
}
