import 'server-only';
import type { Pool, PoolClient } from 'pg';
import { modelConfigSchema } from './schema';
import { supplierChannelKey } from './channel-scheduler';
import type { ModelProvider } from './types';
import type { AcceptanceWindow, ProviderActivity, ProviderActivityOverview } from './provider-activity-contracts';

const ROW_LIMIT = 50_000;
const empty = (): AcceptanceWindow => ({ total: 0, accepted: 0, rejected: 0, failed: 0, unknown: 0, processing: 0 });
const category = (state: string): Exclude<keyof AcceptanceWindow, 'total'> =>
  ['response-received', 'stream-completed'].includes(state) ? 'accepted' : state === 'rejected-not-charged' ? 'rejected' :
    ['failed-response', 'failed-output'].includes(state) ? 'failed' : state === 'submitted' ? 'processing' : 'unknown';
const noCircuit = (errorCode: ProviderActivity['circuit']['errorCode']): ProviderActivity['circuit'] => ({ configuredChannels: null, observedChannels: null, openChannels: null, recoveringChannels: null, unobservedChannels: null, errorCode });

/** Each table read has its own bounded read-only transaction. Failures remain
 * independent: no audit row is not evidence of zero calls when storage is absent. */
async function readOnly<T>(pool: Pool, read: (sql: PoolClient) => Promise<T>) {
  const sql = await pool.connect();
  try { await sql.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await sql.query("SET LOCAL statement_timeout='5000ms'"); const result = await read(sql); await sql.query('COMMIT'); return result; }
  catch (error) { await sql.query('ROLLBACK').catch(() => {}); throw error; }
  finally { sql.release(); }
}

export async function readProviderActivity(pool: Pool, config: unknown, providers: readonly ModelProvider[], now = Date.now()): Promise<ProviderActivityOverview> {
  const from = new Date(now - 86_400_000).toISOString(), until = new Date(now).toISOString(), hour = now - 3_600_000;
  const result: ProviderActivity[] = providers.map(provider => ({ id: provider.id, name: provider.name, enabled: provider.enabled, maxConcurrent: provider.maxConcurrent, timeoutMs: provider.timeoutMs, routingModes: null,
    stats: { h1: null, h24: null, errorCode: 'ACTIVITY_UNAVAILABLE' }, circuit: noCircuit('CONFIG_NOT_RECORDED') }));
  const byId = new Map(result.map(provider => [provider.id, provider]));
  try {
    const rows = await readOnly(pool, async sql => {
      if (!(await sql.query("SELECT to_regclass('app_model_execution_stages') AS name")).rows[0].name) return null;
      return (await sql.query(`SELECT provider_id,state,created_at FROM app_model_execution_stages
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz AND provider_id=ANY($3::text[])
        ORDER BY created_at DESC LIMIT $4`, [from, until, providers.map(provider => provider.id), ROW_LIMIT + 1])).rows as { provider_id: string; state: string; created_at: Date }[];
    });
    if (!rows) for (const provider of result) provider.stats.errorCode = 'NOT_RECORDED';
    else if (rows.length > ROW_LIMIT) for (const provider of result) provider.stats.errorCode = 'ROW_LIMIT';
    else {
      for (const provider of result) provider.stats = { h1: empty(), h24: empty(), errorCode: null };
      for (const row of rows) { const stats = byId.get(row.provider_id)?.stats; if (!stats) continue; const key = category(row.state); stats.h24!.total++; stats.h24![key]++; if (row.created_at.getTime() >= hour) { stats.h1!.total++; stats.h1![key]++; } }
    }
  } catch { /* Fixed default code, no upstream SQL/connection information. */ }

  // Parse only identities and published policy through canonical config schemas;
  // neither credentials nor endpoints leave this service.
  const raw = config as { upstreamModels?: unknown; publicModels?: unknown } | null;
  const upstreams = modelConfigSchema.shape.upstreamModels.safeParse(raw?.upstreamModels);
  const publics = modelConfigSchema.shape.publicModels.safeParse(raw?.publicModels);
  if (upstreams.success) {
    const keyOwners = new Map<string, string>();
    const keySets = new Map(providers.map(provider => [provider.id, new Set<string>()]));
    for (const upstream of upstreams.data) { const provider = providers.find(provider => provider.id === upstream.providerId); if (!provider) continue; const key = supplierChannelKey({ providerId: provider.id, baseUrl: provider.baseUrl, wireModel: upstream.model }); keyOwners.set(key, provider.id); keySets.get(provider.id)!.add(key); }
    for (const provider of result) provider.circuit = { ...noCircuit('HEALTH_UNAVAILABLE'), configuredChannels: keySets.get(provider.id)!.size };
    if (publics.success) for (const provider of result) {
      const upstreamIds = new Set(upstreams.data.filter(upstream => upstream.providerId === provider.id).map(upstream => upstream.id));
      provider.routingModes = [...new Set(publics.data.filter(model => model.enabled && model.supplierRouting?.channels.some(channel => channel.enabled && upstreamIds.has(channel.upstreamId))).map(model => model.supplierRouting!.mode))];
    }
    try {
      const rows = await readOnly(pool, async sql => {
        if (!(await sql.query("SELECT to_regclass('app_model_channel_health') AS name")).rows[0].name) return null;
        return (await sql.query(`SELECT key,open_until>$2::timestamptz AS opened,probe_until>$2::timestamptz AS probing FROM app_model_channel_health WHERE key=ANY($1::text[]) LIMIT 601`, [[...keyOwners.keys()], until])).rows as { key: string; opened: boolean | null; probing: boolean | null }[];
      });
      if (!rows) for (const provider of result) provider.circuit.errorCode = 'HEALTH_NOT_RECORDED';
      else {
        for (const provider of result) provider.circuit = { configuredChannels: keySets.get(provider.id)!.size, observedChannels: 0, openChannels: 0, recoveringChannels: 0, unobservedChannels: keySets.get(provider.id)!.size, errorCode: null };
        for (const row of rows) { const provider = byId.get(keyOwners.get(row.key)!); if (!provider) continue; const circuit = provider.circuit; circuit.observedChannels!++; circuit.unobservedChannels!--; if (row.opened) circuit.openChannels!++; if (row.probing) circuit.recoveringChannels!++; }
      }
    } catch { /* Circuit data can fail without discarding known acceptance data. */ }
  }
  return { providers: result, from, until, generatedAt: new Date(now).toISOString(), rowLimit: ROW_LIMIT };
}
