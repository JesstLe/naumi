import { NextResponse } from "next/server";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";
import { dbEnabled } from "@/platform/db/pool";
import { importCanvasWorkflow, readCanvasWorkflowImport, listWorkflowManifests, workflowImportRequest } from "@/lib/canvas/workflow-import";
import { readWorkflowClipboard, WORKFLOW_CLIPBOARD_LIMIT } from "@/lib/canvas/workflow-clipboard";
import {checkRateLimit} from "@/lib/rate-limit-http";
import {withCreationRoute,withCreationReceiptRoute} from '@/lib/saas/creation-context';
import {withCreationOperation} from '@/lib/saas/creation-writer';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGet(request: Request) {
  const email = await authorizedTargetEmail(request, new URL(request.url).searchParams.get("email"), true);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!dbEnabled) return NextResponse.json({ manifests: [] });
  const operationId=new URL(request.url).searchParams.get("operationId");
  if(operationId){
    if(!workflowImportRequest.shape.operationId.safeParse(operationId).success)return NextResponse.json({error:"导入编号无效"},{status:400});
    try{const result=await readCanvasWorkflowImport(email,operationId);return result?NextResponse.json({result}):NextResponse.json({error:"尚无导入回执"},{status:404});}
    catch{return NextResponse.json({error:"这次导入已撤销或暂未同步，请检查原画布"},{status:409});}
  }
  return NextResponse.json({ manifests: await listWorkflowManifests(email) });
}
async function handlePost(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!dbEnabled) return NextResponse.json({ error: "未启用持久化存储" }, { status: 503 });
  const rateLimitResult = await checkRateLimit(`workflow-import:${email}`, 10, 60000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return NextResponse.json({ error: "导入过于频繁，请稍后重试" }, { status: 429 });
  // Bound the request while reading; do not allocate an unbounded JSON body first.
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "缺少工作流数据" }, { status: 400 });
  let size = 0, raw = "";
  const decoder = new TextDecoder();
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > WORKFLOW_CLIPBOARD_LIMIT + 4096) { await reader.cancel(); return NextResponse.json({ error: "工作流过大，请分批复制" }, { status: 413 }); }
      raw += decoder.decode(value, { stream: true }); }
    raw += decoder.decode();
  } catch { return NextResponse.json({ error: "读取工作流失败" }, { status: 400 }); }
  const input = workflowImportRequest.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!input.success) return NextResponse.json({ error: "工作流请求格式不正确" }, { status: 400 });
  try { if (!readWorkflowClipboard(input.data.html)) throw new Error("未识别到稿定工作流"); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "工作流格式不正确" }, { status: 400 }); }
  let cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => { if (!cancelled) try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { cancelled = true; } };
      try {
        const result = await withCreationOperation('workflow-import',input.data.operationId,email,{parameters:{mode:'import'}},()=>importCanvasWorkflow(email, input.data, {
          progress: (done, total) => emit({ type: "progress", done, total }), cancelled: () => cancelled || request.signal.aborted,
        }),result=>({artworkIds:result.artworks.map(a=>a.id),text:result.textNodes.map(n=>n.content).join('\n')}));
        emit({ type: "complete", result });
      } catch (error) {
        const message = error instanceof Error && /工作流|导入|画布|素材|SVG|矢量|图片/.test(error.message) ? error.message : "工作流导入失败，请重试";
        emit({ type: "error", error: message });
      } finally { if (!cancelled) controller.close(); }
    }, cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}

export function GET(request:Request){return withCreationReceiptRoute(request,()=>handleGet(request));}
