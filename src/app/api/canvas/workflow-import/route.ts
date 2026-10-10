import { NextResponse } from "next/server";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";
import { dbEnabled } from "@/lib/db";
import { importCanvasWorkflow, listWorkflowManifests, workflowImportRequest } from "@/lib/canvas-workflow-import";
import { readWorkflowClipboard, WORKFLOW_CLIPBOARD_LIMIT } from "@/lib/canvas/workflow-clipboard";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = await authorizedTargetEmail(request, new URL(request.url).searchParams.get("email"), true);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!dbEnabled) return NextResponse.json({ manifests: [] });
  return NextResponse.json({ manifests: await listWorkflowManifests(email) });
}
export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!dbEnabled) return NextResponse.json({ error: "未启用持久化存储" }, { status: 503 });
  if (!rateLimit(`workflow-import:${email}`, 10, 60000)) return NextResponse.json({ error: "导入过于频繁，请稍后重试" }, { status: 429 });
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
        const result = await importCanvasWorkflow(email, input.data, {
          progress: (done, total) => emit({ type: "progress", done, total }), cancelled: () => cancelled || request.signal.aborted,
        });
        emit({ type: "complete", result });
      } catch (error) {
        const message = error instanceof Error && /工作流|导入|画布|素材|SVG|矢量|图片/.test(error.message) ? error.message : "工作流导入失败，请重试";
        emit({ type: "error", error: message });
      } finally { if (!cancelled) controller.close(); }
    }, cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
