import {CanvasTextWriteConflict} from "@/lib/canvas/text-write";
import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import { dbEnabled } from "@/platform/db/pool";
import { historyRequest, saveCanvasHistory } from "@/lib/canvas-history";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const email=await authenticatedEmail(request);
  if (!email) return NextResponse.json({error:"请先登录"},{status:401});
  const parsed=historyRequest.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:"画布操作格式不正确"},{status:400});
  try {
    const receipt=dbEnabled?await saveCanvasHistory(email,parsed.data):undefined;
    return NextResponse.json({ok:true,persisted:dbEnabled,...receipt});
  } catch (error) {
    if(error instanceof CanvasTextWriteConflict)return NextResponse.json({error:error.message,code:error.code,id:error.id,fields:error.fields,current:error.current},{status:409});
    return NextResponse.json({error:error instanceof Error ? error.message : "画布保存失败，请重试"},{status:409});
  }
}
