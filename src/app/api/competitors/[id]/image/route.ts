import { NextResponse } from "next/server";
import sharp from "sharp";
import { competitorActor, competitorError, ownedCompetitor, readCompetitorImage, WorkspaceError, checkVersion } from "@/lib/competitor-server";
import { pixelRect } from "@/lib/competitor-image";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const item = await ownedCompetitor(await competitorActor(req), params.id);
    const q = new URL(req.url).searchParams;
    const version = q.get("version") || "";
    checkVersion(item, version);
    let image = await readCompetitorImage(item.versions.find(v => v.id === version)?.image || item.image);
    const regionId = q.get("region");
    if (regionId) {
      const region = item.regions.find(r => r.id === regionId);
      if (!region) throw new WorkspaceError("选区不存在", 404);
      const m = await sharp(image).metadata();
      image = await sharp(image).extract(pixelRect(region, m.width!, m.height!)).png().toBuffer();
    }
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${params.id}${regionId ? '-region' : ''}.png"` } });
  } catch(e) { return competitorError(e); }
}
