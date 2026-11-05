import { NextResponse } from "next/server";
import { dbEnabled } from "@/platform/db/pool";
import { authenticatedEmail } from "@/lib/request-auth";
import { localEditSchema, saveCanvasLocalEdit } from "@/lib/canvas-local-image-edit";
import {withCreationRoute} from '@/lib/saas/creation-context';
import {withCreationOperation} from '@/lib/saas/creation-writer';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handlePost(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({error:"请先登录"},{status:401});
  if (!dbEnabled) return NextResponse.json({error:"未启用存储"},{status:400});
  try {
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    let body: unknown, replacement: Buffer | undefined;
    if (multipart) {
      const fd=await request.formData(), file=fd.get("image");
      if (!(file instanceof File) || !file.size || file.size > 12*1024*1024) return NextResponse.json({error:"请选择12MB以内的图片"},{status:400});
      body={mode:"replace",id:fd.get("id"),operationId:fd.get("operationId")};
      replacement=Buffer.from(await file.arrayBuffer());
    } else body=await request.json();
    const input=localEditSchema.safeParse(body);
    if (!input.success) return NextResponse.json({error:"编辑参数不正确"},{status:400});
    const result=await withCreationOperation('canvas-local-edit',input.data.operationId,email,{sourceArtworkId:input.data.id,parameters:input.data},()=>saveCanvasLocalEdit(email,input.data,request.url,replacement),result=>({artworkIds:[result.id]}));
    return NextResponse.json({ok:true,...result});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message : "图片编辑失败"},{status:409});
  }
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
