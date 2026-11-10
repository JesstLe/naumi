import "server-only";
import { createHash } from "node:crypto";
import { getPool } from "@/platform/db/pool";
import { withTransaction } from "@/platform/db/transaction";
import { ensureAgentGatewaySchema, DAY_START } from "./schema";
import { GatewayError } from "./errors";
import type { AgentToken } from "./tokens";

// Call ledger: one row per (token, operationId). It owns idempotency and the per-token daily
// budget. Billing itself stays with the billing module; credits here are the server quote (cap).

export type CallState = "running" | "succeeded" | "failed" | "rejected";
export type CallOutput = { text: string; media: string[]; details: Record<string, unknown> };
export type CallFailure = { code: string; message: string; submitted: false | "unknown" | true };
export type CallView = {
  operationId: string; tool: string; state: CallState | "unknown"; credits: number;
  createdAt: string; finishedAt: string | null; output?: CallOutput; error?: CallFailure;
};
type CallRow = {
  operation_id: string; tool: string; args_sha256: string; state: CallState; credits: number; timeout_ms: number;
  result: CallOutput | null; error: CallFailure | null; created_at: Date; finished_at: Date | null;
};

/** A running row older than its tool budget plus a margin lost its executor (e.g. process exit). */
const STALE_MARGIN_MS = 120_000;
const MAX_STORED_DETAILS_BYTES = 256 * 1024;
export const MAX_RUNNING_PER_TOKEN = 4;

export const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function argumentsDigest(tool: string, args: unknown, semantics?:{request?:string;scope?:{kind:string;tenantId:string|null}}): string {
  // Preserve the legacy digest when no extra execution semantics were supplied.
  // A historical nonempty request cannot be proven identical: status remains
  // readable, but replay must conflict rather than accept a changed instruction.
  return createHash("sha256").update(canonical({ tool, args,...(semantics?.request?{request:semantics.request}:{}),...(semantics?.scope?{scope:semantics.scope}:{}) })).digest("hex");
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function view(row: CallRow): CallView {
  const stale = row.state === "running" && Date.now() - new Date(row.created_at).getTime() > row.timeout_ms + STALE_MARGIN_MS;
  return {
    operationId: row.operation_id, tool: row.tool, state: stale ? "unknown" : row.state, credits: row.credits,
    createdAt: new Date(row.created_at).toISOString(), finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    ...(row.result ? { output: row.result } : {}),
    ...(row.error ? { error: row.error } : stale ? { error: { code: "RESULT_UNKNOWN", message: "执行进程已结束但没有记录结果；请在作品库核对，不要重复提交收费任务", submitted: "unknown" as const } } : {}),
  };
}

export async function readCall(token: AgentToken, operationId: string): Promise<CallView | null> {
  if (!OPERATION_ID.test(operationId)) throw new GatewayError("ARGUMENT_INVALID", "operationId 必须是 UUID", 400);
  await ensureAgentGatewaySchema();
  const row = (await getPool().query<CallRow>("SELECT * FROM app_agent_gateway_calls WHERE token_id=$1 AND operation_id=$2", [token.id, operationId])).rows[0];
  return row ? view(row) : null;
}

/** Same operationId with the same tool+arguments is a replay; anything else is a conflict. */
export async function existingCall(token: AgentToken, operationId: string, tool: string, digest: string): Promise<CallView | null> {
  await ensureAgentGatewaySchema();
  const row = (await getPool().query<CallRow>("SELECT * FROM app_agent_gateway_calls WHERE token_id=$1 AND operation_id=$2", [token.id, operationId])).rows[0];
  if (!row) return null;
  if (row.tool !== tool || row.args_sha256 !== digest) throw new GatewayError("OPERATION_CONFLICT", "这个 operationId 已用于另一组工具参数；新任务请使用新的 operationId", 409);
  return view(row);
}

export async function budgetState(token: AgentToken): Promise<{ limit: number | null; spentToday: number; remainingToday: number | null }> {
  await ensureAgentGatewaySchema();
  const spent = Number((await getPool().query(`SELECT COALESCE(sum(credits),0)::int AS n FROM app_agent_gateway_calls WHERE token_id=$1 AND state<>'rejected' AND created_at >= ${DAY_START}`, [token.id])).rows[0].n);
  return { limit: token.dailyCreditLimit, spentToday: spent, remainingToday: token.dailyCreditLimit === null ? null : Math.max(0, token.dailyCreditLimit - spent) };
}

/**
 * Atomically re-checks the token, the operationId and the daily budget, then records the call as
 * running. Concurrent calls on one token serialize on the token row, so the budget cannot be raced.
 */
export async function reserveCall(token: AgentToken, input: { operationId: string; tool: string; digest: string; credits: number; timeoutMs: number }): Promise<{ replay: CallView } | { reserved: true }> {
  await ensureAgentGatewaySchema();
  return withTransaction(getPool(), async tx => {
    const live = (await tx.query<{ revoked_at: Date | null; expires_at: Date | null; daily_credit_limit: number | null }>("SELECT revoked_at, expires_at, daily_credit_limit FROM app_agent_tokens WHERE id=$1 FOR UPDATE", [token.id])).rows[0];
    if (!live || live.revoked_at || (live.expires_at && new Date(live.expires_at).getTime() <= Date.now())) throw new GatewayError("TOKEN_REVOKED", "令牌已失效", 401);
    const prior = (await tx.query<CallRow>("SELECT * FROM app_agent_gateway_calls WHERE token_id=$1 AND operation_id=$2", [token.id, input.operationId])).rows[0];
    if (prior) {
      if (prior.tool !== input.tool || prior.args_sha256 !== input.digest) throw new GatewayError("OPERATION_CONFLICT", "这个 operationId 已用于另一组工具参数；新任务请使用新的 operationId", 409);
      return { replay: view(prior) };
    }
    const running = Number((await tx.query("SELECT count(*)::int AS n FROM app_agent_gateway_calls WHERE token_id=$1 AND state='running' AND created_at > now() - make_interval(secs => (timeout_ms + $2)::double precision / 1000)", [token.id, STALE_MARGIN_MS])).rows[0].n);
    if (running >= MAX_RUNNING_PER_TOKEN) throw new GatewayError("RATE_LIMITED", `同一令牌最多同时执行 ${MAX_RUNNING_PER_TOKEN} 个任务，请等前面的任务完成`, 429);
    if (live.daily_credit_limit !== null && input.credits > 0) {
      const spent = Number((await tx.query(`SELECT COALESCE(sum(credits),0)::int AS n FROM app_agent_gateway_calls WHERE token_id=$1 AND state<>'rejected' AND created_at >= ${DAY_START}`, [token.id])).rows[0].n);
      if (spent + input.credits > live.daily_credit_limit) {
        throw new GatewayError("BUDGET_EXCEEDED", `超出令牌每日积分预算：本次报价 ${input.credits}，今日已用 ${spent}，上限 ${live.daily_credit_limit}。未提交任务，未扣积分`, 402);
      }
    }
    await tx.query(
      "INSERT INTO app_agent_gateway_calls(token_id,operation_id,email,tool,args_sha256,state,credits,timeout_ms) VALUES($1,$2,$3,$4,$5,'running',$6,$7)",
      [token.id, input.operationId, token.email, input.tool, input.digest, input.credits, input.timeoutMs],
    );
    return { reserved: true as const };
  });
}

export async function finishCall(token: AgentToken, operationId: string, outcome: { state: Exclude<CallState, "running">; output?: CallOutput; error?: CallFailure }): Promise<CallView> {
  let output = outcome.output;
  if (output && Buffer.byteLength(JSON.stringify(output.details)) > MAX_STORED_DETAILS_BYTES) output = { ...output, details: { truncated: true } };
  const row = (await getPool().query<CallRow>(
    "UPDATE app_agent_gateway_calls SET state=$3, result=$4::jsonb, error=$5::jsonb, finished_at=now() WHERE token_id=$1 AND operation_id=$2 AND state='running' RETURNING *",
    [token.id, operationId, outcome.state, output ? JSON.stringify(output) : null, outcome.error ? JSON.stringify(outcome.error) : null],
  )).rows[0];
  if (!row) throw new GatewayError("INTERNAL", "任务记录状态已变化", 500, "unknown");
  return view(row);
}
