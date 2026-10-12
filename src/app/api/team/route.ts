import { NextResponse } from "next/server";
import { teamAuthorize, teamJson, teamFailure } from "@/lib/teams/access";
import { teamSnapshot } from "@/lib/teams/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await teamAuthorize(request); if (actor instanceof NextResponse) return actor;
  const id = new URL(request.url).searchParams.get("teamId") || undefined;
  if (id && !/^[a-f0-9-]{36}$/i.test(id)) return teamJson({ error: "团队参数无效" }, 400);
  try { return teamJson({ ...await teamSnapshot(actor, id), canManageTeams: actor.admin }); } catch (error) { return teamFailure(error); }
}
