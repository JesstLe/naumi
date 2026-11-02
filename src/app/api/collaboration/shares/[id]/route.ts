import { changeShare, getShare } from "@/lib/canvas-sharing/application";
import { shareJson, shareResponse, shareRoute } from "@/lib/canvas-sharing/http";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return shareRoute(request, async (email, enterpriseId) => shareResponse({ share: await getShare(email, enterpriseId, z.string().uuid().parse((await context.params).id)) })); }
export async function POST(request: Request, context: Context) { return shareRoute(request, async (email, enterpriseId) => shareResponse({ share: await changeShare(email, enterpriseId, z.string().uuid().parse((await context.params).id), await shareJson(request)) })); }
