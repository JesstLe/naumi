import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import { fillWorkflowAsset } from "@/lib/canvas-workflow-import";
import { checkRateLimit } from "@/lib/rate-limit-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const rateLimitResult = await checkRateLimit(`workflow-fill:${email}`,20,60000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return NextResponse.json({error:"补图过于频繁，请稍后重试"},{status:429});
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({error:"请选择图片"},{status:400});
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const {done,value} = await reader.read(); if(done)break; size += value.length;
      if(size > 13*1024*1024){await reader.cancel();return NextResponse.json({error:"请选择12MB以内的图片"},{status:413});} chunks.push(value); }
    const fd = await new Request(request.url,{method:"POST",headers:{"content-type":request.headers.get("content-type") || ""},body:Buffer.concat(chunks)}).formData();
    const image = fd.get("image");
    if (!(image instanceof File) || !image.size || image.size > 12*1024*1024) return NextResponse.json({error:"请选择12MB以内的图片"},{status:400});
    return NextResponse.json({ok:true,...await fillWorkflowAsset(email,String(fd.get("id") || ""),String(fd.get("operationId") || ""),Buffer.from(await image.arrayBuffer()))});
  } catch (error) { return NextResponse.json({error:error instanceof Error && /图片|节点|补图|解锁|12MB/.test(error.message) ? error.message : "补图失败，请重试"},{status:409}); }
}
