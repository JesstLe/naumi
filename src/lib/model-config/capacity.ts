import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ModelConfig } from "./types";
import { ensureModelSchema } from "./schema";
import { ModelConfigError } from "./types";
import { decryptAtRest } from "../settings";
import { settingsSecret } from "../settings-secret";

type Limit = { providerId: string; baseUrl: string; maxConcurrent: number; timeoutMs: number };
function capacityIdentity(providerId: string, baseUrl: string) { return createHash("sha256").update(`${providerId}\n${new URL(baseUrl).origin}`).digest("hex"); }
export async function providerCapacitySummary(pool: Pool, config: ModelConfig) {
  const identities = config.providers.map(p => capacityIdentity(p.id, p.baseUrl));
  const rows = (await pool.query("SELECT a.alias,b.max_concurrent,count(l.token)::int AS in_flight FROM unnest($1::text[]) a(alias) LEFT JOIN app_model_capacity_accounts c ON c.alias=a.alias LEFT JOIN app_model_provider_budgets b ON b.identity=COALESCE(c.identity,a.alias) LEFT JOIN app_model_provider_leases l ON l.identity=b.identity AND l.expires_at>now() GROUP BY a.alias,b.max_concurrent", [identities])).rows;
  const byIdentity = new Map(rows.map(row => [row.alias, row]));
  return Object.fromEntries(config.providers.map((p, i) => { const row = byIdentity.get(identities[i]); return [p.id, { maxConcurrent: row?.max_concurrent ?? p.maxConcurrent, inFlight: row?.in_flight ?? 0 }]; }));
}
/** Run in the publication transaction, so old tasks see a lowered limit as soon as the pointer changes. */
export async function registerProviderCapacities(tx: PoolClient, config: ModelConfig) {
  // Registration can merge two previously separate accounts. Claims take the shared
  // lock so leases and aliases move together before another request is admitted.
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('naumi-model-capacity-accounts',0))");
  for (const p of [...config.providers].sort((a,b) => a.id.localeCompare(b.id))) {
    const logical = capacityIdentity(p.id,p.baseUrl), aliases = [logical];
    if (p.credentialRef) {
      const row = (await tx.query("SELECT key_enc FROM app_model_credentials WHERE id=$1 AND provider_id=$2", [p.credentialRef,p.id])).rows[0];
      const plain = row && decryptAtRest(row.key_enc);
      if (!plain) throw new ModelConfigError("CREDENTIAL_UNAVAILABLE", "供应商凭据不可用", 503);
      aliases.push(createHmac("sha256",settingsSecret()).update(`capacity-account\n${new URL(p.baseUrl).origin}\n${plain}`).digest("hex"));
    }
    const known = (await tx.query("SELECT identity FROM app_model_capacity_accounts WHERE alias=ANY($1)", [aliases])).rows.map(row => row.identity as string);
    const identities = Array.from(new Set([logical,...known])).sort(), identity = identities[0];
    const limits = (await tx.query("SELECT max_concurrent FROM app_model_provider_budgets WHERE identity=ANY($1) FOR UPDATE", [identities])).rows.map(row => Number(row.max_concurrent));
    await tx.query("INSERT INTO app_model_provider_budgets(identity,max_concurrent) VALUES($1,$2) ON CONFLICT(identity) DO UPDATE SET max_concurrent=LEAST(app_model_provider_budgets.max_concurrent,EXCLUDED.max_concurrent)", [identity,Math.min(p.maxConcurrent,...limits)]);
    await tx.query("UPDATE app_model_capacity_accounts SET identity=$1 WHERE identity=ANY($2)", [identity,identities]);
    await tx.query("UPDATE app_model_provider_leases SET identity=$1 WHERE identity=ANY($2)", [identity,identities]);
    await tx.query("DELETE FROM app_model_provider_budgets WHERE identity=ANY($1) AND identity<>$2", [identities,identity]);
    for (const alias of aliases) await tx.query("INSERT INTO app_model_capacity_accounts(alias,identity) VALUES($1,$2) ON CONFLICT(alias) DO UPDATE SET identity=EXCLUDED.identity", [alias,identity]);
  }
}
export function createProviderCapacity(pool: Pool) {
  return { async acquire(input: Limit) {
    await ensureModelSchema(pool);
    const logical = capacityIdentity(input.providerId,input.baseUrl), token = randomUUID();
    let identity = logical;
    const tx = await pool.connect(); let allowed = false;
    try {
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('naumi-model-capacity-accounts',0))");
      identity = (await tx.query("SELECT identity FROM app_model_capacity_accounts WHERE alias=$1", [logical])).rows[0]?.identity || logical;
      // The row lock serializes claims across app replicas and retained versions. Credential rotation keeps the same budget.
      const budget = (await tx.query("INSERT INTO app_model_provider_budgets(identity,max_concurrent) VALUES($1,$2) ON CONFLICT(identity) DO UPDATE SET max_concurrent=LEAST(app_model_provider_budgets.max_concurrent,EXCLUDED.max_concurrent) RETURNING max_concurrent", [identity, input.maxConcurrent])).rows[0];
      await tx.query("DELETE FROM app_model_provider_leases WHERE identity=$1 AND expires_at<=now()", [identity]);
      const count = Number((await tx.query("SELECT count(*) AS n FROM app_model_provider_leases WHERE identity=$1", [identity])).rows[0].n);
      allowed = count < budget.max_concurrent;
      if (allowed) await tx.query("INSERT INTO app_model_provider_leases(identity,token,expires_at) VALUES($1,$2,now()+($3 * interval '1 millisecond'))", [identity, token, input.timeoutMs + 60000]);
      await tx.query("COMMIT");
    } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
    if (!allowed) throw new ModelConfigError("PROVIDER_BUSY", "当前模型通道繁忙，请稍后再试；本次未提交上游", 429);
    let released = false;
    return { token, async release() { if (released) return; await pool.query("DELETE FROM app_model_provider_leases WHERE token=$1", [token]); released = true; } };
  } };
}

export function capacityFetch(transport: typeof fetch, pool: Pool, input: Limit): typeof fetch {
  const capacity = createProviderCapacity(pool);
  return async (url, init) => {
    const lease = await capacity.acquire(input);
    const release = () => lease.release().catch(() => {});
    try {
      const request = new Request(url, init);
      const response = await transport(new Request(request, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(input.timeoutMs)]) }));
      if (!response.body) { await release(); return response; }
      const reader = response.body.getReader();
      return new Response(new ReadableStream<Uint8Array>({
        async pull(controller) {
          try { const next = await reader.read(); if (next.done) { await release(); controller.close(); } else controller.enqueue(next.value); }
          catch (error) { await release(); controller.error(error); }
        },
        async cancel(reason) { try { await reader.cancel(reason); } finally { await release(); } },
      }), { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { await release(); throw error; }
  };
}
