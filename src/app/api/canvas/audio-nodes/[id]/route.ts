import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {filterCreationProjects} from "@/lib/saas/creation-access";
import { NextResponse } from "next/server";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { withCreationRoute } from "@/lib/saas/creation-context";
import { readBounded } from "@/lib/supplier-cost/io";
import { getAudioNode, saveAudioNode } from "@/lib/canvas/audio-node-service";
import { audioFailure } from "../response";

export const runtime = "nodejs", dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function readNativeNodes(request: Request, context: Context, authenticatedActor?:string|null) {
  const actor = await authorizedTargetEmail(request, new URL(request.url).searchParams.get("email"), true, authenticatedActor);
  if (!actor) return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });
  try {
    const found = await getAudioNode(actor, (await context.params).id);const node=found?(await filterCreationProjects(actor,[found]))[0]:null;
    return NextResponse.json(node ? { node } : { error: "音频不存在" }, { status: node ? 200 : 404, headers: { "cache-control": "private, no-store" } });
  } catch (error) { return audioFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  return withCreationRoute(request, async (authenticatedActor) => {
    const actor = await authenticatedEmail(request, authenticatedActor);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!sameSiteBiMutation(request)) return NextResponse.json({ error: "不允许跨站修改" }, { status: 403 });
    try {
      const id = (await context.params).id;
      const body = JSON.parse(await readBounded(new Response(request.body), 8 * 1024 * 1024));
      if (body.id !== undefined && body.id !== id) return NextResponse.json({ error: "音频身份不一致", code: "INVALID_AUDIO_NODE" }, { status: 422 });
      return NextResponse.json({ node: await saveAudioNode(actor, { ...body, id }) });
    } catch (error) { return audioFailure(error); }
  });
}

export function GET(request:Request,context:{params:Promise<{id:string}>}){return withCreationReceiptRoute(request,(authenticatedActor)=>readNativeNodes(request,context, authenticatedActor));}
