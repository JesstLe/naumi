import { NextResponse } from "next/server";
import { biAuthorize, biJson } from "@/lib/bi/access";
import { logBiAccess } from "@/lib/bi/repository";
import { parseUsageQuery } from "@/lib/bi/usage-contracts";
import { queryUserUsage } from "@/lib/bi/usage-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await biAuthorize(request); if (auth instanceof NextResponse) return auth;
  let query;
  try { query = parseUsageQuery(new URL(request.url).searchParams); }
  catch (error) { return biJson({ error: error instanceof Error ? error.message : "筛选条件无效" }, 400); }
  try { await logBiAccess(auth.actor, "view", "usage", query.email); return biJson(await queryUserUsage(query)); }
  catch { return biJson({ error: "用户用量读取失败，请稍后重试" }, 500); }
}
