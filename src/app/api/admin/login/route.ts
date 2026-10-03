import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_TTL_MS,
  adminPasswordState,
  authenticateAdminPassword,
} from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { supabaseEnabled } from "@/lib/auth-mode";
import { activeNativeUserEmail } from "@/lib/native-auth";
import { getUserRole } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 本地管理员登录(开源版 / 自托管无 Supabase 时用)。
//   GET    → { localAvailable, localAuthed, nativeAdmin } 供前端决定显不显示密码框。
//   POST   → { password } 校验通过 → 下发 HttpOnly 签名会话 cookie。
//   DELETE → 退出,清 cookie。
// 未配置访问密码时保留原邮箱管理员通道；配置后必须通过密码验证。

export async function GET(req: Request) {
  let access;
  try { access = await adminPasswordState(req); }
  catch { return NextResponse.json({ error: "后台验证暂不可用，请稍后重试" }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
  // 只有未配置访问密码时，邮箱管理员才可直接进入。
  let nativeAdmin = false;
  if (!supabaseEnabled && !access.configured) {
    try {
      const nu = await activeNativeUserEmail(req);
      if (nu) nativeAdmin = (await getUserRole(nu)) === "admin";
    } catch {
      /* 按非管理员 */
    }
  }
  return NextResponse.json({
    localAvailable: access.configured,
    passwordRequired: access.configured,
    localAuthed: access.authenticated,
    nativeAdmin,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (req.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const source = new URL(origin), target = new URL(req.url);
      if (source.host !== (req.headers.get("host") || target.host) || source.protocol !== `${req.headers.get("x-forwarded-proto") || target.protocol.replace(":", "")}:`) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
    } catch { return NextResponse.json({ error: "请求来源无效" }, { status: 403 }); }
  }
  const ip = clientIp(req) || "0.0.0.0";
  // 防爆破:每 IP 10 分钟最多 10 次尝试。
  if (!rateLimit(`admin-login:${ip}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "尝试过于频繁,请稍后再试" },
      { status: 429 }
    );
  }
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";
  let session;
  try { session = await authenticateAdminPassword(password); }
  catch { return NextResponse.json({ error: "后台验证暂不可用，请稍后重试" }, { status: 503 }); }
  if (!session) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  res.cookies.set(ADMIN_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
