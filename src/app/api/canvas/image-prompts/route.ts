import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import { withCreationRoute, withCreationReceiptRoute, currentCreationContext } from "@/lib/saas/creation-context";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { readBounded } from "@/lib/supplier-cost/io";
import { ModelConfigError } from "@/lib/model-config/types";
import { TeamError } from "@/lib/teams/server";
import { getImagePrompt, saveImagePrompt } from "@/lib/canvas/image-prompt-service";
import { dbEnabled } from '@/lib/db';
export const runtime = "nodejs", dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof ModelConfigError || error instanceof TeamError) return NextResponse.json({ error: error.message, code: "code" in error ? error.code : undefined }, { status: error.status, headers });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "图片提示词字段无效", code: "IMAGE_PROMPT_INVALID" }, { status: 422, headers });
  return NextResponse.json({ error: "提示词保存暂时不可用，请重试", code: "IMAGE_PROMPT_UNAVAILABLE" }, { status: 503, headers });
}
export async function GET(request: Request) {
  if(!dbEnabled)return NextResponse.json({document:null,revision:0,persisted:false},{headers});
  return withCreationReceiptRoute(request, async () => {
    const actor = await authenticatedEmail(request); if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
    const query = new URL(request.url).searchParams;
    try { const result=await getImagePrompt(actor, { projectKey: query.get("projectKey"), nodeId: query.get("nodeId") });
      return NextResponse.json({...result,workspace:currentCreationContext()?.tenantId||'personal'}, { headers }); }
    catch (error) { return failure(error); }
  });
}
export async function POST(request: Request) {
  if (!sameSiteBiMutation(request)) return NextResponse.json({ error: "不允许跨站修改" }, { status: 403, headers });
  return withCreationRoute(request, async () => {
    const actor = await authenticatedEmail(request); if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
    try { return NextResponse.json(await saveImagePrompt(actor, JSON.parse(await readBounded(new Response(request.body), 384 * 1024))), { headers }); }
    catch (error) { return failure(error); }
  });
}
