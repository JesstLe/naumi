import "server-only";
import { queryReceipt } from "./io";
import { accountIdentity } from "./runtime";
import { createCredentialStore } from "../model-config/credentials";
import { decimalMicros } from "./money";
import type { createSupplierLedger } from "./repository";
import type { CostContext } from "./types";
import { ensureModelSchema } from "../model-config/schema";

/** Import durable internal Router attempts, never the aggregate external SDK response. GET-only recovery. */
export async function importRouterOperation(ledger: ReturnType<typeof createSupplierLedger>, payload: { operation: string; context: CostContext; frozen?: any; requestStartedAt?: string }, fetcher?: typeof fetch) {
  const base = (process.env.NAUMI_ROUTER_COST_URL || process.env.NAUMI_ROUTER_GENERATION_URL || process.env.NAUMI_ROUTER_MANAGEMENT_URL || "").replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const token = process.env.NAUMI_ROUTER_COST_TOKEN || process.env.NAUMI_ROUTER_GENERATION_TOKEN || "";
  if (!base || !token || !/^[A-Za-z0-9._:-]{8,160}$/.test(payload.operation)) throw new Error("Router cost discovery unavailable");
  const record = await queryReceipt(base, `/internal/operations/${encodeURIComponent(payload.operation)}`, token, fetcher);
  if (record.id !== payload.operation || !Array.isArray(record.attempts) || record.attempts.length > 100 || payload.frozen?.routerDigest && record.config_digest !== payload.frozen.routerDigest) throw new Error("Router operation identity/configuration mismatch");
  await ensureModelSchema(ledger.pool);
  const cfg = (await ledger.pool.query(payload.context.modelVersion ? "SELECT config FROM app_model_config_versions WHERE version=$1" : "SELECT v.config FROM app_model_config_versions v JOIN app_model_config_state s ON s.active_version=v.version WHERE s.singleton=true", payload.context.modelVersion ? [payload.context.modelVersion] : [])).rows[0]?.config;
  if (!cfg) throw new Error("Router frozen configuration unavailable");
  const creds = createCredentialStore(ledger.pool), candidates = [];
  for (const p of cfg.providers || []) {
    if (!p.credentialRef) continue;
    const key = await creds.read(p.credentialRef, p.id);
    candidates.push({ p, identity: accountIdentity(p.baseUrl,key) });
  }
  for (let i = 0; i < record.attempts.length; i++) {
    const a = record.attempts[i];
    if (!/^[a-f0-9]{64}$/.test(a.identity) || typeof a.key !== "string" || typeof a.route?.upstream_model !== "string") throw new Error("Router attempt schema mismatch");
    const selected = candidates.find(v => v.identity === a.identity && (!a.credential_ref || v.p.credentialRef === a.credential_ref || !record.config_digest));
    if (!selected) throw new Error("Router original account unavailable; import original credential before reconciliation");
    const p = selected.p, upstream = cfg.upstreamModels.find((u: any) => u.providerId === p.id && u.model === a.route.upstream_model);
    await ledger.account({ id:a.identity,providerId:p.id,protocol:p.protocol,baseUrl:p.baseUrl,credentialRef:p.credentialRef,label:p.name });
    const row = await ledger.begin({ ...payload.context, phase:i ? "fallback" : payload.context.phase, attemptId:a.key,taskId:a.task_id||undefined, accountId:a.identity, providerId:p.id, model:a.route.upstream_model, procurement:upstream?.procurement, startedAt:payload.requestStartedAt });
    const cost = a.receipt?.CostReported === true ? decimalMicros(a.receipt.CostUSD) : null;
    await ledger.apply(row.id, { state:a.state, taskId:a.task_id || a.receipt?.TaskID || undefined, amountMicros:cost, currency:cost!=null?"USD":undefined, status:cost!=null?"reported":"pending", source:"router-durable-receipt", evidence:{ source:"router-durable-receipt",route:a.route.id,rule:payload.context.matchedRuleId||null,routerState:record.state,costPresence:cost!=null,legacyCreditsPresence:"unknown" } });
    if (p.protocol === "apimart-images" && a.task_id) await ledger.enqueue(`task:${row.id}`, "task", { callId:row.id }, a.identity);
  }
  return { count:record.attempts.length, terminal:["completed","failed"].includes(record.state) };
}
