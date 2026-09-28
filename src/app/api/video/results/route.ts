import { NextResponse } from "next/server";

import { deleteVideoResult, listVideoResults } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get("limit") || 50);
  const results = await listVideoResults(email, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ ok: true, results });
}

export async function DELETE(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "缺少结果 id" }, { status: 400 });
  const deleted = await deleteVideoResult(email, id);
  return NextResponse.json({ ok: true, deleted });
}
