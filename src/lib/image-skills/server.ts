import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPool, ensureSchema } from "@/lib/db";
import { ensureEnterpriseSchema } from "@/lib/enterprise/server";
import { OFFICIAL_IMAGE_SKILLS, SkillError, validateSkillDraft, validateSkillSelection, type ImageSkill } from "./catalog";
import { skillDefinitionHash } from "./import";

let schema: Promise<void> | undefined;
export async function ensureImageSkills() {
  if (!schema) schema = ensureSchema().then(ensureEnterpriseSchema).then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_image_skills (
      id text PRIMARY KEY, email text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
      revision integer NOT NULL DEFAULT 1, definition jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    ALTER TABLE app_image_skills ADD COLUMN IF NOT EXISTS enterprise_id uuid REFERENCES app_enterprise_settings(team_id);
    CREATE INDEX IF NOT EXISTS app_image_skills_email_idx ON app_image_skills(email,updated_at DESC);
    CREATE INDEX IF NOT EXISTS app_image_skills_enterprise_idx ON app_image_skills(enterprise_id,updated_at DESC) WHERE deleted_at IS NULL AND enterprise_id IS NOT NULL;
  `)).then(() => undefined).catch(error => { schema = undefined; throw error; });
  await schema;
}
// Ordinary employees use live membership, not an enterprise-manager grant or a
// browser-supplied tenant ID. Activated-enterprise expiry follows the owner entry grant.
const enterpriseAccess = `SELECT t.id,t.name FROM app_enterprise_settings es
  JOIN app_account_teams t ON t.id=es.team_id
  JOIN app_team_access_grants g ON g.email=t.owner_email
  JOIN app_users sponsor ON sponsor.email=t.owner_email
  JOIN app_users viewer ON viewer.email=$1
  WHERE t.enabled AND es.enabled AND g.enabled AND g.revoked_at IS NULL
    AND g.starts_at<=now() AND (g.expires_at IS NULL OR g.expires_at>now())
    AND NOT sponsor.banned AND (sponsor.account_expires_at IS NULL OR sponsor.account_expires_at>now())
    AND NOT viewer.banned AND (viewer.account_expires_at IS NULL OR viewer.account_expires_at>now())
    AND (t.owner_email=$1 OR EXISTS(SELECT 1 FROM app_enterprise_members m WHERE m.enterprise_id=t.id AND m.email=$1))`;
export async function imageSkillEnterprise(email: string) {
  await ensureImageSkills();
  const row=(await getPool().query(enterpriseAccess+" ORDER BY t.name,t.id LIMIT 1", [email.toLowerCase()])).rows[0];
  return row ? {id:row.id as string,name:row.name as string} : null;
}
function fromRow(row: any, viewer: string): ImageSkill {
  return { ...validateSkillDraft(row.definition), id: row.id, revision: row.revision, source: "personal", updatedAt: new Date(row.updated_at).toISOString(),
    visibility: row.enterprise_id ? "enterprise" : "private", authorName: row.author_name?.trim() || "作者", canEdit: row.email === viewer };
}
async function accessibleRows(db: Pool | PoolClient, email: string, id?: string) {
  return db.query(`WITH allowed_enterprises AS (${enterpriseAccess})
    SELECT s.*,u.name AS author_name FROM app_image_skills s JOIN app_users u ON u.email=s.email
    WHERE s.deleted_at IS NULL AND ${id ? "s.id=$2 AND" : ""}
      ((s.enterprise_id IS NULL AND s.email=$1) OR s.enterprise_id IN (SELECT id FROM allowed_enterprises))
    ORDER BY s.updated_at DESC,s.id ${id ? "" : "LIMIT 1000"}`, id ? [email,id] : [email]);
}
export async function listImageSkills(email: string) {
  await ensureImageSkills(); const viewer=email.toLowerCase();
  return [...OFFICIAL_IMAGE_SKILLS, ...(await accessibleRows(getPool(),viewer)).rows.map(row=>fromRow(row,viewer))];
}
export async function resolveImageSkill(email: string, input: unknown): Promise<ImageSkill | null> {
  const selection = validateSkillSelection(input); if (!selection) return null;
  await ensureImageSkills(); const viewer=email.toLowerCase();
  const skill=selection.id.startsWith("official:") ? OFFICIAL_IMAGE_SKILLS.find(item=>item.id===selection.id)
    : (await accessibleRows(getPool(),viewer,selection.id)).rows.map(row=>fromRow(row,viewer))[0];
  if (!skill) throw new SkillError("技能不存在或已移除，请重新选择", 404);
  if (skill.revision !== selection.revision) throw new SkillError("技能已更新，请重新选择最新版本", 409);
  return structuredClone(skill);
}
function visibilityInput(input: unknown): "private" | "enterprise" | undefined {
  if(input===undefined)return undefined;
  if(input!=="private"&&input!=="enterprise")throw new SkillError("请选择有效共享范围");
  return input;
}
export async function saveImageSkill(email: string, input: unknown, selection?: unknown, sharing?: unknown) {
  const definition = validateSkillDraft(input), current = validateSkillSelection(selection), visibility=visibilityInput(sharing), viewer=email.toLowerCase();
  if (current && !current.id.startsWith("personal:")) throw new SkillError("内置技能请另存到我的 Skills");
  await ensureImageSkills(); const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT email,name FROM app_users WHERE email=$1 FOR UPDATE", [viewer]);
    if (!user.rowCount) throw new SkillError("登录账号不存在", 401);
    // Hold the same organization/entry rows that lifecycle updates change. A
    // membership removal or grant revocation cannot race the shared save.
    await client.query("SELECT enterprise_id FROM app_enterprise_members WHERE email=$1 FOR SHARE",[viewer]);
    const enterprises=await client.query(enterpriseAccess+" ORDER BY t.name,t.id FOR SHARE OF t,es,g,sponsor,viewer",[viewer]);
    const allowed=new Set(enterprises.rows.map(row=>row.id));
    let result;
    if (current) {
      const old=(await client.query("SELECT * FROM app_image_skills WHERE email=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL FOR UPDATE",[viewer,current.id,current.revision])).rows[0];
      if(!old)throw new SkillError("技能已更新或移除，请刷新后重试",409);
      if(old.enterprise_id&&!allowed.has(old.enterprise_id))throw new SkillError("技能不属于当前企业，请重新选择",403);
      const target=visibility===undefined ? old.enterprise_id : visibility==="private" ? null : old.enterprise_id || enterprises.rows[0]?.id;
      if(visibility==="enterprise"&&!target)throw new SkillError("当前账号没有有效企业归属",403);
      result=await client.query("UPDATE app_image_skills SET definition=$4,enterprise_id=$5,revision=revision+1,updated_at=now() WHERE email=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING *",[viewer,current.id,current.revision,JSON.stringify(definition),target]);
    } else {
      const target=visibility==="enterprise" ? enterprises.rows[0]?.id : null;
      if(visibility==="enterprise"&&!target)throw new SkillError("当前账号没有有效企业归属",403);
      const count = await client.query("SELECT count(*)::int AS n FROM app_image_skills WHERE email=$1 AND deleted_at IS NULL", [viewer]);
      if (count.rows[0].n >= 100) throw new SkillError("我的 Skills 已达 100 个，请先移除不再使用的技能", 409);
      result = await client.query("INSERT INTO app_image_skills(id,email,definition,enterprise_id) VALUES($1,$2,$3,$4) RETURNING *", [`personal:${randomUUID()}`,viewer,JSON.stringify(definition),target]);
    }
    await client.query("COMMIT"); return fromRow({...result.rows[0],author_name:user.rows[0].name},viewer);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function archiveImageSkill(email: string, input: unknown) {
  const selection = validateSkillSelection(input);
  if (!selection || !selection.id.startsWith("personal:")) throw new SkillError("只能移除自己的技能");
  await ensureImageSkills(); const viewer=email.toLowerCase();
  const result = await getPool().query(`WITH allowed_enterprises AS (${enterpriseAccess})
    UPDATE app_image_skills SET deleted_at=now(),revision=revision+1 WHERE email=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL
      AND (enterprise_id IS NULL OR enterprise_id IN (SELECT id FROM allowed_enterprises)) RETURNING id`, [viewer,selection.id,selection.revision]);
  if (!result.rowCount) throw new SkillError("技能已更新或移除，请刷新后重试", 409);
}

/** Immediate account-scoped import. The existing user-row lock also serializes ordinary creates/edits. */
export async function importImageSkill(email: string, input: unknown) {
  const definition = validateSkillDraft(input), hash = skillDefinitionHash(definition), owner = email.toLowerCase();
  await ensureImageSkills();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT email,name FROM app_users WHERE email=$1 FOR UPDATE", [owner]);
    if (!user.rowCount) throw new SkillError("登录账号不存在", 401);
    const existing = await client.query("SELECT * FROM app_image_skills WHERE email=$1 AND deleted_at IS NULL ORDER BY updated_at DESC", [owner]);
    const duplicate = existing.rows.find(row => skillDefinitionHash(row.definition) === hash);
    if (duplicate) { await client.query("COMMIT"); return { skill: fromRow({...duplicate,author_name:user.rows[0].name},owner), duplicate: true }; }
    if (existing.rows.length >= 100) throw new SkillError("我的 Skills 已达 100 个，请先移除不再使用的技能", 409);
    const created = await client.query("INSERT INTO app_image_skills(id,email,definition) VALUES($1,$2,$3) RETURNING *", [`personal:${randomUUID()}`, owner, JSON.stringify(definition)]);
    await client.query("COMMIT");
    return { skill: fromRow(created.rows[0]), duplicate: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
