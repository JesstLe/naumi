import "server-only";
import {createHash} from "node:crypto";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {ALL_FEATURE_IDS,DEFAULT_POLICY,type AccessPolicy} from "./catalog";

// Account policy persistence and CAS audit. No HTTP session/administrator resolution.


export class FeatureAccessError extends Error {
  constructor(message: string, readonly status = 403) { super(message); }
}
export async function ensureFeatureAccessSchema() {
  // Core additive DDL runs before user/billing operations, never within a tool's transaction.
  if (dbEnabled) await ensureSchema();
}
export function policyFromRow(row?: Record<string, any>): AccessPolicy {
  if (!row) return { ...DEFAULT_POLICY };
  if (!["default", "custom"].includes(row.mode) || !Array.isArray(row.allowed) || row.allowed.some((id: unknown) => typeof id !== "string" || !ALL_FEATURE_IDS.includes(id))) throw new FeatureAccessError("权限配置异常", 503);
  return { mode: row.mode, allowed: row.mode === "default" ? ALL_FEATURE_IDS : row.allowed, version: Number(row.version) };
}
export async function userFeaturePolicy(email: string): Promise<AccessPolicy> {
  if (!dbEnabled) return { ...DEFAULT_POLICY };
  await ensureFeatureAccessSchema();
  const result = await getPool().query("SELECT mode,allowed,version FROM app_feature_access WHERE email=$1", [email.trim().toLowerCase()]);
  return policyFromRow(result.rows[0]);
}
export async function featureAccessUsers(search: string, page = 1) {
  await ensureFeatureAccessSchema();
  const query = `%${search.slice(0, 120)}%`, offset = (page - 1) * 30;
  const [rows, count] = await Promise.all([
    getPool().query(`SELECT u.email,u.name,u.role,u.banned,p.mode,p.allowed,p.version FROM app_users u LEFT JOIN app_feature_access p USING(email)
      WHERE u.email ILIKE $1 OR u.name ILIKE $1 ORDER BY u.email LIMIT 30 OFFSET $2`, [query, offset]),
    getPool().query("SELECT count(*)::int AS total FROM app_users WHERE email ILIKE $1 OR name ILIKE $1", [query]),
  ]);
  return { users: rows.rows.map(row => ({ email: row.email, name: row.name, role: row.role, banned: row.banned, policy: policyFromRow(row.mode ? row : undefined) })), total: count.rows[0].total };
}
export type PolicyCommand = { id: string; email: string; mode: "default" | "custom"; allowed: string[]; expectedVersion: number };
export function validatePolicyCommand(value: unknown): asserts value is PolicyCommand {
  const v = value as PolicyCommand;
  if (!v || typeof v !== "object" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id || "") || typeof v.email !== "string" || v.email.length > 254 || !v.email.trim() || !["custom", "default"].includes(v.mode) || !Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0 || !Array.isArray(v.allowed) || v.allowed.length > ALL_FEATURE_IDS.length || v.allowed.some(id => typeof id !== "string" || !ALL_FEATURE_IDS.includes(id)) || new Set(v.allowed).size !== v.allowed.length) throw new FeatureAccessError("权限参数无效", 400);
}
export async function saveFeaturePolicy(actor: string, command: PolicyCommand): Promise<AccessPolicy> {
  validatePolicyCommand(command); await ensureFeatureAccessSchema();
  const email = command.email.trim().toLowerCase();
  const allowed = command.mode === "default" ? [] : [...command.allowed].sort();
  const fingerprint = createHash("sha256").update(JSON.stringify({ email, actor, mode: command.mode, allowed, version: command.expectedVersion })).digest("hex");
  const tx = await getPool().connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [command.id]);
    const user = await tx.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE", [email]);
    if (!user.rowCount) throw new FeatureAccessError("用户不存在", 404);
    const replay = await tx.query("SELECT fingerprint,after_policy FROM app_feature_access_audit WHERE id=$1", [command.id]);
    if (replay.rowCount) {
      if (replay.rows[0].fingerprint !== fingerprint) throw new FeatureAccessError("请求标识已用于其他修改", 409);
      await tx.query("COMMIT"); return replay.rows[0].after_policy;
    }
    const current = policyFromRow((await tx.query("SELECT * FROM app_feature_access WHERE email=$1 FOR UPDATE", [email])).rows[0]);
    if (current.version !== command.expectedVersion) throw new FeatureAccessError("权限已更新，请刷新后重试", 409);
    const policy: AccessPolicy = { mode: command.mode, allowed: command.mode === "default" ? ALL_FEATURE_IDS : allowed, version: current.version + 1 };
    await tx.query(`INSERT INTO app_feature_access(email,mode,allowed,version) VALUES($1,$2,$3,$4)
      ON CONFLICT(email) DO UPDATE SET mode=excluded.mode,allowed=excluded.allowed,version=excluded.version,updated_at=now()`, [email, policy.mode, JSON.stringify(allowed), policy.version]);
    await tx.query("INSERT INTO app_feature_access_audit(id,email,actor,fingerprint,before_policy,after_policy) VALUES($1,$2,$3,$4,$5,$6)", [command.id, email, actor, fingerprint, JSON.stringify(current), JSON.stringify(policy)]);
    await tx.query("COMMIT"); return policy;
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
