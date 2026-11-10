import { NextResponse } from "next/server";

import {deleteComfyWorkflow, getComfyWorkflow, listComfyWorkflows, saveComfyWorkflow} from "@/lib/comfyui/repository";
import {dbEnabled} from "@/platform/db/pool";
import { authenticatedEmail } from "@/lib/request-auth";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { clientIp } from "@/lib/ip";
import {
  extractWorkflowInputs,
  type ApiWorkflow,
} from "@/lib/comfyui/workflow";
import {parseComfyDocument,projectComfyGraph} from "@/lib/comfyui/document";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";

// ---------------------------------------------------------------------------
// ComfyUI 工作流库:GET 列表 / POST 导入(解析+可选缺件预检) / DELETE。
// API/UI 文档均可保存；端点与节点能力检查只在运行阶段发生。
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
  const id=new URL(request.url).searchParams.get("id");
  if(id){const workflow=await getComfyWorkflow(email,id);return workflow?NextResponse.json({workflow:{...workflow,document:parseComfyDocument(workflow.apiJson)}},{headers:{"cache-control":"private, no-store"}}):NextResponse.json({error:"工作流不存在"},{status:404});}
  const workflows = await listComfyWorkflows(email);
  return NextResponse.json({ workflows });
}

export async function POST(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  const rateLimitResult = await checkRateLimit(`comfyui-wf:${clientIp(request) || "0.0.0.0"}`, 30, 10 * 60 * 1000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = (await readBounded(new Response(request.body),8*1024*1024).then(JSON.parse).catch(() => null)) as
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
  let document;try{document=parseComfyDocument(parsed);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"工作流格式无效"},{status:400});}
  const api=document.raw,graph=projectComfyGraph(document);
  const inputs=document.format==="api"?extractWorkflowInputs(api as ApiWorkflow):{images:[],texts:[],seeds:[],numerics:[],requiredNodes:[...new Set(graph.nodes.map(node=>node.classType))]};
  const savedId=body.id||crypto.randomUUID();

  try {
    const saved=await saveComfyWorkflow(email, {
      ...(body.id?{id:body.id}:{newId:savedId}),
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
    savedId,document,missing:[],nodeCount:graph.nodes.length,
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
