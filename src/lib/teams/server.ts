import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { ensureSchema, getPool } from "@/lib/db";
import { hashPassword } from "@/lib/pw";
import { settingsSecret } from "@/lib/settings-secret";
import { requireTeamGrant, type TeamActor } from "./grants";
import type { ContentSection, TeamSnapshot } from "./contracts";

let ready: Promise<void> | null = null;
export async function ensureTeamSchema() {
  await ensureSchema();
  if (!ready) ready = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_account_teams (
      id uuid PRIMARY KEY, name text NOT NULL, owner_email text UNIQUE NOT NULL REFERENCES app_users(email),
      authorized_until timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_account_team_members (
      email text PRIMARY KEY REFERENCES app_users(email), team_id uuid NOT NULL REFERENCES app_account_teams(id),
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_account_team_members_team ON app_account_team_members(team_id);
    CREATE TABLE IF NOT EXISTS app_account_team_audit (
      id uuid PRIMARY KEY, actor text NOT NULL, team_id uuid NOT NULL, target_email text NOT NULL DEFAULT '',
      action text NOT NULL, fingerprint text NOT NULL DEFAULT '', changes jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_account_team_audit_team ON app_account_team_audit(team_id,created_at);

    CREATE TABLE IF NOT EXISTS app_team_access_grants (
      email text PRIMARY KEY REFERENCES app_users(email),scope text NOT NULL CHECK(scope IN ('owned','all')),
      starts_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,
      enabled boolean NOT NULL DEFAULT true,revoked_at timestamptz,version integer NOT NULL DEFAULT 0,
      created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(expires_at IS NULL OR expires_at>starts_at));
    CREATE TABLE IF NOT EXISTS app_team_access_audit (
      id uuid PRIMARY KEY,actor text NOT NULL,target_email text NOT NULL,action text NOT NULL,
      changes jsonb NOT NULL DEFAULT '{}',fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS app_team_access_audit_target ON app_team_access_audit(target_email,created_at);
    CREATE TABLE IF NOT EXISTS app_team_access_migrations(id text PRIMARY KEY);
    WITH initial AS (INSERT INTO app_team_access_migrations(id) VALUES('entry-grants-v1') ON CONFLICT DO NOTHING RETURNING id)
    , seeded AS (INSERT INTO app_team_access_grants(email,scope,expires_at,created_by,updated_by)
    SELECT u.email,CASE WHEN u.role='admin' THEN 'all' ELSE 'owned' END,
      CASE WHEN u.role='admin' THEN NULL ELSE t.authorized_until END,'system-migration','system-migration'
    FROM app_users u LEFT JOIN app_account_teams t ON t.owner_email=u.email
    WHERE EXISTS(SELECT 1 FROM initial) AND (u.role='admin' OR t.owner_email IS NOT NULL)
      AND NOT u.banned AND (u.role='admin' OR t.authorized_until>now())
    ON CONFLICT DO NOTHING RETURNING *)
    INSERT INTO app_team_access_audit(id,actor,target_email,action,changes,fingerprint)
    SELECT gen_random_uuid(),'system-migration',email,'migration',jsonb_build_object('before',NULL,'after',jsonb_build_object('scope',scope,'starts_at',starts_at,'expires_at',expires_at,'enabled',enabled,'revoked_at',revoked_at,'version',version)),'' FROM seeded;
  `).then(() => {}).catch(error => { ready = null; throw error; });
  await ready;
}
export class TeamError extends Error { constructor(message: string, public status = 403) { super(message); } }
const email = z.string().trim().min(1).max(254).transform(v => v.toLowerCase());
const instant = z.string().datetime({ offset: true });
const base = { id: z.string().uuid(), teamId: z.string().uuid() };
export const memberCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, email, expectedVersion: z.number().int().nonnegative(), action: z.literal("expiry"), expiresAt: instant }).strict(),
  z.object({ ...base, email, expectedVersion: z.number().int().nonnegative(), action: z.literal("status"), banned: z.boolean() }).strict(),
  z.object({ ...base, email, expectedVersion: z.number().int().nonnegative(), action: z.literal("reset-password"), password: z.string().min(8).max(128) }).strict(),
]);
export const adminCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("create"), ownerEmail: email, name: z.string().trim().min(1).max(80), authorizedUntil: instant }).strict(),
  z.object({ ...base, action: z.literal("update"), expectedVersion: z.number().int().nonnegative(), name: z.string().trim().min(1).max(80), authorizedUntil: instant, enabled: z.boolean() }).strict(),
  z.object({ ...base, action: z.literal("attach"), email, expiresAt: instant }).strict(),
  z.object({ ...base, action: z.literal("detach"), email, expectedVersion: z.number().int().nonnegative() }).strict(),
]);
type Actor = TeamActor;
async function transaction<T>(run: (tx: PoolClient) => Promise<T>) {
  await ensureTeamSchema(); const tx = await getPool().connect();
  try { await tx.query("BEGIN"); const out = await run(tx); await tx.query("COMMIT"); return out; }
  catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
async function scopedTeam(tx: PoolClient, actor: Actor, id?: string) {
  await requireTeamGrant(tx, actor);
  const row = (await tx.query(`SELECT * FROM app_account_teams WHERE ${id ? "id=$1" : "owner_email=$1"} FOR SHARE`, [id || actor.email])).rows[0];
  if (!row || (!actor.admin && (row.owner_email !== actor.email || !row.enabled || new Date(row.authorized_until).getTime() <= Date.now()))) throw new TeamError("没有团队管理权限");
  return row;
}
async function scopedMember(tx: PoolClient, teamId: string, target: string) {
  const member = (await tx.query("SELECT u.email,u.name,u.role,u.banned,u.account_expires_at,u.management_version FROM app_account_team_members m JOIN app_users u ON u.email=m.email WHERE m.team_id=$1 AND m.email=$2 FOR SHARE OF m,u", [teamId, target])).rows[0];
  if (!member || member.role !== "user") throw new TeamError("子账号不属于当前团队"); return member;
}
async function audit(tx: PoolClient, actor: Actor, teamId: string, target: string, action: string, changes: unknown, id: string = randomUUID(), fingerprint = "") {
  await tx.query("INSERT INTO app_account_team_audit(id,actor,team_id,target_email,action,changes,fingerprint) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)", [id, actor.email, teamId, target, action, JSON.stringify(changes), fingerprint]);
}
export async function teamSnapshot(actor: Actor, id?: string): Promise<TeamSnapshot> {
  return transaction(async tx => {
    await requireTeamGrant(tx, actor);
    if (actor.admin && !id) return { team: null, members: [], teams: (await tx.query("SELECT id,name,owner_email,authorized_until,enabled,version FROM app_account_teams ORDER BY created_at DESC")).rows };
    if (!id && !(await tx.query("SELECT 1 FROM app_account_teams WHERE owner_email=$1", [actor.email])).rowCount) return { team: null, members: [] };
    const team = await scopedTeam(tx, actor, id);
    const members = (await tx.query(`SELECT u.email,u.name,u.banned,u.account_expires_at,u.management_version,
      GREATEST(0,COALESCE(b.principal,0)-u.credits_used)::int AS available,
      COALESCE(l.consumed,0)::int AS consumed,COALESCE(a.n,0)::int AS artworks
      FROM app_account_team_members m JOIN app_users u ON u.email=m.email
      LEFT JOIN LATERAL (SELECT sum(remaining) AS principal FROM app_credit_batches WHERE email=u.email AND expires_at>now() AND remaining>0) b ON true
      LEFT JOIN LATERAL (SELECT -sum(delta) AS consumed FROM app_ledger WHERE email=u.email AND kind='consume' AND delta<0) l ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM app_artworks WHERE email=u.email AND deleted_at IS NULL) a ON true
      WHERE m.team_id=$1 AND u.role='user' ORDER BY u.name,u.email`, [team.id])).rows;
    await audit(tx, actor, team.id, "", "view-members", {});
    return { team, members };
  });
}
export async function mutateTeam(actor: Actor, command: z.infer<typeof memberCommandSchema> | z.infer<typeof adminCommandSchema>, adminCommand = false) {
  if (adminCommand && !actor.admin) throw new TeamError("需要站点管理员");
  const passwordHash = command.action === "reset-password" ? hashPassword(command.password) : null;
  const fingerprint = createHmac("sha256", settingsSecret()).update(JSON.stringify(command)).digest("hex");
  return transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    await requireTeamGrant(tx, actor);
    const previous = (await tx.query("SELECT actor,fingerprint FROM app_account_team_audit WHERE id=$1", [command.id])).rows[0];
    // Always reauthorize before acknowledging replay; detached/disabled scopes must not succeed.
    const team = command.action === "create" ? null : await scopedTeam(tx, actor, command.teamId);
    if (previous) {
      if (previous.actor !== actor.email || previous.fingerprint !== fingerprint) throw new TeamError("操作编号已用于其他请求", 409);
      if (!adminCommand && "email" in command) await scopedMember(tx, team.id, command.email);
      return { ok: true, replayed: true };
    }
    let changes: unknown = {};
    if (command.action === "create") {
      const owner = (await tx.query("SELECT email,banned FROM app_users WHERE email=$1 FOR UPDATE", [command.ownerEmail])).rows[0];
      if (!owner || owner.banned || (await tx.query("SELECT 1 FROM app_account_team_members WHERE email=$1", [command.ownerEmail])).rowCount) throw new TeamError("负责人账号不存在、已停用或已是子账号", 409);
      if (new Date(command.authorizedUntil).getTime() <= Date.now()) throw new TeamError("授权期限须晚于现在", 400);
      if ((await tx.query("SELECT 1 FROM app_account_teams WHERE owner_email=$1 OR id=$2", [command.ownerEmail, command.teamId])).rowCount) throw new TeamError("该负责人已有团队", 409);
      await tx.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,$2,$3,$4)", [command.teamId, command.name, command.ownerEmail, command.authorizedUntil]);
      changes = { name: command.name, owner: command.ownerEmail, authorizedUntil: command.authorizedUntil };
    } else if (command.action === "update") {
      if (team.version !== command.expectedVersion) throw new TeamError("团队已更新，请刷新后重试", 409);
      const beyond = (await tx.query("SELECT 1 FROM app_account_team_members m JOIN app_users u ON m.email=u.email WHERE m.team_id=$1 AND (u.account_expires_at IS NULL OR u.account_expires_at>$2) LIMIT 1", [team.id, command.authorizedUntil])).rowCount;
      if (beyond) throw new TeamError("请先缩短子账号期限，再缩短授权上限", 409);
      await tx.query("UPDATE app_account_teams SET name=$2,authorized_until=$3,enabled=$4,version=version+1,updated_at=now() WHERE id=$1", [team.id, command.name, command.authorizedUntil, command.enabled]);
      changes = { name: command.name, authorizedUntil: command.authorizedUntil, enabled: command.enabled };
    } else {
      const user = (await tx.query("SELECT email,role,management_version,account_expires_at,banned FROM app_users WHERE email=$1 FOR UPDATE", [command.email])).rows[0];
      if (!user || user.role !== "user" || command.email === team.owner_email) throw new TeamError("目标须为普通子账号", 409);
      if (command.action === "attach") {
        if ((await tx.query("SELECT 1 FROM app_account_teams WHERE owner_email=$1", [command.email])).rowCount) throw new TeamError("团队负责人不能作为子账号", 409);
        if ((await tx.query("SELECT 1 FROM app_team_access_grants WHERE email=$1 AND revoked_at IS NULL", [command.email])).rowCount) throw new TeamError("请先撤销目标账号的团队入口授权", 409);
        if ((await tx.query("SELECT 1 FROM app_account_team_members WHERE email=$1", [command.email])).rowCount) throw new TeamError("账号已有归属，请先移除旧归属", 409);
        validateExpiry(command.expiresAt, team.authorized_until);
        await tx.query("INSERT INTO app_account_team_members(email,team_id) VALUES($1,$2)", [command.email, team.id]);
        await tx.query("UPDATE app_users SET account_expires_at=$2,management_version=management_version+1 WHERE email=$1", [command.email, command.expiresAt]);
        changes = { expiresAt: command.expiresAt };
      } else {
        await scopedMember(tx, team.id, command.email);
        if (user.management_version !== command.expectedVersion) throw new TeamError("账号已更新，请刷新后重试", 409);
        if (command.action === "detach") {
          await tx.query("DELETE FROM app_account_team_members WHERE team_id=$1 AND email=$2", [team.id, command.email]);
        } else if (command.action === "expiry") {
          validateExpiry(command.expiresAt, team.authorized_until);
          await tx.query("UPDATE app_users SET account_expires_at=$2 WHERE email=$1", [command.email, command.expiresAt]);
          changes = { before: user.account_expires_at, after: command.expiresAt };
        } else if (command.action === "status") {
          if (!command.banned && user.account_expires_at && new Date(user.account_expires_at).getTime() <= Date.now()) throw new TeamError("先设置未来的有效期再启用账号", 409);
          await tx.query("UPDATE app_users SET banned=$2,auth_revoked_before=clock_timestamp() WHERE email=$1", [command.email, command.banned]);
          changes = { before: user.banned, after: command.banned };
        } else if (command.action === "reset-password") {
          await tx.query("UPDATE app_users SET password_hash=$2,auth_revoked_before=clock_timestamp() WHERE email=$1", [command.email, passwordHash]);
          changes = { passwordReset: true, oldSessionsRevoked: true };
        }
        await tx.query("UPDATE app_users SET management_version=management_version+1 WHERE email=$1", [command.email]);
      }
    }
    await audit(tx, actor, command.teamId, "email" in command ? command.email : "", command.action, changes, command.id, fingerprint);
    return { ok: true, replayed: false };
  });
}
function validateExpiry(value: string, cap: string | Date) {
  if (!Number.isFinite(new Date(value).getTime()) || new Date(value).getTime() > new Date(cap).getTime()) throw new TeamError("有效期超过站点授权上限", 400);
}
const sources: Record<ContentSection, string> = {
  artworks: "SELECT id,title,category,prompt,status,ratio,resolution,image_url,video_url,created_at FROM app_artworks WHERE email=$1 AND deleted_at IS NULL",
  ledger: "SELECT id,delta,reason,kind,expires_at,created_at FROM app_ledger WHERE email=$1",
  conversations: `SELECT id,title,'agent' AS source,created_at,updated_at FROM app_agent_sessions WHERE email=$1
    UNION ALL SELECT id,title,'genchat',created_at,updated_at FROM app_genchat_sessions WHERE email=$1`,
  tasks: `SELECT id,kind,COALESCE(snapshot->>'status','unknown') AS status,COALESCE(payload->'p'->>'userPrompt',payload->'p'->>'prompt',payload->>'prompt','') AS prompt,cost,created_at FROM app_image_jobs WHERE email=$1
    UNION ALL SELECT id,'canvas-'||kind,status,COALESCE(parameters->>'prompt',parameters->>'newText',''),cost,created_at FROM app_canvas_image_tasks WHERE email=$1
    UNION ALL SELECT id,'video',status,prompt,cost,created_at FROM app_video_tasks WHERE email=$1`,
  audit: "SELECT id,actor,action,changes::text AS changes,created_at FROM app_account_team_audit WHERE target_email=$1 AND team_id=$2",
};
export async function teamContent(actor: Actor, teamId: string, target: string, section: ContentSection, page: number) {
  return transaction(async tx => {
    const team = await scopedTeam(tx, actor, teamId); await scopedMember(tx, team.id, target);
    const binds: unknown[] = section === "audit" ? [target, team.id] : [target];
    const source = sources[section], total = (await tx.query(`SELECT count(*)::int AS n FROM (${source}) s`, binds)).rows[0].n;
    const rows = (await tx.query(`SELECT * FROM (${source}) s ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $${binds.length + 1}`, [...binds, (page - 1) * 20])).rows;
    await audit(tx, actor, team.id, target, "view-" + section, { page });
    return { rows, total, page, size: 20 };
  });
}
export async function teamConversation(actor: Actor, teamId: string, target: string, id: string, kind: "agent" | "genchat", page: number) {
  return transaction(async tx => {
    const team = await scopedTeam(tx, actor, teamId); await scopedMember(tx, team.id, target);
    const source = kind === "agent" ? `SELECT m.ordinality AS ordinal,m.value->>'role' AS role,
      CASE WHEN jsonb_typeof(m.value->'content')='string' THEN m.value->>'content'
      WHEN jsonb_typeof(m.value->'content')='array' THEN (SELECT string_agg(p.value->>'text','' ORDER BY p.ordinality) FROM jsonb_array_elements(m.value->'content') WITH ORDINALITY p WHERE p.value->>'type'='text') ELSE '' END AS text
      FROM app_agent_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.messages)='array' THEN s.messages ELSE '[]'::jsonb END) WITH ORDINALITY m
      WHERE s.email=$1 AND s.id=$2 AND m.value->>'role' IN ('user','assistant')`
      : `SELECT m.ordinality*2 AS ordinal,'user' AS role,m.value->>'you' AS text FROM app_genchat_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.turns)='array' THEN s.turns ELSE '[]'::jsonb END) WITH ORDINALITY m WHERE s.email=$1 AND s.id=$2
        UNION ALL SELECT m.ordinality*2+1,'assistant',m.value->>'line' FROM app_genchat_sessions s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.turns)='array' THEN s.turns ELSE '[]'::jsonb END) WITH ORDINALITY m WHERE s.email=$1 AND s.id=$2`;
    const total = (await tx.query(`SELECT count(*)::int AS n FROM (${source}) s WHERE COALESCE(text,'')<>''`, [target, id])).rows[0].n;
    const messages = (await tx.query(`SELECT role,left(text,20000) AS text,(length(text)>20000) AS truncated FROM (${source}) s WHERE COALESCE(text,'')<>'' ORDER BY ordinal LIMIT 20 OFFSET $3`, [target, id, (page - 1) * 20])).rows;
    const out = { total, messages, page, size: 20 };
    await audit(tx, actor, team.id, target, "view-conversation", { id, kind, page }); return out;
  });
}
export async function teamArtwork(actor: Actor, teamId: string, target: string, id: string) {
  return transaction(async tx => {
    const team = await scopedTeam(tx, actor, teamId); await scopedMember(tx, team.id, target);
    const row = (await tx.query("SELECT image_url FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL", [id, target])).rows[0];
    if (!row) throw new TeamError("作品不存在", 404);
    await audit(tx, actor, team.id, target, "view-media", { artwork: id }); return row;
  });
}
