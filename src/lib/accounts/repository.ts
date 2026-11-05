import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {OPERATOR_EMAIL} from "@/lib/operator";

// Account credentials, roles and access facts. No catalog, quote or HTTP dependency.

// --- 原生多用户:密码存取(Pro 多用户模式,不依赖 Supabase) ---
export async function setUserPassword(
  emailRaw: string,
  hash: string
): Promise<void> {
  await ensureSchema();
  await getPool().query(`UPDATE app_users SET password_hash = $2 WHERE email = $1`, [
    emailRaw.toLowerCase(),
    hash,
  ]);
}

export async function getUserPasswordHash(
  emailRaw: string
): Promise<string | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{ password_hash: string | null }>(
    `SELECT password_hash FROM app_users WHERE email = $1`,
    [emailRaw.toLowerCase()]
  );
  return rows[0]?.password_hash ?? null;
}

export async function userExists(emailRaw: string): Promise<boolean> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT 1 FROM app_users WHERE email = $1`,
    [emailRaw.toLowerCase()]
  );
  return rows.length > 0;
}

export async function setUserRole(
  emailRaw: string,
  role: string
): Promise<void> {
  await ensureSchema();
  const r = role === "admin" ? "admin" : "user";
  await getPool().query(
    `UPDATE app_users SET role = $2 WHERE email = $1`,
    [emailRaw.toLowerCase(), r]
  );
}

export async function getUserRole(emailRaw: string): Promise<string | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT role FROM app_users WHERE email = $1`,
    [emailRaw.toLowerCase()]
  );
  return (rows[0]?.role as string | undefined) ?? null;
}

/** 当前站长邮箱账号(role=admin 且非内部 operator 合成邮箱);未设置返回 null。 */
export async function getOwnerEmail(): Promise<string | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT email FROM app_users
      WHERE role = 'admin' AND email NOT LIKE 'operator@%.local'
      ORDER BY joined_at ASC LIMIT 1`
  );
  return (rows[0]?.email as string | undefined) ?? null;
}

/** 兼容旧安装的内部操作者邮箱；新安装统一使用 OPERATOR_EMAIL。 */
export async function getLocalOperatorEmail(): Promise<string> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT email FROM app_users
      WHERE email = $1 OR email LIKE 'operator@%.local'
      ORDER BY CASE WHEN email = $1 THEN 0 ELSE 1 END, joined_at ASC
      LIMIT 1`,
    [OPERATOR_EMAIL]
  );
  return (rows[0]?.email as string | undefined) ?? OPERATOR_EMAIL;
}

export async function setUserBanned(
  emailRaw: string,
  banned: boolean
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_users SET banned = $2 WHERE email = $1`,
    [emailRaw.toLowerCase(), banned]
  );
}

// 管理员备注:仅后台可见,纯文本(上限 1000 字防滥用)。
export async function setUserNote(
  emailRaw: string,
  note: string
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_users SET note = $2 WHERE email = $1`,
    [emailRaw.toLowerCase(), note.slice(0, 1000)]
  );
}

/** Given a set of emails, returns the subset currently banned. */
export async function bannedEmailsAmong(emails: string[]): Promise<string[]> {
  await ensureSchema();
  if (emails.length === 0) return [];
  const lowered = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  const { rows } = await getPool().query(
    `SELECT email FROM app_users WHERE banned = true AND email = ANY($1)`,
    [lowered]
  );
  return rows.map((r) => r.email as string);
}

/** Best-effort: records the user's most recent login IP. Never throws. */
export async function recordLoginIp(
  emailRaw: string,
  ip: string | null
): Promise<void> {
  if (!ip) return;
  try {
    await ensureSchema();
    await getPool().query(
      `UPDATE app_users SET last_ip = $2, last_login_at = now() WHERE email = $1`,
      [emailRaw.toLowerCase(), ip]
    );
  } catch {
    /* IP tracking is non-critical — never block login on it */
  }
}

export type BannedIpRow = {
  ip: string;
  reason: string;
  createdAt: string;
};

export async function banIp(ip: string, reason = ""): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_banned_ips (ip, reason) VALUES ($1, $2)
     ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason`,
    [ip.trim(), reason]
  );
}

export async function unbanIp(ip: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM app_banned_ips WHERE ip = $1`, [
    ip.trim(),
  ]);
}

export async function listBannedIps(): Promise<BannedIpRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT ip, reason, created_at FROM app_banned_ips
      ORDER BY created_at DESC`
  );
  return rows.map((r) => ({
    ip: r.ip,
    reason: r.reason ?? "",
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** True when the account is banned OR the request IP is on the blocklist. */
export async function isBanned(
  emailRaw: string,
  ip: string | null
): Promise<boolean> {
  await ensureSchema();
  const email = emailRaw.trim().toLowerCase();
  if (email) {
    const u = await getPool().query(
      `SELECT 1 FROM app_users WHERE email = $1 AND banned = true`,
      [email]
    );
    if ((u.rowCount ?? 0) > 0) return true;
  }
  if (ip) {
    const b = await getPool().query(
      `SELECT 1 FROM app_banned_ips WHERE ip = $1`,
      [ip.trim()]
    );
    if ((b.rowCount ?? 0) > 0) return true;
  }
  return false;
}

// --- Phone binding (a phone bound to an account is stored on app_users.phone;
//     phone-OTP login resolves a bound phone to that account's email) ---------

/** The account email that has this phone bound, or null. */
export async function findEmailByBoundPhone(
  phone: string
): Promise<string | null> {
  await ensureSchema();
  const r = await getPool().query(
    `SELECT email FROM app_users WHERE phone = $1 LIMIT 1`,
    [phone]
  );
  return r.rows[0]?.email ?? null;
}

/** Whether this Supabase auth email already exists (e.g. a synthetic phone account). */
export async function authEmailExists(email: string): Promise<boolean> {
  await ensureSchema();
  const r = await getPool().query(
    `SELECT 1 FROM auth.users WHERE email = $1 LIMIT 1`,
    [email]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Bind a phone to an existing account (by email). Returns false if no row. */
export async function bindPhoneToEmail(
  email: string,
  phone: string
): Promise<boolean> {
  await ensureSchema();
  const r = await getPool().query(
    `UPDATE app_users SET phone = $2 WHERE email = $1`,
    [email, phone]
  );
  return (r.rowCount ?? 0) > 0;
}
