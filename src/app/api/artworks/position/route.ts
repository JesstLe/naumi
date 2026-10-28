import { NextResponse } from "next/server";
import { dbEnabled, setArtworkPosition } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Explicit moves overwrite coordinates; result attachment only initializes them.
// Both modes use the authenticated owner, never the email supplied in the body.
export async function POST(request: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ error: "数据库未启用，作品位置无法持久化" }, { status: 503 });
  }
  let body: { email?: string; id?: string; x?: number; y?: number; mode?: "move" | "initialize" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const email = await authenticatedEmail(request);
  const id = (body.id ?? "").trim();
  const x = Number(body.x);
  const y = Number(body.y);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!id || !Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }
  if (body.mode !== undefined && body.mode !== "move" && body.mode !== "initialize") {
    return NextResponse.json({ error: "位置操作类型不正确" }, { status: 400 });
  }
  try {
    const updated = await setArtworkPosition(email, id, x, y, body.mode === "initialize");
    if (!updated) return NextResponse.json({ error: "作品不存在或无权访问" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "作品位置保存失败" }, { status: 500 });
  }
}
