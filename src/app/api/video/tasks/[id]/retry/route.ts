import { NextResponse } from "next/server";

import { dbEnabled, getVideoTask } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";
import { createVideoGeneration } from "@/lib/video/service";

// ---------------------------------------------------------------------------
// 原配置重试(§6):用任务快照(prompt/时长/尺寸/参考图)创建新任务。
// 参考图取任务 references 里的 artworkId(画布节点仍在才可用,否则降级文生)。
// 生成新幂等键——重试是新的计费周期,旧任务失败已退款。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`video-retry:${clientIp(request) || "0.0.0.0"}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "重试过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = context.params;
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const task = await getVideoTask(email, id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  const ref = (task.videoReferences ?? []).find(
    (r) => (r as { artworkId?: string }).artworkId
  ) as { artworkId?: string } | undefined;

  try {
    const created = await createVideoGeneration(email, {
      source: "workbench",
      sourceId: task.sourceId || undefined,
      prompt: task.prompt,
      seconds: task.seconds || String((task.parameters as { seconds?: number })?.seconds ?? 4),
      size: (task.parameters as { size?: string })?.size || "1280x720",
      artworkId: ref?.artworkId || undefined,
    });
    return NextResponse.json({ ok: true, taskId: created.taskId, cost: created.cost });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "重试创建失败") },
      { status: 502 }
    );
  }
}
