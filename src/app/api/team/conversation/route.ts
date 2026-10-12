import { NextResponse } from "next/server";
import { z } from "zod";
import { teamAuthorize, teamJson, teamFailure } from "@/lib/teams/access";
import { teamConversation } from "@/lib/teams/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const querySchema = z.object({ teamId: z.string().uuid(), email: z.string().min(1).max(254), id: z.string().min(1).max(200), kind: z.enum(["agent", "genchat"]), page: z.coerce.number().int().min(1).max(100000).default(1) });
export async function GET(request: Request) {
  const actor = await teamAuthorize(request); if (actor instanceof NextResponse) return actor;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return teamJson({ error: "对话参数无效" }, 400);
  const q = parsed.data;
  try { return teamJson(await teamConversation(actor, q.teamId, q.email.trim().toLowerCase(), q.id, q.kind, q.page)); } catch (error) { return teamFailure(error); }
}
