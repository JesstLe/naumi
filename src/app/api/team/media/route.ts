import { NextResponse } from "next/server";
import { z } from "zod";
import { teamAuthorize, teamJson, teamFailure, PRIVATE_HEADERS } from "@/lib/teams/access";
import { teamArtwork } from "@/lib/teams/server";
import { MediaPreviewBusy, MediaPreviewVersionChanged, renderMediaPreview } from "@/lib/media-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const query = z.object({ teamId: z.string().uuid(), email: z.string().min(1).max(254), id: z.string().min(1).max(200) });

export async function GET(request: Request) {
  const actor = await teamAuthorize(request); if (actor instanceof NextResponse) return actor;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return teamJson({ error: "作品参数无效" }, 400);
  const {teamId,email,id}=parsed.data,signal=request.signal;
  let lookupFailed=false;
  try {
    const {image}=await renderMediaPreview(request,async()=>{
      try{
        const row=await teamArtwork(actor,teamId,email.trim().toLowerCase(),id,signal);
        return {url:String(row.image_url)};
      }catch(error){lookupFailed=true;throw error;}
    },{validateCacheVersion:true,profile:'team'});
    return new NextResponse(image, { headers: { ...PRIVATE_HEADERS, "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'" } });
  } catch(error) {
    if(signal.aborted)return teamJson({error:'请求已取消'},499);
    if(lookupFailed)return teamFailure(error);
    if(error instanceof MediaPreviewBusy){
      const response=teamJson({error:'预览请求较多，请稍后重试'},503);
      response.headers.set('Retry-After','1');return response;
    }
    if(error instanceof MediaPreviewVersionChanged)return teamJson({error:'素材版本已改变'},409);
    return teamJson({ error: "媒体暂时不可读取" }, 422);
  }
}
