import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dbEnabled, importTemplates } from "@/lib/db";
import { TEMPLATES } from "@/lib/templates-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sync the template library shipped with this release, preserving local edits.
export async function POST(req: Request) {
  if (!dbEnabled) return NextResponse.json({ error: "未配置数据库" }, { status: 503 });
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { page?: number };
  const page = Math.max(1, Math.floor(Number(body.page) || 1));
  const offset = (page - 1) * 200;
  const templates = TEMPLATES.slice(offset, offset + 200);
  const imported = await importTemplates(templates, TEMPLATES.length, offset);
  return NextResponse.json({ ok: true, page, total: TEMPLATES.length, got: templates.length, imported, done: offset + templates.length >= TEMPLATES.length });
}
