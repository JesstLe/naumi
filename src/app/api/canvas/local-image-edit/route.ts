import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { localEditSchema, saveCanvasLocalEdit } from "@/lib/canvas-local-image-edit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
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
    return NextResponse.json({ok:true,...await saveCanvasLocalEdit(email,input.data,request.url,replacement)});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message : "图片编辑失败"},{status:409});
  }
}
