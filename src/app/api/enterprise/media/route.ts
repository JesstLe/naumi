import { NextResponse } from "next/server";
import { z } from "zod";
import { teamJson, teamFailure } from "@/lib/teams/access";
import { enterpriseArtwork } from "@/lib/enterprise/server";
import { enterpriseAuthorize } from "@/lib/enterprise/access";
import {enterpriseMediaResponse} from '@/lib/enterprise/media-response';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const query = z.object({ enterpriseId: z.string().uuid(), email: z.string().min(1).max(254), id: z.string().min(1).max(200) });
export async function GET(request: Request) {
  const actor = await enterpriseAuthorize(request); if (actor instanceof NextResponse) return actor;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return teamJson({ error: "作品参数无效" }, 400);
  let row;
  try { const q = parsed.data; row = await enterpriseArtwork(actor, q.enterpriseId, q.email.trim().toLowerCase(), q.id, request.signal); }
  catch (error) {
    if (request.signal.aborted) return teamJson({ error: "请求已取消" }, 499);
    const code = (error as {code?:string})?.code;
    if (code === '55P03' || code === '57014') return teamJson({error:'媒体暂时不可读取'},503);
    return teamFailure(error);
  }
  return enterpriseMediaResponse(request,String(row.image_url));
}
