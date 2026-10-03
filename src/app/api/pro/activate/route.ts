import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "请先登录管理员" }, { status: 403 });
  return NextResponse.json({ ok: true, activationRequired: false });
}
