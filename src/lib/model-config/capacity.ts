import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ModelConfig } from "./types";
import {ensureModelSchema} from "@/lib/model-config/storage-schema";

import { ModelConfigError } from "./types";
import { decryptAtRest } from "../settings";
import { settingsSecret } from "../settings-secret";
import { imageCapacityBusy, imageSupplierWasDispatched, waitForImageCapacity } from "../image-gateway";
import {notifyApplicationWork} from '../application/work-signal';

type Limit = { providerId: string; baseUrl: string; maxConcurrent: number; timeoutMs: number };
function capacityIdentity(providerId: string, baseUrl: string) { return createHash("sha256").update(`${providerId}\n${new URL(baseUrl).origin}`).digest("hex"); }
export async function providerCapacitySummary(pool: Pool, config: ModelConfig) {
  const identities = config.providers.map(p => capacityIdentity(p.id, p.baseUrl));
  const rows = (await pool.query("SELECT a.alias,b.max_concurrent,count(l.token)::int AS in_flight FROM unnest($1::text[]) a(alias) LEFT JOIN app_model_capacity_accounts c ON c.alias=a.alias LEFT JOIN app_model_provider_budgets b ON b.identity=COALESCE(c.identity,a.alias) LEFT JOIN app_model_provider_leases l ON l.identity=b.identity AND l.expires_at>now() GROUP BY a.alias,b.max_concurrent", [identities])).rows;
  const byIdentity = new Map(rows.map(row => [row.alias, row]));
  return Object.fromEntries(config.providers.map((p, i) => { const row = byIdentity.get(identities[i]); return [p.id, { maxConcurrent: row?.max_concurrent ?? p.maxConcurrent, inFlight: row?.in_flight ?? 0, unlimited: false }]; }));
}
export type ProviderCapacityLease = { token: string; expiresAt: string };
export type ProviderCapacityDetail = {
  id: string; name: string; enabled: boolean; merged: boolean;
  configuredMaxConcurrent: number; budgetMaxConcurrent: number | null;
  inFlight: number; leases: ProviderCapacityLease[];
};
/** Operations visibility for budgets and leases: a budget below the published
 * limit (historic ratchet or disabled-provider residue) stalls claims silently;
 * in-flight leases show who occupies the slots until which expiry. */
export async function providerCapacityDetail(pool: Pool, config: ModelConfig): Promise<ProviderCapacityDetail[]> {
  const identities = config.providers.map(p => capacityIdentity(p.id, p.baseUrl));
  const [aliasRows, leaseRows] = await Promise.all([
    pool.query("SELECT alias,identity FROM app_model_capacity_accounts WHERE alias=ANY($1)", [identities]),
    pool.query("SELECT identity,token,expires_at FROM app_model_provider_leases WHERE expires_at>now() ORDER BY expires_at ASC LIMIT 200"),
  ]);
  const identityByAlias = new Map(aliasRows.rows.map(row => [row.alias, row.identity] as const));
  const resolved = new Map(config.providers.map((p, i) => [p.id, identityByAlias.get(identities[i]) || identities[i]] as const));
  const usedIdentities = Array.from(new Set(resolved.values()));
  const [budgetRows, inFlightRows] = await Promise.all([
    pool.query("SELECT identity,max_concurrent FROM app_model_provider_budgets WHERE identity=ANY($1)", [usedIdentities]),
    pool.query("SELECT identity,count(*)::int AS n FROM app_model_provider_leases WHERE identity=ANY($1) AND expires_at>now() GROUP BY identity", [usedIdentities]),
  ]);
  const budgets = new Map(budgetRows.rows.map(row => [row.identity, Number(row.max_concurrent)]));
  const inFlight = new Map(inFlightRows.rows.map(row => [row.identity, Number(row.n)]));
  return config.providers.map(p => {
    const alias = capacityIdentity(p.id, p.baseUrl), identity = resolved.get(p.id)!;
    return {
      id: p.id, name: p.name, enabled: p.enabled,
      merged: identity !== alias,
      configuredMaxConcurrent: p.maxConcurrent, budgetMaxConcurrent: budgets.get(identity) ?? null,
      inFlight: inFlight.get(identity) ?? 0,
      leases: leaseRows.rows.filter(row => row.identity === identity).map(row => ({ token: row.token, expiresAt: row.expires_at.toISOString() })),
    };
  });
}
/** Restore the published limit as the budget for a provider identity. Acquire
 * no longer ratchets down and publication raises enabled budgets, so this only
 * clears residue from historic ratchets, disabled providers or merged aliases. */
export async function resetProviderBudget(pool: Pool, providerId: string, config: ModelConfig) {
  const provider = config.providers.find(p => p.id === providerId);
  if (!provider) throw new ModelConfigError("PROVIDER_UNAVAILABLE", "供应商不在当前发布配置中", 404);
  const alias = capacityIdentity(provider.id, provider.baseUrl);
  const identity = (await pool.query("SELECT identity FROM app_model_capacity_accounts WHERE alias=$1", [alias])).rows[0]?.identity || alias;
  const rows = await pool.query("SELECT max_concurrent FROM app_model_provider_budgets WHERE identity=$1", [identity]);
  const previous = rows.rows[0] ? Number(rows.rows[0].max_concurrent) : null;
  if (previous === null) throw new ModelConfigError("BUDGET_UNAVAILABLE", "该供应商尚无预算记录，无需重置", 409);
  if (previous === provider.maxConcurrent) return { providerId, identity, previous, restored: previous, changed: false };
  const updated = await pool.query("UPDATE app_model_provider_budgets SET max_concurrent=$2 WHERE identity=$1 RETURNING max_concurrent", [identity, provider.maxConcurrent]);
  return { providerId, identity, previous, restored: Number(updated.rows[0].max_concurrent), changed: true };
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
  // Publication owns the CURRENT account limit, including increases. Aggregate
  // all enabled aliases after merges; an old task must not lower it again.
  const active = config.providers.filter(p=>p.enabled);
  if (active.length) await tx.query(`UPDATE app_model_provider_budgets b SET max_concurrent=x.cap
    FROM (SELECT a.identity,min(v.cap)::int AS cap FROM unnest($1::text[],$2::int[]) v(alias,cap)
      JOIN app_model_capacity_accounts a ON a.alias=v.alias GROUP BY a.identity) x WHERE b.identity=x.identity`,
    [active.map(p=>capacityIdentity(p.id,p.baseUrl)),active.map(p=>p.maxConcurrent)]);
}
export function createProviderCapacity(pool: Pool) {
  return { async acquire(input: Limit,connection?:PoolClient) {
    await ensureModelSchema(pool);
    const logical = capacityIdentity(input.providerId,input.baseUrl), token = randomUUID();
    let identity = logical;
    const tx = connection || await pool.connect(); let allowed = false;
    try {
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('naumi-model-capacity-accounts',0))");
      identity = (await tx.query("SELECT identity FROM app_model_capacity_accounts WHERE alias=$1", [logical])).rows[0]?.identity || logical;
      // The row lock serializes claims across app replicas and retained versions. Credential rotation keeps the same budget.
      const budget = (await tx.query("INSERT INTO app_model_provider_budgets(identity,max_concurrent) VALUES($1,$2) ON CONFLICT(identity) DO UPDATE SET identity=EXCLUDED.identity RETURNING max_concurrent", [identity, input.maxConcurrent])).rows[0];
      await tx.query("DELETE FROM app_model_provider_leases WHERE identity=$1 AND expires_at<=now()", [identity]);
      const count = Number((await tx.query("SELECT count(*) AS n FROM app_model_provider_leases WHERE identity=$1", [identity])).rows[0].n);
      allowed = count < budget.max_concurrent;
      if (allowed) await tx.query("INSERT INTO app_model_provider_leases(identity,token,expires_at) VALUES($1,$2,now()+($3 * interval '1 millisecond'))", [identity, token, input.timeoutMs + 60000]);
      await tx.query("COMMIT");
    } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { if(!connection)tx.release(); }
    if (!allowed) throw new ModelConfigError("PROVIDER_BUSY", "当前模型通道繁忙，请稍后再试；本次未提交上游", 429);
    let released = false;
    return { token, async release() {
      if (released) return;
      const result=await pool.query("DELETE FROM app_model_provider_leases WHERE token=$1", [token]);released=true;
      // Only a proven released slot wakes the existing queue. Failed acquire,
      // duplicate/missing release and Deferred jobs never create a busy loop.
      // The optional hint cannot roll back the already-committed deletion.
      if(result.rowCount)await notifyApplicationWork(pool);
    } };
  } };
}

export function capacityFetch(transport: typeof fetch, pool: Pool, input: Limit): typeof fetch {
  const capacity = createProviderCapacity(pool);
  return async (url, init) => {
    const request = new Request(url, init);
    request.signal.throwIfAborted();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(input.timeoutMs)]);
    let lease;
    for (;;) {
      signal.throwIfAborted();
      try { lease = await capacity.acquire(input); break; }
      catch (error) {
        if (!(error instanceof ModelConfigError) || error.code !== "PROVIDER_BUSY") throw error;
        if (!imageSupplierWasDispatched()) throw imageCapacityBusy();
        await waitForImageCapacity(signal);
      }
    }
    const release = () => lease.release().catch(() => {});
    try {
      signal.throwIfAborted();
      const response = await transport(new Request(request, { signal }));
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
