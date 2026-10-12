import { NextResponse } from "next/server";
import { teamAuthorize, teamJson, teamFailure, teamMutationOrigin } from "@/lib/teams/access";
import { mutateTeam, adminCommandSchema, teamSnapshot } from "@/lib/teams/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await teamAuthorize(request, true); if (actor instanceof NextResponse) return actor;
  try { return teamJson(await teamSnapshot(actor)); } catch (error) { return teamFailure(error); }
}
export async function POST(request: Request) {
  const actor = await teamAuthorize(request, true); if (actor instanceof NextResponse) return actor;
  if (!teamMutationOrigin(request)) return teamJson({ error: "请求来源无效" }, 403);
  const parsed = adminCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return teamJson({ error: "团队参数无效" }, 400);
  try { return teamJson(await mutateTeam(actor, parsed.data, true)); } catch (error) { return teamFailure(error); }
}
