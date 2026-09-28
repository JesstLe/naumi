import { NextResponse } from "next/server";

import { dbEnabled, getUser } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";
import { createVideoGeneration } from "@/lib/video/service";

// ---------------------------------------------------------------------------
// 视频生成入口(兼容契约保持 {ok, taskId, cost, user}):内部已迁移到视频应用层
// (service.createVideoGeneration),规范化参数/能力校验/预扣结算均在 service。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_SECONDS = new Set(["4", "8", "12", "15"]);
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

  try {
    const { taskId, cost } = await createVideoGeneration(email, {
      source: imageUrl ? "agent" : artworkId ? "canvas" : "workbench",
      sourceId: artworkId || undefined,
      prompt,
      seconds,
      size,
      artworkId: artworkId || undefined,
      imageUrl: imageUrl || undefined,
    });
    const user = dbEnabled ? await getUser(email).catch(() => null) : null;
    return NextResponse.json({ ok: true, taskId, cost, user });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "视频任务创建失败") },
      { status: 502 }
    );
  }
}
