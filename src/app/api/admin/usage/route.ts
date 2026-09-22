import { NextResponse } from "next/server";
import { adminUsageSummary, dbEnabled } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { proEnabled } from "@/lib/edition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ error: "未配置数据库，管理不可用" }, { status: 503 });
  }
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  }
  if (!(await proEnabled())) {
    return NextResponse.json({ error: "该功能为 Pro 版功能" }, { status: 403 });
  }
  const rawDays = new URL(req.url).searchParams.get("days");
  const days = Math.min(365, Math.max(1, Math.trunc(Number(rawDays) || 30)));
  try {
    return NextResponse.json(await adminUsageSummary(days));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取用户用量失败" },
      { status: 500 }
    );
  }
}
