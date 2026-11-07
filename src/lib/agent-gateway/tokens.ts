import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPool } from "@/platform/db/pool";
import { ensureAgentGatewaySchema, DAY_START } from "./schema";
import { GatewayError } from "./errors";

// Personal API tokens: the only machine credential for the agent gateway.
// The secret is shown once at creation; only its SHA-256 is stored.

export const TOKEN_SCOPES = ["read", "write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];
export const MAX_ACTIVE_TOKENS = 20;
const TOKEN_PATTERN = /^nmk_[A-Za-z0-9_-]{43}$/;

export type AgentToken = {
  id: string; email: string; name: string; prefix: string; scopes: TokenScope[];
  dailyCreditLimit: number | null; expiresAt: string | null; createdAt: string;
  lastUsedAt: string | null; revokedAt: string | null;
};
type TokenRow = {
  id: string; email: string; name: string; token_prefix: string; scopes: string[];
  daily_credit_limit: number | null; expires_at: Date | null; created_at: Date;
  last_used_at: Date | null; revoked_at: Date | null;
};

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);
function view(row: TokenRow): AgentToken {
  return {
    id: row.id, email: row.email, name: row.name, prefix: row.token_prefix,
    scopes: row.scopes.filter((s): s is TokenScope => (TOKEN_SCOPES as readonly string[]).includes(s)),
    dailyCreditLimit: row.daily_credit_limit, expiresAt: iso(row.expires_at), createdAt: iso(row.created_at)!,
    lastUsedAt: iso(row.last_used_at), revokedAt: iso(row.revoked_at),
  };
}
const hashToken = (secret: string) => createHash("sha256").update(secret).digest("hex");

export type TokenInput = { name: string; scopes: TokenScope[]; dailyCreditLimit: number | null; expiresInDays: number | null };
export function parseTokenInput(body: unknown): TokenInput {
  const value = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 60 || /[\u0000-\u001f]/.test(name)) throw new GatewayError("ARGUMENT_INVALID", "令牌名称需为 1-60 个字符", 400);
  const scopes = Array.isArray(value.scopes) ? [...new Set(value.scopes)] : ["read", "write"];
  if (!scopes.length || !scopes.every(s => (TOKEN_SCOPES as readonly unknown[]).includes(s))) throw new GatewayError("ARGUMENT_INVALID", "权限只能是 read / write", 400);
  if (scopes.includes("write") && !scopes.includes("read")) scopes.push("read");
  const limit = value.dailyCreditLimit;
  if (limit !== null && limit !== undefined && !(Number.isInteger(limit) && (limit as number) >= 0 && (limit as number) <= 1_000_000)) throw new GatewayError("ARGUMENT_INVALID", "每日积分上限需为 0-1000000 的整数，或不限", 400);
  const days = value.expiresInDays;
  if (days !== null && days !== undefined && !(Number.isInteger(days) && (days as number) >= 1 && (days as number) <= 365)) throw new GatewayError("ARGUMENT_INVALID", "有效期需为 1-365 天，或长期有效", 400);
  return { name, scopes: scopes as TokenScope[], dailyCreditLimit: (limit ?? null) as number | null, expiresInDays: (days ?? null) as number | null };
}

export async function createAgentToken(email: string, input: TokenInput): Promise<{ token: AgentToken; secret: string }> {
  await ensureAgentGatewaySchema();
  const owner = email.trim().toLowerCase();
  const secret = `nmk_${randomBytes(32).toString("base64url")}`;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Serialize per owner so the active-token cap cannot be raced.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('agent-token:' || $1))", [owner]);
    const active = Number((await client.query("SELECT count(*)::int AS n FROM app_agent_tokens WHERE email=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())", [owner])).rows[0].n);
    if (active >= MAX_ACTIVE_TOKENS) throw new GatewayError("ARGUMENT_INVALID", `最多同时保留 ${MAX_ACTIVE_TOKENS} 个有效令牌，请先吊销不用的令牌`, 409);
    const row = (await client.query<TokenRow>(
      `INSERT INTO app_agent_tokens(id,email,name,token_hash,token_prefix,scopes,daily_credit_limit,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::int IS NULL THEN NULL ELSE now() + make_interval(days => $8::int) END) RETURNING *`,
      [randomUUID(), owner, input.name, hashToken(secret), secret.slice(0, 12), input.scopes, input.dailyCreditLimit, input.expiresInDays],
    )).rows[0];
    await client.query("COMMIT");
    return { token: view(row), secret };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function listAgentTokens(email: string): Promise<(AgentToken & { spentToday: number })[]> {
  await ensureAgentGatewaySchema();
  const rows = (await getPool().query<TokenRow & { spent_today: number }>(
    `SELECT t.*, COALESCE((SELECT sum(c.credits)::int FROM app_agent_gateway_calls c WHERE c.token_id=t.id AND c.state<>'rejected' AND c.created_at >= ${DAY_START}),0) AS spent_today
       FROM app_agent_tokens t WHERE t.email=$1 ORDER BY t.revoked_at IS NOT NULL, t.created_at DESC LIMIT 100`,
    [email.trim().toLowerCase()],
  )).rows;
  return rows.map(row => ({ ...view(row), spentToday: Number(row.spent_today) }));
}

export async function revokeAgentToken(email: string, id: string): Promise<boolean> {
  await ensureAgentGatewaySchema();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const result = await getPool().query("UPDATE app_agent_tokens SET revoked_at=now() WHERE id=$1 AND email=$2 AND revoked_at IS NULL", [id, email.trim().toLowerCase()]);
  return (result.rowCount ?? 0) > 0;
}

/** Resolves a presented secret to its live token. Never logs or returns the secret. */
export async function authenticateAgentToken(secret: string): Promise<AgentToken> {
  if (!TOKEN_PATTERN.test(secret)) throw new GatewayError("UNAUTHORIZED", "令牌无效", 401);
  await ensureAgentGatewaySchema();
  const row = (await getPool().query<TokenRow>("SELECT * FROM app_agent_tokens WHERE token_hash=$1", [hashToken(secret)])).rows[0];
  if (!row) throw new GatewayError("UNAUTHORIZED", "令牌无效", 401);
  if (row.revoked_at) throw new GatewayError("TOKEN_REVOKED", "令牌已吊销", 401);
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) throw new GatewayError("TOKEN_EXPIRED", "令牌已过期", 401);
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    void getPool().query("UPDATE app_agent_tokens SET last_used_at=now() WHERE id=$1", [row.id]).catch(() => undefined);
  }
  return view(row);
}
