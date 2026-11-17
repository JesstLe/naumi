import { NextResponse } from "next/server";
import { enterpriseAuthorize } from "@/lib/enterprise/access";
import { enterpriseHeavyReportRead } from "@/lib/enterprise/server";
import { teamFailure, teamJson } from "@/lib/teams/access";
import { TeamError } from "@/lib/teams/errors";
import { parseUsageQuery } from "@/lib/bi/usage-contracts";
import { readUserUsage } from "@/lib/bi/usage-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await enterpriseAuthorize(request); if (actor instanceof NextResponse) return actor;
  const params = new URL(request.url).searchParams;
  const view = params.get("view") === "export" ? "export" : undefined;
  let query;
  try { query = parseUsageQuery(params); if (!query.tenantId) throw new Error("请选择企业"); }
  catch (error) { return teamJson({ error: error instanceof Error ? error.message : "筛选条件无效" }, 400); }
  try {
    return teamJson(await enterpriseHeavyReportRead(actor, query.tenantId, (tx, scope) => {
      const emails = new Set(scope.visible); if (scope.owner) emails.add(scope.team.owner_email);
      if (query.email && !emails.has(query.email)) throw new TeamError("没有该成员用量的查看权限", 403);
      return readUserUsage(tx, query, { allowedEmails: [...emails], tenantId: scope.team.id, tenantName: scope.team.name }, view);
    }, request.signal));
  } catch (error) {
    if (request.signal.aborted) return teamJson({ error: "查询已取消" }, 499);
    return teamFailure(error);
  }
}
