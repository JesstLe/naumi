import { NextResponse } from "next/server";
import { dbEnabled, deleteCanvasNodesAtomically } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: { artworkIds?: string[]; textIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const artworkIds = Array.isArray(body.artworkIds)
    ? body.artworkIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 200)
    : [];
  const textIds = Array.isArray(body.textIds)
    ? body.textIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 200)
    : [];
  if (!artworkIds.length && !textIds.length) {
    return NextResponse.json({ error: "缺少待删除节点" }, { status: 400 });
  }
  if (!dbEnabled) {
    return NextResponse.json({ ok: true, persisted: false, artworks: 0, textNodes: 0 });
  }
  try {
    const deleted = await deleteCanvasNodesAtomically(email, artworkIds, textIds);
    return NextResponse.json({ ok: true, persisted: true, ...deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除节点失败" },
      { status: 500 }
    );
  }
}
