import { NextResponse } from "next/server";
import { biAuthorize, biJson } from "@/lib/bi/access";
import { parseBiQuery } from "@/lib/bi/contracts";
import { logBiAccess, queryBi } from "@/lib/bi/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await biAuthorize(request);
  if (auth instanceof NextResponse) return auth;
  let query;
  try {
    query = parseBiQuery(new URL(request.url).searchParams);
  } catch (error) {
    return biJson(
      { error: error instanceof Error ? error.message : "筛选条件无效" },
      400,
    );
  }
  try {
    await logBiAccess(auth.actor, "view", query.section, query.email);
    return biJson(await queryBi(query));
  } catch {
    return biJson({ error: "BI 查询失败，请稍后重试或检查数据库状态" }, 500);
  }
}
