import { NextResponse } from "next/server";
import {
  multiUserEnabled,
  signUserSession,
  USER_COOKIE,
  USER_TTL_MS,
} from "@/lib/native-auth";
import { getUser, getPool, ensureSchema } from "@/lib/db";
import { verifyPassword } from "@/lib/pw";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { loginIdentifierToEmail } from "@/lib/account-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 原生多用户:登录(邮箱+密码)。仅多用户模式开放。
export async function POST(req: Request) {
  if (!(await multiUserEnabled())) {
    return NextResponse.json({ error: "本站未开放登录" }, { status: 403 });
  }
  const ip = clientIp(req) || "0.0.0.0";
  if (!rateLimit(`login:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "尝试过于频繁,请稍后再试" }, { status: 429 });
  }
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
  const email = loginIdentifierToEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  await ensureSchema();
  const tx = await getPool().connect();
  let token = "";
  try {
    await tx.query("BEGIN");
    // Lock credentials through token issuance: a concurrent password reset or
    // ban must either precede verification or revoke the issued old session.
    const state = (await tx.query("SELECT password_hash,banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE", [email])).rows[0];
    if (!state?.password_hash || !verifyPassword(password, state.password_hash)) {
      await tx.query("ROLLBACK");
      return NextResponse.json({ error: "用户名、邮箱或密码错误" }, { status: 401 });
    }
    if (state.banned || (state.account_expires_at && new Date(state.account_expires_at).getTime() <= Date.now())) {
      await tx.query("ROLLBACK");
      return NextResponse.json({ error: "账号已停用或已到期，请联系管理员" }, { status: 403 });
    }
    const issuedAt = Date.now();
    token = signUserSession(email, issuedAt);
    await tx.query("COMMIT");
  } catch (error) { await tx.query("ROLLBACK"); throw error; }
  finally { tx.release(); }
  const user = await getUser(email);
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(USER_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: Math.floor(USER_TTL_MS / 1000) });
  return res;
}
