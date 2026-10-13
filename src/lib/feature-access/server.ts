import "server-only";
import { createHash } from "node:crypto";
import { dbEnabled, ensureSchema, getPool } from "@/lib/db";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import { ALL_FEATURE_IDS, DEFAULT_POLICY, allows, meets, requestRequirement, TOOL_ACCESS, type AccessPolicy } from "./catalog";

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
export async function requestFeaturePolicy(request: Request) {
  const email = await resolveUserEmail(request);
  const admin = await requireAdmin(request);
  if (admin) return { email, admin: true, policy: { ...DEFAULT_POLICY } };
  return { email, admin: false, policy: email ? await userFeaturePolicy(email) : null };
}
export async function featureRequestGate(request: Request): Promise<Response | null> {
  const url = new URL(request.url), requirement = requestRequirement(url.pathname, request.method);
  if (!requirement || !dbEnabled) return null;
  const { email, admin, policy } = await requestFeaturePolicy(request);
  if (admin) return null;
  const canonicalPath = url.pathname.startsWith("/desktop/api/") ? url.pathname.slice("/desktop".length) : url.pathname;
  const api = canonicalPath.startsWith("/api/");
  // Public previews remain public. Existing APIs still enforce their authentication.
  if (!email) return api && !["templates", "tpl-image"].includes(canonicalPath.split("/")[2]) ? accessJson({ error: "请先登录" }, 401) : null;
  return policy && meets(policy, requirement) ? null : accessJson({ error: "此功能尚未授权", code: "FEATURE_DENIED" }, 403);
}
export const ACCESS_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" };
export function accessJson(data: unknown, status = 200) { return Response.json(data, { status, headers: ACCESS_HEADERS }); }
export async function assertAgentToolAccess(email: string, name: string, entry: "canvas" | "workbench" = "workbench", request?: Request) {
  const id = TOOL_ACCESS[name];
  if (!id) throw new FeatureAccessError("工具尚未授权");
  if (!dbEnabled) return;
  if (request) {
    if ((await resolveUserEmail(request))?.toLowerCase() !== email.toLowerCase()) throw new FeatureAccessError("登录状态已失效", 401);
    if (await requireAdmin(request)) return;
  }
  const policy = await userFeaturePolicy(email);
  if (!allows(policy, "agent") || (entry === "canvas" && !allows(policy, "canvas")) || !allows(policy, id)) throw new FeatureAccessError("此功能尚未授权");
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
