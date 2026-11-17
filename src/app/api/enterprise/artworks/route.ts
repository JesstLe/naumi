import { NextResponse } from "next/server";
import { enterpriseAuthorize } from "@/lib/enterprise/access";
import { parseEnterpriseArtworks, enterpriseArtworks, enterpriseArtworkExport } from "@/lib/enterprise/artworks";
import { PRIVATE_HEADERS, teamFailure, teamJson } from "@/lib/teams/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await enterpriseAuthorize(request); if (actor instanceof NextResponse) return actor;
  let parsed; try { parsed = parseEnterpriseArtworks(new URL(request.url).searchParams); }
  catch { return teamJson({ error: "筛选条件无效" }, 400); }
  try {
    if (parsed.format === "csv") return new NextResponse(await enterpriseArtworkExport(actor, parsed.enterpriseId, parsed.query, request.signal), {
      headers: { ...PRIVATE_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="enterprise-artworks.csv"' },
    });
    return teamJson(await enterpriseArtworks(actor, parsed.enterpriseId, parsed.query, request.signal));
  } catch (error) {
    if (request.signal.aborted) return teamJson({ error: "查询已取消" }, 499);
    return teamFailure(error);
  }
}
