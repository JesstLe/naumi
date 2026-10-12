import "server-only";
import { randomUUID } from "node:crypto";
import { getPool, ensureSchema } from "@/lib/db";
import { OFFICIAL_IMAGE_SKILLS, SkillError, validateSkillDraft, validateSkillSelection, type ImageSkill } from "./catalog";

let schema: Promise<void> | undefined;
export async function ensureImageSkills() {
  if (!schema) schema = ensureSchema().then(() => getPool().query(`
    CREATE TABLE IF NOT EXISTS app_image_skills (
      id text PRIMARY KEY, email text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
      revision integer NOT NULL DEFAULT 1, definition jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS app_image_skills_email_idx ON app_image_skills(email,updated_at DESC);
  `)).then(() => undefined).catch(error => { schema = undefined; throw error; });
  await schema;
}
function fromRow(row: any): ImageSkill {
  return { ...validateSkillDraft(row.definition), id: row.id, revision: row.revision, source: "personal", updatedAt: new Date(row.updated_at).toISOString() };
}
export async function listImageSkills(email: string) {
  await ensureImageSkills();
  const result = await getPool().query("SELECT * FROM app_image_skills WHERE email=$1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 100", [email.toLowerCase()]);
  return [...OFFICIAL_IMAGE_SKILLS, ...result.rows.map(fromRow)];
}
export async function resolveImageSkill(email: string, input: unknown): Promise<ImageSkill | null> {
  const selection = validateSkillSelection(input);
  if (!selection) return null;
  const skill = (await listImageSkills(email)).find(item => item.id === selection.id);
  if (!skill) throw new SkillError("技能不存在或已移除，请重新选择", 404);
  if (skill.revision !== selection.revision) throw new SkillError("技能已更新，请重新选择最新版本", 409);
  return structuredClone(skill);
}
export async function saveImageSkill(email: string, input: unknown, selection?: unknown) {
  const definition = validateSkillDraft(input), current = validateSkillSelection(selection);
  if (current && !current.id.startsWith("personal:")) throw new SkillError("内置技能请另存到我的 Skills");
  await ensureImageSkills();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Serialize per-user creates with the existing user row; never trust a client owner.
    const user = await client.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE", [email.toLowerCase()]);
    if (!user.rowCount) throw new SkillError("登录账号不存在", 401);
    let result;
    if (current) {
      result = await client.query("UPDATE app_image_skills SET definition=$4,revision=revision+1,updated_at=now() WHERE email=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING *", [email.toLowerCase(), current.id, current.revision, JSON.stringify(definition)]);
      if (!result.rowCount) throw new SkillError("技能已更新或移除，请刷新后重试", 409);
    } else {
      const count = await client.query("SELECT count(*)::int AS n FROM app_image_skills WHERE email=$1 AND deleted_at IS NULL", [email.toLowerCase()]);
      if (count.rows[0].n >= 100) throw new SkillError("我的 Skills 已达 100 个，请先移除不再使用的技能", 409);
      result = await client.query("INSERT INTO app_image_skills(id,email,definition) VALUES($1,$2,$3) RETURNING *", [`personal:${randomUUID()}`, email.toLowerCase(), JSON.stringify(definition)]);
    }
    await client.query("COMMIT"); return fromRow(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function archiveImageSkill(email: string, input: unknown) {
  const selection = validateSkillSelection(input);
  if (!selection || !selection.id.startsWith("personal:")) throw new SkillError("只能移除自己的技能");
  await ensureImageSkills();
  const result = await getPool().query("UPDATE app_image_skills SET deleted_at=now(),revision=revision+1 WHERE email=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING id", [email.toLowerCase(), selection.id, selection.revision]);
  if (!result.rowCount) throw new SkillError("技能已更新或移除，请刷新后重试", 409);
}
