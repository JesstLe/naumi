import { NextResponse } from "next/server";
import { enterpriseAuthorize } from "@/lib/enterprise/access";
import { parseEnterpriseArtworks, enterpriseArtworks, enterpriseArtworkCsv } from "@/lib/enterprise/artworks";
import { PRIVATE_HEADERS, teamFailure, teamJson } from "@/lib/teams/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await enterpriseAuthorize(request); if (actor instanceof NextResponse) return actor;
  let parsed; try { parsed = parseEnterpriseArtworks(new URL(request.url).searchParams); }
  catch { return teamJson({ error: "筛选条件无效" }, 400); }
  try {
    const data = await enterpriseArtworks(actor, parsed.enterpriseId, parsed.query);
    return parsed.format === "csv" ? new NextResponse(enterpriseArtworkCsv(data), { headers: { ...PRIVATE_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="enterprise-artworks.csv"' } }) : teamJson(data);
  } catch (error) { return teamFailure(error); }
}
