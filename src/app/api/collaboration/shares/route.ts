import { createShare, listShares } from "@/lib/canvas-sharing/application";
import { shareJson, shareResponse, shareRoute } from "@/lib/canvas-sharing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return shareRoute(request, async (email, enterpriseId) => { const q = new URL(request.url).searchParams; return shareResponse(await listShares(email, enterpriseId, q.get("direction") || "received", q.get("cursor"))); });
}
export async function POST(request: Request) { return shareRoute(request, async (email, enterpriseId) => shareResponse({ share: await createShare(email, enterpriseId, await shareJson(request)) })); }
