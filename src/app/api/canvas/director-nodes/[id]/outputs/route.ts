import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { withCreationRoute } from "@/lib/saas/creation-context";
import { readBounded } from "@/lib/supplier-cost/io";
import { attachDirectorOutput } from "@/lib/canvas/director-node-service";
import { directorFailure } from "../../response";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return withCreationRoute(request, async (authenticatedActor) => {
  const actor = await authenticatedEmail(request, authenticatedActor); if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 }); if (!sameSiteBiMutation(request)) return NextResponse.json({ error: "不允许跨站修改" }, { status: 403 });
  try { return NextResponse.json({ node: await attachDirectorOutput(actor, (await context.params).id, JSON.parse(await readBounded(new Response(request.body), 8192))) }); } catch (error) { return directorFailure(error); }
}); }
