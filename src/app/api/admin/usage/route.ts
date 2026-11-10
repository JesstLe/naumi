import { NextResponse } from "next/server";
import {adminUsageSummary} from "@/lib/accounts/administration";
import {dbEnabled} from "@/platform/db/pool";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ error: "未配置数据库，管理不可用" }, { status: 503 });
  }
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const rawDays = params.get("days");
  const page = Number(params.get("page") || 1), size = Number(params.get("size") || 30);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || !Number.isSafeInteger(size) || size < 1 || size > 100)
    return NextResponse.json({ error: "分页参数无效" }, { status: 400 });
  const days = Math.min(365, Math.max(1, Math.trunc(Number(rawDays) || 30)));
  try {
    return NextResponse.json(await adminUsageSummary(days, params.has("page") ? { page, size } : undefined));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取用户用量失败" },
      { status: 500 }
    );
  }
}
