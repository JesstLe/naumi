import { NextResponse } from "next/server";
import { dbEnabled, setArtworkMarked } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { id?: string; marked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const email = await authenticatedEmail(request);
  const id = (body.id ?? "").trim();
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!id || typeof body.marked !== "boolean") {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }
  if (!dbEnabled) {
    return NextResponse.json({ ok: true, persisted: false, marked: body.marked });
  }
  try {
    const updated = await setArtworkMarked(email, id, body.marked);
    if (!updated) {
      return NextResponse.json({ error: "作品不存在或无权访问" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, persisted: true, marked: body.marked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "标记保存失败" },
      { status: 500 }
    );
  }
}
