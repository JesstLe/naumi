import {withBillingIntent} from "@/lib/billing/intent";
import { NextResponse } from "next/server";

import { dbEnabled, getUser } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";
import { createVideoGeneration } from "@/lib/video/service";
import {requestQuoteConfirmation,billingErrorResponse} from "@/lib/billing/request";
import {BillingError} from "@/lib/billing/types";

// ---------------------------------------------------------------------------
// 视频生成入口(兼容契约保持 {ok, taskId, cost, user}):内部已迁移到视频应用层
// (service.createVideoGeneration),规范化参数/能力校验/预扣结算均在 service。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function createSubmission(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`video-gen:${clientIp(request) || "0.0.0.0"}`, 6, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "视频生成过于频繁，请稍后再试" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        prompt?: string; artworkId?: string; imageUrl?: string; seconds?: string; size?: string;
        providerId?: string; modelId?: string; negativePrompt?: string; durationSeconds?: number;
        aspectRatio?: string; resolution?: string; width?: number; height?: number;
        generateAudio?: boolean; watermark?: boolean; references?: unknown[];
        idempotencyKey?: string;
        billingVersion?:unknown;billingCredits?:unknown;
        providerOptions?: Record<string, unknown>; source?: string; sourceId?: string;
      }
    | null;
  const prompt = String(body?.prompt || "").trim().slice(0, 1000);
  const seconds = String(body?.durationSeconds ?? body?.seconds ?? "4").slice(0, 8);
  const size = String(body?.resolution || body?.size || "1280x720").slice(0, 32);
  const artworkId = String(body?.artworkId || "").trim();
  // agent 场景:无画布节点,直接传[商品图] URL
  const imageUrl = String(body?.imageUrl || "").trim().slice(0, 600);
  if (!email || !prompt) {
    return NextResponse.json({ error: "请填写视频描述" }, { status: 400 });
  }

  try {
    const { taskId, cost } = await createVideoGeneration(email, {
      billingConfirmation:requestQuoteConfirmation(request,body||undefined),
      source: (["canvas", "workbench", "agent", "workflow"].includes(String(body?.source))
        ? body?.source
        : imageUrl ? "agent" : artworkId ? "canvas" : "workbench") as "canvas" | "workbench" | "agent" | "workflow",
      sourceId: String(body?.sourceId || artworkId || "").slice(0, 200) || undefined,
      idempotencyKey: String(body?.idempotencyKey || "").trim().slice(0, 100) || undefined,
      prompt,
      seconds,
      size,
      artworkId: artworkId || undefined,
      imageUrl: imageUrl || undefined,
      providerId: String(body?.providerId || "").slice(0, 80) || undefined,
      modelId: String(body?.modelId || "").slice(0, 160) || undefined,
      negativePrompt: String(body?.negativePrompt || "").slice(0, 1000) || undefined,
      durationSeconds: Number(body?.durationSeconds ?? seconds),
      aspectRatio: String(body?.aspectRatio || "").slice(0, 24) || undefined,
      resolution: String(body?.resolution || size).slice(0, 32),
      width: Number.isFinite(Number(body?.width)) ? Math.max(1, Math.min(8192, Number(body?.width))) : undefined,
      height: Number.isFinite(Number(body?.height)) ? Math.max(1, Math.min(8192, Number(body?.height))) : undefined,
      generateAudio: body?.generateAudio === true,
      watermark: body?.watermark === true,
      references: Array.isArray(body?.references) ? body.references.slice(0, 20) as never[] : undefined,
      providerOptions: body?.providerOptions && typeof body.providerOptions === "object" ? body.providerOptions : undefined,
    });
    const user = dbEnabled ? await getUser(email).catch(() => null) : null;
    return NextResponse.json({ ok: true, taskId, cost, user });
  } catch (error) {
    if(error instanceof BillingError)return billingErrorResponse(error);
    return NextResponse.json(
      { error: safeError(error, "视频任务创建失败") },
      { status: 502 }
    );
  }
}

export async function POST(request:Request){return withBillingIntent(request,()=>createSubmission(request));}
