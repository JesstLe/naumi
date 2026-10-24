import 'server-only';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import {getPool} from "@/platform/db/pool";
import {getSetting,setSetting} from "@/lib/settings/repository";
import { decryptAtRest } from '@/lib/settings';
import { settingsSecret } from '@/lib/settings-secret';
import { readBounded } from '@/lib/supplier-cost/io';
import { modelEndpointFetch } from './transport';
import { modelConfigSchema, type ValidationOptions } from './schema';
import { readProviderActivity } from './provider-activity';
import { balanceMeasurementSchema, type BalanceErrorCode, type BalanceMeasurement, type ProviderBalanceOverview, type ProviderBalanceProbe, type ProviderAccountBalance } from './provider-balance-contracts';

const CACHE_TTL_MS = 5 * 60_000, ERROR_TTL_MS = 30_000, MIN_REFRESH_MS = 15_000, PROBE_TIMEOUT_MS = 12_000;
type Provider = { id: string; name: string; baseUrl: string; credentialRef?: string; enabled: boolean };
/** Adapters are server-owned, documented read-only contracts; protocol names do not select them. */
export type ProviderBalanceAdapter = {
  id: string; origins: readonly string[]; path: string;
  source: { label: string; documentationUrl: string | null; revision: string };
  parse: (body: unknown) => BalanceMeasurement;
};
const geekQuotaResponse = z.object({ data: z.object({
  total_granted: z.number().finite(), total_used: z.number().finite(), total_available: z.number().finite(), unlimited_quota: z.boolean(),
}) });
const apibBalanceResponse = z.object({ success: z.literal(true), remain_balance: z.number().finite(), used_balance: z.number().finite() });
export const documentedBalanceAdapters: readonly ProviderBalanceAdapter[] = [{
  id: 'apib-account-balance-v1', origins: ['https://api.apib.ai'], path: '/v1/user/balance',
  source: { label: 'APIB 供应商返回余额，单位待确认', documentationUrl: 'https://docs.apimart.ai/en/api-reference/account/user-balance', revision: '2026-10-23-apib-user-balance-v1' },
  parse(body) {
    const data = apibBalanceResponse.parse(body);
    // The verified deployment uses this public response contract, but its
    // currency/conversion scale is not supplied. Negative sentinels stay unknown.
    return { kind: 'account_balance', remaining: data.remain_balance < 0 ? null : data.remain_balance, used: data.used_balance < 0 ? null : data.used_balance, total: null, unlimited: null, unit: null };
  },
}, {
  id: 'geek-api-key-quota-v1', origins: ['https://www.geeknow.top'], path: '/api/usage/token/',
  source: { label: 'Geek API Key额度', documentationUrl: 'https://docs.geeknow.ai/api-reference/account/billing', revision: '2026-10-23-geek-key-quota-v1' },
  parse(body) {
    const { data } = geekQuotaResponse.parse(body);
    // The source does not establish a currency or a conversion scale.
    return { kind: 'api_key_quota', total: data.unlimited_quota || data.total_granted < 0 ? null : data.total_granted, used: data.total_used < 0 ? null : data.total_used, remaining: data.unlimited_quota || data.total_available < 0 ? null : data.total_available, unlimited: data.unlimited_quota, unit: null };
  },
}];
type AccountTarget = { id: string; apiKey: string | null; adapter: ProviderBalanceAdapter | null; endpoint: string | null; baseUrl: string; providers: Provider[] };
const cacheSchema = z.object({
  accountId: z.string(), adapterRevision: z.string(), status: z.enum(['ok', 'error']),
  measurement: balanceMeasurementSchema.nullable(), errorCode: z.string().nullable(), checkedAt: z.string().datetime().nullable(), attemptedAt: z.string().datetime(),
  lastKnown: z.object({ measurement: balanceMeasurementSchema, checkedAt: z.string().datetime() }).strict().nullable(),
}).strict();
type CacheRecord = z.infer<typeof cacheSchema>;
type Dependencies = {
  readCredential: (ref: string, providerId: string) => Promise<string | null>;
  readCache: (key: string) => Promise<string | null>; writeCache: (key: string, value: string) => Promise<unknown>;
  transport: (baseUrl: string, options: ValidationOptions) => typeof fetch;
  secret: string; now?: () => number; adapters?: readonly ProviderBalanceAdapter[]; validation?: ValidationOptions;
};
const knownErrors = new Set<BalanceErrorCode>(['AUTH_FAILED', 'RATE_LIMITED', 'UPSTREAM_UNAVAILABLE', 'MALFORMED_RESPONSE', 'NETWORK_ERROR', 'TIMEOUT', 'CREDENTIAL_UNAVAILABLE', 'UNSUPPORTED']);

export function createProviderBalanceService(deps: Dependencies) {
  const now = deps.now || Date.now, adapters = deps.adapters || documentedBalanceAdapters;
  const inFlight = new Map<string, Promise<ProviderAccountBalance>>();
  const digest = (text: string) => createHmac('sha256', deps.secret).update(text).digest('hex');
  async function targets(providers: readonly Provider[]): Promise<AccountTarget[]> {
    const groups = new Map<string, AccountTarget>();
    for (const provider of providers) {
      let apiKey: string | null = null;
      if (provider.credentialRef) { try { apiKey = await deps.readCredential(provider.credentialRef, provider.id); } catch { /* Safe state, never an exception body. */ } }
      let adapter: ProviderBalanceAdapter | null = null, endpoint: string | null = null, canonical = provider.baseUrl;
      try {
        const base = new URL(provider.baseUrl); canonical = base.origin + base.pathname.replace(/\/+$/, '');
        adapter = adapters.find(candidate => candidate.origins.includes(base.origin)) || null;
        if (adapter) { endpoint = new URL(adapter.path, base.origin).toString(); canonical = endpoint; }
      } catch { /* Invalid published endpoint remains unavailable. */ }
      // Same actual key + documented account endpoint groups aliases; different
      // endpoint identities or keys never reuse each other's cached balance.
      const id = digest(JSON.stringify(['provider-account-v2', canonical, apiKey || ['missing', provider.id, provider.credentialRef || null]]));
      const group = groups.get(id);
      if (group) group.providers.push(provider); else groups.set(id, { id, apiKey, adapter, endpoint, baseUrl: provider.baseUrl, providers: [provider] });
    }
    return [...groups.values()];
  }
  async function probe(target: AccountTarget): Promise<ProviderBalanceProbe> {
    if (!target.adapter || !target.endpoint) return { status: 'unsupported', measurement: null, errorCode: 'UNSUPPORTED', checkedAt: null, attemptedAt: null };
    if (!target.apiKey) return { status: 'error', measurement: null, errorCode: 'CREDENTIAL_UNAVAILABLE', checkedAt: null, attemptedAt: null };
    const attemptedAt = new Date(now()).toISOString();
    try {
      const fetcher = deps.transport(target.baseUrl, deps.validation || {});
      const response = await fetcher(target.endpoint, { method: 'GET', headers: { authorization: `Bearer ${target.apiKey}`, accept: 'application/json' }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: 'error' });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); return { status: 'error', measurement: null, checkedAt: null, attemptedAt, errorCode: response.status === 401 || response.status === 403 ? 'AUTH_FAILED' : response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE' }; }
      let body: string;
      try { body = await readBounded(response, 32 * 1024); }
      catch (error) {
        if (!(error instanceof Error) || !['receipt too large', 'empty receipt'].includes(error.message)) throw error;
        return { status: 'error', measurement: null, checkedAt: null, attemptedAt, errorCode: 'MALFORMED_RESPONSE' };
      }
      let measurement: BalanceMeasurement;
      try { measurement = balanceMeasurementSchema.parse(target.adapter.parse(JSON.parse(body))); }
      catch { return { status: 'error', measurement: null, checkedAt: null, attemptedAt, errorCode: 'MALFORMED_RESPONSE' }; }
      return { status: 'ok', measurement, checkedAt: new Date(now()).toISOString(), attemptedAt, errorCode: null };
    } catch (error) {
      const timeout = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
      return { status: 'error', measurement: null, checkedAt: null, attemptedAt, errorCode: timeout ? 'TIMEOUT' : 'NETWORK_ERROR' };
    }
  }
  async function read(target: AccountTarget, refresh: boolean): Promise<ProviderAccountBalance> {
    const summary = {
      accountId: target.id, accountLabel: `凭据账户 ${target.id.slice(0, 8)}`, identity: 'published_credential' as const,
      providers: target.providers.map(provider => ({ id: provider.id, name: provider.name, enabled: provider.enabled })), credentialAvailable: !!target.apiKey,
      source: target.adapter?.source || null,
    };
    if (!target.adapter || !target.apiKey) return { ...summary, ...await probe(target), cache: { state: 'none', expiresAt: null, persisted: false, refreshLimited: false }, lastKnown: null };
    const key = 'provider-balance:v2:' + digest(target.id + ':' + target.adapter.source.revision);
    let cached: CacheRecord | null = null;
    try { const raw = await deps.readCache(key); if (raw) { const parsed = cacheSchema.safeParse(JSON.parse(raw)); if (parsed.success && parsed.data.accountId === target.id && parsed.data.adapterRevision === target.adapter.source.revision && (!parsed.data.errorCode || knownErrors.has(parsed.data.errorCode as BalanceErrorCode)) && (parsed.data.status !== 'ok' || parsed.data.measurement)) cached = parsed.data; } } catch { /* Cache is optional, not authorization. */ }
    const age = cached ? now() - Date.parse(cached.attemptedAt) : Infinity;
    const fresh = age >= 0 && age < (cached?.status === 'ok' ? CACHE_TTL_MS : ERROR_TTL_MS);
    if (cached && fresh && (!refresh || age < MIN_REFRESH_MS)) return { ...summary, status: cached.status, measurement: cached.measurement, errorCode: cached.errorCode as BalanceErrorCode | null, checkedAt: cached.checkedAt, attemptedAt: cached.attemptedAt,
      cache: { state: 'hit', expiresAt: new Date(Date.parse(cached.attemptedAt) + (cached.status === 'ok' ? CACHE_TTL_MS : ERROR_TTL_MS)).toISOString(), persisted: true, refreshLimited: refresh && age < MIN_REFRESH_MS }, lastKnown: cached.status === 'error' ? cached.lastKnown : null };
    const result = await probe(target), lastKnown = result.status === 'error' ? cached?.status === 'ok' && cached.measurement && cached.checkedAt ? { measurement: cached.measurement, checkedAt: cached.checkedAt } : cached?.lastKnown || null : null;
    let persisted = false;
    if (result.attemptedAt && result.status !== 'unsupported') {
      try { await deps.writeCache(key, JSON.stringify({ accountId: target.id, adapterRevision: target.adapter.source.revision, ...result, lastKnown })); persisted = true; } catch { /* The read result remains valid, cache durability is explicit. */ }
    }
    return { ...summary, ...result, cache: { state: 'fresh', expiresAt: result.attemptedAt ? new Date(Date.parse(result.attemptedAt) + (result.status === 'ok' ? CACHE_TTL_MS : ERROR_TTL_MS)).toISOString() : null, persisted, refreshLimited: false }, lastKnown };
  }
  return {
    async overview(providers: readonly Provider[], configVersion: number, refresh = false): Promise<ProviderBalanceOverview> {
      const accounts = await targets(providers), results: ProviderAccountBalance[] = new Array(accounts.length); let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, accounts.length) }, async () => { while (cursor < accounts.length) { const index = cursor++, target = accounts[index]; let pending = inFlight.get(target.id); if (!pending) { pending = read(target, refresh); inFlight.set(target.id, pending); } try { const result = await pending; results[index] = { ...result, providers: target.providers.map(provider => ({ id: provider.id, name: provider.name, enabled: provider.enabled })) }; } finally { if (inFlight.get(target.id) === pending) inFlight.delete(target.id); } } }));
      return { accounts: results, configVersion, generatedAt: new Date(now()).toISOString(), cacheTtlSeconds: CACHE_TTL_MS / 1000 };
    },
  };
}

export class ProviderBalanceFailure extends Error { constructor(public code: 'CONFIG_CHANGED') { super(code); } }
export async function readProviderBalanceCredential(pool: Pool, ref: string, providerId: string) {
  const stored = (await pool.query('SELECT key_enc FROM app_model_credentials WHERE id=$1 AND provider_id=$2', [ref, providerId])).rows[0];
  return stored ? decryptAtRest(stored.key_enc) : null;
}
export function createPublishedProviderBalanceReader(pool: Pool, service: ReturnType<typeof createProviderBalanceService>) {
  return async (refresh = false, includeActivity = true) => {
    const row = (await pool.query(`SELECT v.version,v.config FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton=true`)).rows[0];
    if (!row) throw new Error('CONFIG_UNAVAILABLE');
    const providers = modelConfigSchema.shape.providers.parse(row.config.providers);
    const result = await service.overview(providers, Number(row.version), refresh);
    const activity = includeActivity ? await readProviderActivity(pool, row.config, providers) : undefined;
    const current = (await pool.query('SELECT active_version FROM app_model_config_state WHERE singleton=true')).rows[0]?.active_version;
    if (Number(current) !== Number(row.version)) throw new ProviderBalanceFailure('CONFIG_CHANGED');
    return { ...result, activity };
  };
}
let defaultService: ReturnType<typeof createProviderBalanceService> | undefined;
export async function providerBalanceOverview(refresh = false, includeActivity = true): Promise<ProviderBalanceOverview> {
  const pool = getPool();
  // No bootstrap, runtime execution, supplier-cost collection, or health writes.
  if (!defaultService) defaultService = createProviderBalanceService({
    secret: settingsSecret(),
    readCredential: (ref, providerId) => readProviderBalanceCredential(pool, ref, providerId),
    readCache: getSetting, writeCache: setSetting,
    validation: { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || '').split(/[\s,]+/).filter(Boolean) },
    transport: (baseUrl, validation) => modelEndpointFetch(baseUrl, validation, { providerId: 'balance-read-only', timeoutMs: PROBE_TIMEOUT_MS, costDisabled: true }),
  });
  return createPublishedProviderBalanceReader(pool, defaultService)(refresh, includeActivity);
}
