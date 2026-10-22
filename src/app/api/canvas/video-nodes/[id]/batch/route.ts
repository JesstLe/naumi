import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedEmail } from "@/lib/request-auth";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { withBiRequest } from "@/lib/bi/model-observer";
import { readBounded } from "@/lib/supplier-cost/io";
import { billingErrorResponse, requestQuoteConfirmation } from "@/lib/billing/request";
import { BillingError } from "@/lib/billing/types";
import { ModelConfigError } from "@/lib/model-config/types";
import { VideoContractError } from "@/lib/video/contract";
import { readCanvasVideoBatch, submitCanvasVideoBatch } from "@/lib/video/canvas-batch";

export const runtime = "nodejs", dynamic = "force-dynamic", maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  if (error instanceof BillingError || error instanceof ModelConfigError) return billingErrorResponse(error);
  if (error instanceof z.ZodError || error instanceof VideoContractError) return NextResponse.json({ error: "视频批次参数无效" }, { status: 422 });
  return NextResponse.json({ error: "批次提交尚未核实，请查询原批次" }, { status: 503 });
}
export async function GET(request: Request, context: Context) {
  const actor = await authenticatedEmail(request);
  if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("batchId"));
    return NextResponse.json(await readCanvasVideoBatch(actor, (await context.params).id, id), { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  return withBiRequest(request, async () => {
    const actor = await authenticatedEmail(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!sameSiteBiMutation(request)) return NextResponse.json({ error: "不允许跨站生成" }, { status: 403 });
    try {
      const body = JSON.parse(await readBounded(new Response(request.body), 8192)), confirmation = requestQuoteConfirmation(request, body);
      return NextResponse.json({ ok: true, ...await submitCanvasVideoBatch(actor, { ...body, nodeId: (await context.params).id, billingVersion: confirmation.version, billingCredits: confirmation.credits }) }, { status: 202 });
    } catch (error) { return failure(error); }
  });
}
