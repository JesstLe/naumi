import 'server-only';
import {reportOperationVisibleSql} from '../accounts/creation-policy';
import type { Pool, PoolClient } from 'pg';
import {checkReadClientSocket,withOwnedReportClient} from '@/platform/db/owned-read-client';
import { modelConfigSchema } from './schema';
import { supplierChannelKey } from './channel-scheduler';
import type { ModelProvider } from './types';
import type { AcceptanceWindow, ProviderActivity, ProviderActivityOverview } from './provider-activity-contracts';

const ROW_LIMIT = 50_000;
type Counts=Partial<Omit<AcceptanceWindow,'total'>>;
type StatsRow={provider_id:string;total:number;h1:Counts;h24:Counts};
function acceptanceWindow(counts:Counts={}):AcceptanceWindow{
  const {accepted=0,rejected=0,failed=0,unknown=0,processing=0}=counts;
  return {total:accepted+rejected+failed+unknown+processing,accepted,rejected,failed,unknown,processing};
}
const noCircuit = (errorCode: ProviderActivity['circuit']['errorCode']): ProviderActivity['circuit'] => ({ configuredChannels: null, observedChannels: null, openChannels: null, recoveringChannels: null, unobservedChannels: null, errorCode });

/** Each table read has its own bounded read-only transaction. Failures remain
 * independent: no audit row is not evidence of zero calls when storage is absent. */
async function readOnly<T>(pool: Pool, read: (sql: PoolClient) => Promise<T>,signal?:AbortSignal) {
  return withOwnedReportClient(pool,async sql=>{
    await sql.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await sql.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+(signal?checkReadClientSocket:''));
    const result=await read(sql);
    await sql.query('COMMIT');
    return result;
  },signal);
}

export async function readProviderActivity(pool: Pool, config: unknown, providers: readonly ModelProvider[], now = Date.now(),signal?:AbortSignal): Promise<ProviderActivityOverview> {
  signal?.throwIfAborted();
  const from = new Date(now - 86_400_000).toISOString(), until = new Date(now).toISOString(), hour = new Date(now - 3_600_000).toISOString();
  const result: ProviderActivity[] = providers.map(provider => ({ id: provider.id, name: provider.name, enabled: provider.enabled, maxConcurrent: provider.maxConcurrent, timeoutMs: provider.timeoutMs, routingModes: null,
    stats: { h1: null, h24: null, errorCode: 'ACTIVITY_UNAVAILABLE' }, circuit: noCircuit('CONFIG_NOT_RECORDED') }));
  const byId = new Map(result.map(provider => [provider.id, provider]));
  try {
    const rows = await readOnly(pool, async sql => {
      if (!(await sql.query("SELECT to_regclass('app_model_execution_stages') AS name")).rows[0].name) return null;
      // A bounded set is complete at or below the cap and discarded above it.
      // No order is observable from either case, so a history-wide sort is unnecessary.
      return (await sql.query<StatsRow>(`WITH bounded AS (
          SELECT provider_id,
            CASE WHEN state IN ('response-received','stream-completed') THEN 'accepted'
              WHEN state='rejected-not-charged' THEN 'rejected'
              WHEN state IN ('failed-response','failed-output') THEN 'failed'
              WHEN state='submitted' THEN 'processing' ELSE 'unknown' END AS kind,
            created_at >= $5::timestamptz AS recent
          FROM app_model_execution_stages stage
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz AND provider_id=ANY($3::text[]) AND ${reportOperationVisibleSql('stage.operation_id',true)}
          LIMIT $4
        ), counts AS (
          SELECT provider_id,kind,count(*)::int AS n24,count(*) FILTER (WHERE recent)::int AS n1
          FROM bounded GROUP BY provider_id,kind
        )
        SELECT provider_id,SUM(n24)::int AS total,jsonb_object_agg(kind,n24) AS h24,jsonb_object_agg(kind,n1) AS h1
        FROM counts GROUP BY provider_id`,[from,until,providers.map(provider=>provider.id),ROW_LIMIT+1,hour])).rows;
    },signal);
    if (!rows) for (const provider of result) provider.stats.errorCode = 'NOT_RECORDED';
    else if (rows.reduce((total,row)=>total+row.total,0)>ROW_LIMIT) for (const provider of result) provider.stats.errorCode = 'ROW_LIMIT';
    else {
      const rowsByProvider=new Map(rows.map(row=>[row.provider_id,row]));
      for(const provider of result){
        const row=rowsByProvider.get(provider.id);
        provider.stats={h1:acceptanceWindow(row?.h1),h24:acceptanceWindow(row?.h24),errorCode:null};
      }
    }
  } catch { signal?.throwIfAborted(); /* Fixed default code, no SQL details. */ }

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
      },signal);
      if (!rows) for (const provider of result) provider.circuit.errorCode = 'HEALTH_NOT_RECORDED';
      else {
        for (const provider of result) provider.circuit = { configuredChannels: keySets.get(provider.id)!.size, observedChannels: 0, openChannels: 0, recoveringChannels: 0, unobservedChannels: keySets.get(provider.id)!.size, errorCode: null };
        for (const row of rows) { const provider = byId.get(keyOwners.get(row.key)!); if (!provider) continue; const circuit = provider.circuit; circuit.observedChannels!++; circuit.unobservedChannels!--; if (row.opened) circuit.openChannels!++; if (row.probing) circuit.recoveringChannels!++; }
      }
    } catch { signal?.throwIfAborted(); /* Circuit failure doesn't discard known acceptance data. */ }
  }
  return { providers: result, from, until, generatedAt: new Date(now).toISOString(), rowLimit: ROW_LIMIT };
}
