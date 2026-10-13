import { NextResponse } from "next/server";

import { dbEnabled, getVideoTask } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";
import { createVideoGeneration } from "@/lib/video/service";
import type { ExecutionBundle } from "@/lib/model-config/context";
import { ModelConfigError } from "@/lib/model-config/types";
import { BillingError } from "@/lib/billing/types";

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
  context: { params: Promise<{ id: string }> }
) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`video-retry:${clientIp(request) || "0.0.0.0"}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "重试过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await context.params;
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const task = await getVideoTask(email, id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (!["failed", "cancelled"].includes(task.status)) return NextResponse.json({ error: "仅已失败或取消的任务可以创建重试任务" }, { status: 409 });

  const params = task.parameters as Record<string, unknown>;
  const references = (task.videoReferences ?? []) as never[];

  try {
    const created = await createVideoGeneration(email, {
      source: "workbench",
      sourceId: task.sourceId || undefined,
      prompt: task.prompt,
      seconds: task.seconds || String(params.seconds ?? params.durationSeconds ?? 4),
      size: String(params.size || params.resolution || "1280x720"),
      providerId: task.providerId,
      modelId: (params.modelExecutions as ExecutionBundle | undefined)?.video?.publicModelId || task.model,
      negativePrompt: String(params.negativePrompt || "") || undefined,
      durationSeconds: Number(params.durationSeconds ?? params.seconds ?? task.seconds ?? 4),
      aspectRatio: String(params.aspectRatio || "") || undefined,
      resolution: String(params.resolution || params.size || "1280x720"),
      width: Number(params.width) || undefined,
      height: Number(params.height) || undefined,
      generateAudio: Boolean(params.generateAudio),
      watermark: Boolean(params.watermark),
      references,
      providerOptions: params.providerOptions && typeof params.providerOptions === "object"
        ? params.providerOptions as Record<string, unknown>
        : undefined,
    });
    return NextResponse.json({ ok: true, taskId: created.taskId, cost: created.cost });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "重试创建失败") },
      { status: error instanceof ModelConfigError || error instanceof BillingError ? error.status : 502 }
    );
  }
}
