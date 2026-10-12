import { NextResponse } from "next/server";
import { z } from "zod";
import { teamAuthorize, teamJson, teamFailure, teamMutationOrigin } from "@/lib/teams/access";
import { teamContent, mutateTeam, memberCommandSchema } from "@/lib/teams/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const actor = await teamAuthorize(request); if (actor instanceof NextResponse) return actor;
  if (!teamMutationOrigin(request)) return teamJson({ error: "请求来源无效" }, 403);
  const parsed = memberCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return teamJson({ error: "管理参数无效" }, 400);
  try { return teamJson(await mutateTeam(actor, parsed.data)); } catch (error) { return teamFailure(error); }
}
const querySchema = z.object({ teamId: z.string().uuid(), email: z.string().min(1).max(254), section: z.enum(["artworks", "tasks", "conversations", "ledger", "audit"]).default("artworks"), page: z.coerce.number().int().min(1).max(100000).default(1) });
export async function GET(request: Request) {
  const actor = await teamAuthorize(request); if (actor instanceof NextResponse) return actor;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return teamJson({ error: "查询参数无效" }, 400);
  const q = parsed.data;
  try { return teamJson(await teamContent(actor, q.teamId, q.email.trim().toLowerCase(), q.section, q.page)); } catch (error) { return teamFailure(error); }
}
