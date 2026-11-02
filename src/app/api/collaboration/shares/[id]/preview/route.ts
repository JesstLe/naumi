import { getSharePreview } from "@/lib/canvas-sharing/application";
import { shareRoute } from "@/lib/canvas-sharing/http";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return shareRoute(request, async (email, enterpriseId) => new Response(new Uint8Array(await getSharePreview(email, enterpriseId, z.string().uuid().parse((await context.params).id))), {
    headers: { "content-type": "image/png", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
  }));
}
