import { NextResponse } from "next/server";

import {
  dbEnabled,
  deleteComfyWorkflow,
  getActiveComfyEndpoint,
  listComfyWorkflows,
  saveComfyWorkflow,
} from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import {
  detectWorkflowFormat,
  extractWorkflowInputs,
  missingNodes,
  type ApiWorkflow,
} from "@/lib/comfyui/workflow";
import { fetchObjectInfo } from "@/lib/comfyui/client";

// ---------------------------------------------------------------------------
// ComfyUI 工作流库:GET 列表 / POST 导入(解析+可选缺件预检) / DELETE。
// 一期只收 API 格式;编辑器格式给出导出指引(转换需端点 object_info,二期)。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor(request: Request) {
  if (!dbEnabled) return null;
  return authenticatedEmail(request);
}

export async function GET(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const workflows = await listComfyWorkflows(email);
  return NextResponse.json({ workflows });
}

export async function POST(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`comfyui-wf:${clientIp(request) || "0.0.0.0"}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as
    | { id?: string; name?: string; json?: string; note?: string }
    | null;
  if (!body || typeof body.json !== "string" || !body.json.trim()) {
    return NextResponse.json({ error: "请粘贴工作流 JSON" }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.json);
  } catch {
    return NextResponse.json({ error: "JSON 解析失败，请检查内容" }, { status: 400 });
  }
  const format = detectWorkflowFormat(parsed);
  if (format === "ui") {
    return NextResponse.json(
      {
        error:
          "这是 ComfyUI 编辑器格式。请在 ComfyUI 里打开 设置→开发者模式 后，用「Save (API Format)」导出，再粘贴这里",
      },
      { status: 400 }
    );
  }
  if (format !== "api") {
    return NextResponse.json({ error: "不是有效的 ComfyUI 工作流 JSON" }, { status: 400 });
  }
  const api = parsed as ApiWorkflow;
  const inputs = extractWorkflowInputs(api);
  if (!inputs.texts.length && !inputs.images.length) {
    return NextResponse.json(
      { error: "工作流里没有找到可编辑输入(LoadImage/提示词)，请确认导出的 JSON 完整" },
      { status: 400 }
    );
  }

  // 有活动端点时做缺件预检(没有端点也能导入,运行前会再检)
  let missing: string[] = [];
  let nodeCount = 0;
  try {
    const endpoint = await getActiveComfyEndpoint(email);
    if (endpoint) {
      const available = await fetchObjectInfo(endpoint);
      nodeCount = available.length;
      missing = missingNodes(inputs.requiredNodes, available);
    }
  } catch {
    /* 预检失败不阻塞导入 */
  }

  try {
    await saveComfyWorkflow(email, {
      id: body.id,
      name: String(body.name || ""),
      apiJson: api,
      inputs,
      required: inputs.requiredNodes,
      note: String(body.note || ""),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存工作流失败" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    inputs,
    missing,
    nodeCount,
  });
}

export async function DELETE(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少工作流 id" }, { status: 400 });
  await deleteComfyWorkflow(email, id);
  return NextResponse.json({ ok: true });
}
