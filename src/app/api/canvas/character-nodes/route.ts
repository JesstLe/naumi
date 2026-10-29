import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {filterCreationProjects} from "@/lib/saas/creation-access";
import { NextResponse } from "next/server";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { withCreationRoute } from "@/lib/saas/creation-context";
import { readBounded } from "@/lib/supplier-cost/io";
import { listCharacterNodes, saveCharacterNode } from "@/lib/canvas/character-node-service";
import { characterFailure } from "./response";

export const runtime = "nodejs", dynamic = "force-dynamic";
async function readNativeNodes(request: Request) {
  const url = new URL(request.url);
  const actor = await authorizedTargetEmail(request, url.searchParams.get("email"), true);
  if (!actor) return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });
  try {
    return NextResponse.json({ nodes: await filterCreationProjects(actor,await listCharacterNodes(actor, url.searchParams.get("includeDeleted") === "1")) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return characterFailure(error); }
}
export async function POST(request: Request) {
  return withCreationRoute(request, async () => {
    const actor = await authenticatedEmail(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!sameSiteBiMutation(request)) return NextResponse.json({ error: "不允许跨站修改" }, { status: 403 });
    try {
      const raw = JSON.parse(await readBounded(new Response(request.body), 8 * 1024 * 1024));
      return NextResponse.json({ node: await saveCharacterNode(actor, raw) }, { status: 201 });
    } catch (error) { return characterFailure(error); }
  });
}

export function GET(request:Request){return withCreationReceiptRoute(request,()=>readNativeNodes(request));}
