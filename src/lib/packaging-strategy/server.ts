import "server-only";
import { randomUUID } from "node:crypto";
import { ensureSchema, getPool } from "../db";
import { PackagingError, type PackagingBrief, type PackagingCommand, type PackagingProject, type PackagingResult } from "./contract";

let ready: Promise<void> | undefined;
async function schema() {
  ready ||= ensureSchema().then(() => getPool().query(`CREATE TABLE IF NOT EXISTS app_packaging_projects (
    id uuid PRIMARY KEY, email text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
    title text NOT NULL, brief jsonb NOT NULL, result jsonb, answers text NOT NULL DEFAULT '',
    revision integer NOT NULL DEFAULT 1, run_id uuid, run_until timestamptz,
    skill_id text NOT NULL DEFAULT 'official:brand-packaging-strategy', skill_revision integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX IF NOT EXISTS app_packaging_projects_owner ON app_packaging_projects(email, updated_at DESC);`)).then(() => undefined).catch(error => { ready = undefined; throw error; });
  await ready;
}
function project(row: any): PackagingProject {
  return {id: row.id, title: row.title, brief: row.brief, result: row.result, revision: row.revision, updatedAt: new Date(row.updated_at).toISOString()};
}
export async function listPackagingProjects(email: string) {
  await schema();
  return (await getPool().query("SELECT id,title,revision,updated_at FROM app_packaging_projects WHERE email=$1 ORDER BY updated_at DESC LIMIT 100", [email])).rows.map(row => ({id: row.id, title: row.title, revision: row.revision, updatedAt: new Date(row.updated_at).toISOString()}));
}
export async function getPackagingProject(email: string, id: string) {
  await schema();
  const row = (await getPool().query("SELECT * FROM app_packaging_projects WHERE email=$1 AND id=$2", [email, id])).rows[0];
  if (!row) throw new PackagingError("项目不存在或无权访问", 404);
  return project(row);
}
function sameBrief(a: PackagingBrief, b: PackagingBrief) {
  return Object.keys(a).every(key => a[key as keyof PackagingBrief] === b[key as keyof PackagingBrief]);
}
/** Claim before submitting. CAS + bounded lease prevent concurrent provider submissions.
 * An interrupted run is never automatically resubmitted; the next explicit user action may retry after the lease. */
export async function beginPackagingCommand(email: string, command: PackagingCommand) {
  await schema();
  const tx = await getPool().connect(), runId = command.action === "save" ? null : randomUUID();
  try {
    await tx.query("BEGIN");
    const owner = await tx.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE", [email]);
    if (!owner.rowCount) throw new PackagingError("请先登录", 401);
    let current: any;
    if (command.projectId) {
      current = (await tx.query("SELECT *,run_until>now() AS active FROM app_packaging_projects WHERE email=$1 AND id=$2 FOR UPDATE", [email, command.projectId])).rows[0];
      if (!current) throw new PackagingError("项目不存在或无权访问", 404);
      if (current.revision !== command.expectedRevision) throw new PackagingError("项目已更新，请恢复云端版本后重试；当前输入已保留", 409);
      if (current.active) throw new PackagingError("项目正在生成，请等待完成后重试", 409);
    } else {
      const count = (await tx.query("SELECT count(*)::int n FROM app_packaging_projects WHERE email=$1", [email])).rows[0].n;
      if (count >= 100) throw new PackagingError("项目已达100个，请继续编辑已有项目", 409);
    }
    if (command.action === "refine" && current?.result?.kind !== "strategy") throw new PackagingError("请先生成一份策略再修改");
    const changed = current && !sameBrief(current.brief, command.brief);
    const previous = changed ? null : current?.result || null;
    if (command.action === "refine" && changed) throw new PackagingError("简报已更改，请先重新生成策略");
    const savedAnswers = changed ? "" : current?.answers || "";
    const newAnswer = command.answers?.trim() || "";
    const answers = newAnswer && savedAnswers !== newAnswer && !savedAnswers.endsWith("\n" + newAnswer)
      ? [savedAnswers, newAnswer].filter(Boolean).join("\n") : savedAnswers;
    if (answers.length > 12000) throw new PackagingError("补充信息过长，请整理后重新生成");
    const id = current?.id || randomUUID(), title = command.brief.brand.trim().split(/\r?\n/)[0].slice(0, 80) || "未命名包装项目";
    const parameters = [email, id, title, JSON.stringify(command.brief), JSON.stringify(previous), answers, runId];
    const result = current
      ? await tx.query("UPDATE app_packaging_projects SET title=$3,brief=$4,result=$5,answers=$6,run_id=$7,run_until=CASE WHEN $7::uuid IS NULL THEN NULL ELSE now()+interval '4 minutes' END,revision=revision+1,updated_at=now() WHERE email=$1 AND id=$2 RETURNING *", parameters)
      : await tx.query("INSERT INTO app_packaging_projects(email,id,title,brief,result,answers,run_id,run_until) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7::uuid IS NULL THEN NULL ELSE now()+interval '4 minutes' END) RETURNING *", parameters);
    await tx.query("COMMIT");
    return {project: project(result.rows[0]), runId, previous: previous as PackagingResult | null, previousAnswers: changed ? "" : current?.answers || ""};
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
export async function finishPackagingCommand(email: string, id: string, runId: string, result: PackagingResult | null) {
  const row = (await getPool().query("UPDATE app_packaging_projects SET result=CASE WHEN $4::jsonb IS NULL THEN result ELSE $4::jsonb END,run_id=NULL,run_until=NULL,revision=revision+1,updated_at=now() WHERE email=$1 AND id=$2 AND run_id=$3 RETURNING *", [email, id, runId, result ? JSON.stringify(result) : null])).rows[0];
  if (!row) throw new PackagingError("生成状态已更新，请恢复项目查看结果", 409);
  return project(row);
}
