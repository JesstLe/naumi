import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ModelConfig } from "./types";
import { ensureModelSchema } from "./schema";
import { ModelConfigError } from "./types";

type Limit = { providerId: string; baseUrl: string; maxConcurrent: number; timeoutMs: number };
function capacityIdentity(providerId: string, baseUrl: string) { return createHash("sha256").update(`${providerId}\n${new URL(baseUrl).origin}`).digest("hex"); }
/** Run in the publication transaction, so old tasks see a lowered limit as soon as the pointer changes. */
export async function registerProviderCapacities(tx: PoolClient, config: ModelConfig) {
  for (const p of [...config.providers].sort((a,b) => a.id.localeCompare(b.id))) {
    await tx.query("INSERT INTO app_model_provider_budgets(identity,max_concurrent) VALUES($1,$2) ON CONFLICT(identity) DO UPDATE SET max_concurrent=LEAST(app_model_provider_budgets.max_concurrent,EXCLUDED.max_concurrent)", [capacityIdentity(p.id,p.baseUrl), p.maxConcurrent]);
  }
}
export function createProviderCapacity(pool: Pool) {
  return { async acquire(input: Limit) {
    await ensureModelSchema(pool);
    const identity = capacityIdentity(input.providerId,input.baseUrl), token = randomUUID();
    const tx = await pool.connect(); let allowed = false;
    try {
      await tx.query("BEGIN");
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
    return { async release() { if (released) return; await pool.query("DELETE FROM app_model_provider_leases WHERE identity=$1 AND token=$2", [identity, token]); released = true; } };
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
