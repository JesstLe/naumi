import { NextResponse } from "next/server";
import { enterpriseAuthorize } from "@/lib/enterprise/access";
import { teamJson, teamFailure, teamMutationOrigin } from "@/lib/teams/access";
import {
  centralAccountCommand,
  centralAccountSchema,
} from "@/lib/enterprise/identity/accounts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const actor = await enterpriseAuthorize(request);
  if (actor instanceof NextResponse) return actor;
  if (!request.headers.get("origin") || !teamMutationOrigin(request))
    return teamJson({ error: "请求来源无效" }, 403);
  const c = centralAccountSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!c.success) return teamJson({ error: "账号开通参数无效" }, 400);
  try {
    return teamJson(await centralAccountCommand(actor, c.data));
  } catch (e) {
    return teamFailure(e);
  }
}
