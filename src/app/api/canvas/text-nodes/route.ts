import { NextResponse } from "next/server";
import {
  dbEnabled,
  deleteCanvasTextNodes,
  listCanvasTextNodes,
  upsertCanvasTextNode,
  type CanvasTextNodeRecord,
} from "@/lib/db";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false, nodes: [] });
  const requested = new URL(request.url).searchParams.get("email");
  const email = await authorizedTargetEmail(request, requested, true);
  if (!email) {
    return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });
  }
  const nodes = await listCanvasTextNodes(email);
  return NextResponse.json({ persisted: true, nodes });
}

export async function POST(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false });
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let body: Partial<CanvasTextNodeRecord>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const id = String(body.id || "").trim();
  const projectKey = String(body.projectKey || "").trim();
  const canvasX = Number(body.canvasX);
  const canvasY = Number(body.canvasY);
  if (!id || !projectKey || !Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
    return NextResponse.json({ error: "缺少文字节点参数" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const node = await upsertCanvasTextNode(email, {
    id,
    projectKey,
    title: String(body.title || "文字生成").trim() || "文字生成",
    prompt: String(body.prompt || ""),
    content: String(body.content || ""),
    status:
      body.status === "generating" || body.status === "failed" || body.status === "idle"
        ? body.status
        : "completed",
    canvasX,
    canvasY,
    createdAt: String(body.createdAt || now),
    updatedAt: now,
  });
  return NextResponse.json({ persisted: true, node });
}

export async function DELETE(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false, deleted: 0 });
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!ids.length) return NextResponse.json({ error: "缺少文字节点" }, { status: 400 });
  const deleted = await deleteCanvasTextNodes(email, ids);
  return NextResponse.json({ persisted: true, deleted });
}
