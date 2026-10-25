import { NextResponse } from "next/server";
import {listCardKeys, generateCardKeys, setCardKeyStatus, cardKeyStats} from "@/lib/billing/card-keys";
import {dbEnabled} from "@/platform/db/pool";
import { requireAdmin } from "@/lib/admin-auth";
import {resolveUserEmail} from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";
import {billingErrorResponse} from "@/lib/billing/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(request: Request): Promise<NextResponse | null> {
  if (!dbEnabled) {
    return NextResponse.json({ error: "服务暂不可用" }, { status: 503 });
  }
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return null;
}

// 站长后台:列出兑换码 + 统计。
export async function GET(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;
  const [cards, stats] = await Promise.all([listCardKeys(), cardKeyStats()]);
  return NextResponse.json({ cards, stats });
}

// 批量生成兑换码。
export async function POST(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;
  if(!sameSiteBillingMutation(request))return NextResponse.json({error:"请求来源无效"},{status:403});
  let body: {
    credits?: number;
    count?: number;
    expiryDays?: number | null;
    batch?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
  const credits = Number(body.credits);
  const count = Number(body.count);
  const expiryDays =
    body.expiryDays == null || body.expiryDays === 0 ? null : Number(body.expiryDays);
  if (!Number.isSafeInteger(credits) || credits<=0 || credits>2147483647 || !Number.isSafeInteger(count) || count<1 || count > 500 || expiryDays!==null&&(!Number.isSafeInteger(expiryDays)||expiryDays<1||expiryDays>36500)) {
    return NextResponse.json(
      { error: "面额需 > 0,数量需 1–500" },
      { status: 400 }
    );
  }
  const cards = await generateCardKeys({
    credits,
    count,
    expiryDays,
    batch: String(body.batch ?? ""),
    note: String(body.note ?? ""),
    actor:await resolveUserEmail(request)??"local-admin",
  });
  const stats = await cardKeyStats();
  return NextResponse.json({ cards, stats });
}

// 停用 / 恢复。
export async function PATCH(request: Request) {
  const blocked = await guard(request);
  if (blocked) return blocked;
  if(!sameSiteBillingMutation(request))return NextResponse.json({error:"请求来源无效"},{status:403});
  let body: { code?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
  const code = String(body.code ?? "").trim().toUpperCase();
  const status = body.status === "disabled" ? "disabled" : "unused";
  if (!code) return NextResponse.json({ error: "缺少 code" }, { status: 400 });
  await setCardKeyStatus(code, status);
  return NextResponse.json({ ok: true });
}
