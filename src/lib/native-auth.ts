import "server-only";
import {createHmac,timingSafeEqual} from "crypto";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {settingsSecret} from "@/lib/settings-secret";

// Compatibility exports; production mode and billing callers use their owners.
export {MULTI_USER_SETTING,multiUserEnabled} from "./accounts/mode";
export {CREDITS_METERING_SETTING,creditsMeteringOn} from "./billing/metering";


// ---------------------------------------------------------------------------
// 原生多用户账号系统(Pro 多用户模式)。
// 不依赖 Supabase/GoTrue:用户邮箱+密码存应用自带 Postgres(app_users.password_hash),
// 登录后签发 HMAC 签名的会话 cookie(nv_user,内含邮箱)。让 Pro 自托管的预构建镜像
// 直接就能开"访客注册→买积分→生图"的多用户付费站,和官方站体验一致。
// 仅在「无 Supabase + 已激活 Pro + 站长后台打开多用户开关」时启用。
// ---------------------------------------------------------------------------

export const USER_COOKIE = "nv_user";
export const USER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  return settingsSecret();
}

// 会话令牌:"<emailB64url>.<exp>.<hmacHex>"。无状态:签名 + 过期时间自证。
export function signUserSession(email: string, now: number): string {
  const exp = now + USER_TTL_MS;
  const eb = Buffer.from(email).toString("base64url");
  const mac = createHmac("sha256", secret())
    .update(`user:${eb}.${exp}`)
    .digest("hex");
  return `${eb}.${exp}.${mac}`;
}

export function verifyUserSession(value: string, now: number): string | null {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const [eb, expStr, mac] = parts;
    if (!/^[a-f0-9]{64}$/.test(mac)) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < now) return null;
    const expected = createHmac("sha256", secret())
      .update(`user:${eb}.${expStr}`)
      .digest("hex");
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return Buffer.from(eb, "base64url").toString();
  } catch {
    return null;
  }
}

// 密码重置令牌:"<emailB64url>.<exp>.<hmacHex>",30 分钟有效。用邮件发给用户点开重设密码。
export const RESET_TTL_MS = 30 * 60 * 1000;

export function signResetToken(email: string, now: number): string {
  const exp = now + RESET_TTL_MS;
  const eb = Buffer.from(email).toString("base64url");
  const mac = createHmac("sha256", secret())
    .update(`reset:${eb}.${exp}`)
    .digest("hex");
  return `${eb}.${exp}.${mac}`;
}

export function verifyResetToken(value: string, now: number): string | null {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const [eb, expStr, mac] = parts;
    if (!/^[a-f0-9]{64}$/.test(mac)) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < now) return null;
    const expected = createHmac("sha256", secret())
      .update(`reset:${eb}.${expStr}`)
      .digest("hex");
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return Buffer.from(eb, "base64url").toString();
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(/; */)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try { return decodeURIComponent(part.slice(eq + 1)); } catch { return null; }
    }
  }
  return null;
}

/** 从请求 cookie 解析已登录的原生用户邮箱;会话有效则返回,否则 null。 */
export function nativeUserEmail(request: Request): string | null {
  const tok = readCookie(request, USER_COOKIE);
  if (!tok) return null;
  return verifyUserSession(tok, Date.now());
}

/** Database enforcement keeps existing cookies from bypassing bans/password resets. */
export async function activeNativeUserEmail(request: Request): Promise<string | null> {
  const email = nativeUserEmail(request);
  if (!email) return null;
  const issuedAt = Number(readCookie(request, USER_COOKIE)?.split(".")[1]) - USER_TTL_MS;
  return activeNativeAccountEmail(email,issuedAt);
}

/** Account eligibility for an already-authenticated in-process actor; not a login endpoint. */
export async function activeNativeAccountEmail(email:string,issuedAt=Date.now()):Promise<string|null>{
  await ensureSchema();
  const { rows } = await getPool().query("SELECT banned,auth_revoked_before,account_expires_at FROM app_users WHERE email=$1", [email]);
  const user = rows[0];
  if (!user || user.banned || (user.account_expires_at && new Date(user.account_expires_at).getTime() <= Date.now())) return null;
  if (user.auth_revoked_before && issuedAt <= new Date(user.auth_revoked_before).getTime()) return null;
  return email;
}
