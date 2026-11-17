import "server-only";
import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { getPool } from "@/platform/db/pool";
import { settingsSecret } from "@/lib/settings-secret";
import { TeamError } from "./errors";
import {ensureTeamSchema} from "@/lib/teams/schema";

import type { TeamAccessGrant, TeamAccessStatus } from "./contracts";

export type TeamActor = { email: string; admin: boolean; consoleAdmin?: boolean };
export function grantStatus(g: Pick<TeamAccessGrant, "enabled" | "revoked_at" | "starts_at" | "expires_at">, now = Date.now()): TeamAccessStatus {
  if (g.revoked_at) return "revoked";
  if (!g.enabled) return "paused";
  if (g.expires_at && new Date(g.expires_at).getTime() <= now) return "expired";
  return new Date(g.starts_at).getTime() > now ? "scheduled" : "active";
}

/** Use the same grant rules in a locked authorization check or a read-only report snapshot. */
export async function requireTeamGrant(tx: PoolClient, actor: TeamActor, lock: 'share' | 'snapshot' = 'share') {
  if (actor.consoleAdmin) return null;
  const row = (await tx.query(`SELECT g.*,u.role,u.banned,u.account_expires_at FROM app_team_access_grants g
    JOIN app_users u ON u.email=g.email WHERE g.email=$1${lock === 'share' ? ' FOR SHARE OF g,u' : ''}`, [actor.email])).rows[0];
  if (!row || grantStatus(row) !== "active" || row.banned || (row.account_expires_at && new Date(row.account_expires_at).getTime() <= Date.now())) throw new TeamError("团队入口授权未生效、已到期或已关闭");
  if (actor.admin && (row.scope !== "all" || row.role !== "admin")) throw new TeamError("没有全团队管理权限");
  return row as TeamAccessGrant;
}
export async function teamEntryAccess(email: string) {
  await ensureTeamSchema();
  const row = (await getPool().query(`SELECT g.*,u.role,u.banned,u.account_expires_at FROM app_team_access_grants g JOIN app_users u ON u.email=g.email WHERE g.email=$1`, [email])).rows[0];
  return row && grantStatus(row) === "active" && !row.banned && (!row.account_expires_at || new Date(row.account_expires_at).getTime() > Date.now())
    ? { allowed: true, admin: row.scope === "all" && row.role === "admin", expiresAt: row.expires_at } : { allowed: false, admin: false, expiresAt: null };
}
const common = { id: z.string().uuid(), email: z.string().trim().min(1).max(254).transform(v => v.toLowerCase()), expectedVersion: z.number().int().nonnegative().nullable() };
export const grantCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("grant"), scope: z.enum(["owned", "all"]), startsAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }).nullable() }).strict(),
  z.object({ ...common, action: z.enum(["pause", "resume", "revoke"]) }).strict(),
]);
export async function mutateGrant(actor: TeamActor, command: z.infer<typeof grantCommandSchema>) {
  if (!actor.consoleAdmin) throw new TeamError("需要后台二次验证");
  await ensureTeamSchema();
  const tx = await getPool().connect();
  const fingerprint = createHmac("sha256", settingsSecret()).update(JSON.stringify(command)).digest("hex");
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    const replay = (await tx.query("SELECT actor,fingerprint FROM app_team_access_audit WHERE id=$1", [command.id])).rows[0];
    if (replay) {
      if (replay.actor !== actor.email || replay.fingerprint !== fingerprint) throw new TeamError("操作编号已用于其他请求", 409);
      await tx.query("COMMIT"); return { ok: true, replayed: true };
    }
    const user = (await tx.query("SELECT email,role,banned,account_expires_at FROM app_users WHERE email=$1 FOR SHARE", [command.email])).rows[0];
    if (!user) throw new TeamError("账号不存在", 404);
    const old = (await tx.query("SELECT * FROM app_team_access_grants WHERE email=$1 FOR UPDATE", [command.email])).rows[0];
    if ((old?.version ?? null) !== command.expectedVersion) throw new TeamError("授权已更新，请刷新后重试", 409);
    if (command.action === "grant") {
      if (user.banned || (user.account_expires_at && new Date(user.account_expires_at).getTime() <= Date.now())) throw new TeamError("账号已停用或到期", 409);
      if ((await tx.query("SELECT 1 FROM app_account_team_members WHERE email=$1", [command.email])).rowCount) throw new TeamError("请先解除子账号归属", 409);
      if (command.scope === "all" && user.role !== "admin") throw new TeamError("全团队范围仅限管理员账号", 403);
      const start = new Date(command.startsAt).getTime(), end = command.expiresAt ? new Date(command.expiresAt).getTime() : null;
      if (end !== null && (end <= Date.now() || end <= start)) throw new TeamError("截止时间须晚于当前时间和生效时间", 400);
      await tx.query(`INSERT INTO app_team_access_grants(email,scope,starts_at,expires_at,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(email) DO UPDATE SET scope=excluded.scope,starts_at=excluded.starts_at,
        expires_at=excluded.expires_at,enabled=true,revoked_at=NULL,updated_by=excluded.updated_by,updated_at=clock_timestamp(),version=app_team_access_grants.version+1`,
        [command.email,command.scope,command.startsAt,command.expiresAt,actor.email]);
    } else {
      if (!old) throw new TeamError("账号尚未授权", 404);
      if (old.revoked_at && command.action !== "revoke") throw new TeamError("已撤销，请重新授权", 409);
      if (command.action === "resume" && (user.banned || (user.account_expires_at && new Date(user.account_expires_at).getTime() <= Date.now()))) throw new TeamError("账号已停用或到期", 409);
      if (command.action === "resume" && old.expires_at && new Date(old.expires_at).getTime() <= Date.now()) throw new TeamError("授权已到期，请先续期", 409);
      await tx.query(`UPDATE app_team_access_grants SET enabled=$2,revoked_at=CASE WHEN $3 THEN clock_timestamp() ELSE revoked_at END,
        updated_by=$4,updated_at=clock_timestamp(),version=version+1 WHERE email=$1`, [command.email,command.action === "resume",command.action === "revoke",actor.email]);
    }
    const after = (await tx.query("SELECT * FROM app_team_access_grants WHERE email=$1", [command.email])).rows[0];
    const publicState = (g: typeof after | undefined) => g ? { scope:g.scope,starts_at:g.starts_at,expires_at:g.expires_at,enabled:g.enabled,revoked_at:g.revoked_at,version:g.version } : null;
    await tx.query("INSERT INTO app_team_access_audit(id,actor,target_email,action,changes,fingerprint) VALUES($1,$2,$3,$4,$5::jsonb,$6)",
      [command.id,actor.email,command.email,command.action,JSON.stringify({ before:publicState(old),after:publicState(after) }),fingerprint]);
    await tx.query("COMMIT"); return { ok:true,replayed:false };
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
export async function listGrants(search: string, page: number) {
  await ensureTeamSchema(); const pool = getPool(), q = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = "(u.email ILIKE $1 OR u.name ILIKE $1)";
  const rows = (await pool.query(`SELECT u.email,u.name,u.role,u.banned,u.account_expires_at,g.scope,g.starts_at,g.expires_at,g.enabled,g.revoked_at,g.version,g.updated_at,
    t.name AS team_name,t.id AS team_id,m.team_id AS member_team_id FROM app_users u
    LEFT JOIN app_team_access_grants g ON g.email=u.email LEFT JOIN app_account_teams t ON t.owner_email=u.email
    LEFT JOIN app_account_team_members m ON m.email=u.email WHERE ${where}
    ORDER BY (g.email IS NOT NULL) DESC,u.name,u.email LIMIT 20 OFFSET $2`, [q,(page-1)*20])).rows;
  const total = Number((await pool.query(`SELECT count(*) FROM app_users u WHERE ${where}`, [q])).rows[0].count);
  return { rows:rows.map(r=>({ ...r,status:r.scope ? grantStatus(r) : "ungranted" })),total,page,size:20 };
}
export async function grantAudit(email: string, page: number) {
  await ensureTeamSchema(); const pool = getPool();
  return { rows:(await pool.query("SELECT id,actor,target_email,action,changes,created_at FROM app_team_access_audit WHERE target_email=$1 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2",[email,(page-1)*20])).rows,
    total:Number((await pool.query("SELECT count(*) FROM app_team_access_audit WHERE target_email=$1",[email])).rows[0].count),page,size:20 };
}
