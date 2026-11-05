import { NextResponse } from "next/server";
import { adminPasswordState, authenticateAdminPassword, requireAdmin } from "@/lib/admin-auth";
import { authorizeAdminMutation } from "@/lib/admin-mutation";
import { appendManagementLogAfterChange } from "@/lib/bi/management-log";
import { OPERATOR_EMAIL } from "@/lib/operator";
import {setOwnerAccount} from "@/lib/accounts/administration";
import {dbEnabled} from "@/platform/db/pool";
import {getOwnerEmail} from "@/lib/accounts/repository";
import { hashPassword } from "@/lib/pw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 站长邮箱账号(仅管理员):设置后站长可在普通登录框用邮箱+密码登录,
// 与官方站一致;operator 名下的积分/作品/流水会整体迁移到该邮箱。
export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  }
  if (!dbEnabled) return NextResponse.json({ ownerEmail: null, reauthRequired: false });
  const { configured } = await adminPasswordState(req);
  return NextResponse.json({ ownerEmail: await getOwnerEmail(), reauthRequired: configured });
}

export async function POST(req: Request) {
  const mutation = await authorizeAdminMutation(req, "owner-account", 10);
  if (mutation instanceof Response) return mutation;
  if (!dbEnabled) {
    return NextResponse.json({ error: "未配置数据库" }, { status: 503 });
  }
  let body: { email?: string; password?: string; adminPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }
  // Rebinding moves every operator asset; when a console password exists the
  // operator re-enters it here instead of relying on a long-lived session.
  if ((await adminPasswordState(req)).configured && !(await authenticateAdminPassword(String(body.adminPassword ?? "")))) {
    return NextResponse.json({ error: "请输入当前后台访问密码以确认", code: "ADMIN_REAUTH_REQUIRED" }, { status: 403 });
  }
  try {
    // 已设过站长邮箱 → 本次视为改绑:从旧站长邮箱迁到新邮箱;否则从 operator 迁。
    const prev = (await getOwnerEmail()) || OPERATOR_EMAIL;
    if (prev === email) {
      // 同邮箱重设 = 改密码
      const {setUserPassword} = await import("@/lib/accounts/repository");
      await setUserPassword(email, hashPassword(password));
      await appendManagementLogAfterChange({ actor: mutation.actor, subject: email, action: "owner-account", changes: { mode: "password" } });
      return NextResponse.json({ ok: true, ownerEmail: email });
    }
    await setOwnerAccount(prev, email, hashPassword(password));
    await appendManagementLogAfterChange({ actor: mutation.actor, subject: email, action: "owner-account", changes: { mode: "rebind", previous: prev, next: email } });
    return NextResponse.json({ ok: true, ownerEmail: email });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "设置失败" },
      { status: 500 }
    );
  }
}
