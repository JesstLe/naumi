import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {filterCreationProjects} from "@/lib/saas/creation-access";
import { NextResponse } from "next/server";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { withCreationRoute } from "@/lib/saas/creation-context";
import { readBounded } from "@/lib/supplier-cost/io";
import { getDirectorNode, saveDirectorNode } from "@/lib/canvas/director-node-service";
import { directorFailure } from "../response";
export const runtime = "nodejs", dynamic = "force-dynamic";
async function readNativeNodes(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await authorizedTargetEmail(request, new URL(request.url).searchParams.get("email"), true); if (!actor) return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });
  try { const found = await getDirectorNode(actor, (await context.params).id);const node=found?(await filterCreationProjects(actor,[found]))[0]:null; return NextResponse.json(node ? { node } : { error: "导演节点不存在" }, { status: node ? 200 : 404, headers: { "cache-control": "private, no-store" } }); } catch (error) { return directorFailure(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return withCreationRoute(request, async () => {
  const actor = await authenticatedEmail(request); if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 }); if (!sameSiteBiMutation(request)) return NextResponse.json({ error: "不允许跨站修改" }, { status: 403 });
  try { const body = JSON.parse(await readBounded(new Response(request.body), 8 * 1024 * 1024)); if (body.id !== undefined && body.id !== (await context.params).id) return NextResponse.json({ error: "节点身份不一致" }, { status: 422 }); return NextResponse.json({ node: await saveDirectorNode(actor, { ...body, id: (await context.params).id }) }); } catch (error) { return directorFailure(error); }
}); }

export function GET(request:Request,context:{params:Promise<{id:string}>}){return withCreationReceiptRoute(request,()=>readNativeNodes(request,context));}
