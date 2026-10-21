import { biAuthorize, biJson } from "@/lib/bi/access";
import { getPool } from "@/lib/db";
import { providerBalanceWithCache } from "@/lib/model-config/provider-balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderRow = {
  id: string; name: string; protocol: string; baseUrl: string;
  enabled: boolean; timeoutMs: number; maxConcurrent: number; credentialRef?: string;
};

type WindowStats = { total: number; ok: number; rejected: number; failed: number; unknown: number };

const EMPTY: WindowStats = { total: 0, ok: 0, rejected: 0, failed: 0, unknown: 0 };

export async function GET(request: Request) {
  const auth = await biAuthorize(request);
  if (auth instanceof Response) return auth;
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const pool = getPool();
    const configRow = (await pool.query(
      `SELECT v.config FROM app_model_config_state s
       JOIN app_model_config_versions v ON v.version = s.active_version LIMIT 1`,
    )).rows[0];
    if (!configRow) return biJson({ error: "模型配置不可用" }, 503);
    const providers: ProviderRow[] = configRow.config.providers ?? [];

    const credentialIds = (await pool.query("SELECT DISTINCT provider_id FROM app_model_credentials")).rows
      .map((row: { provider_id: string }) => row.provider_id);

    // 复用执行审计表：同一口径统计各供应商 1h/24h 的受理结果。
    const stats = new Map<string, { h1: WindowStats; h24: WindowStats }>();
    for (const row of (await pool.query(`
      SELECT provider_id,
        count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS t1,
        count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND state IN ('response-received','stream-completed')) AS o1,
        count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND state = 'rejected-not-charged') AS r1,
        count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND state IN ('failed-response','failed-output')) AS f1,
        count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND state = 'unknown') AS u1,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS t24,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND state IN ('response-received','stream-completed')) AS o24,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND state = 'rejected-not-charged') AS r24,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND state IN ('failed-response','failed-output')) AS f24,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND state = 'unknown') AS u24
      FROM app_model_execution_stages GROUP BY provider_id`,
    )).rows as Record<string, string>[]) {
      stats.set(row.provider_id, {
        h1: { total: +row.t1, ok: +row.o1, rejected: +row.r1, failed: +row.f1, unknown: +row.u1 },
        h24: { total: +row.t24, ok: +row.o24, rejected: +row.r24, failed: +row.f24, unknown: +row.u24 },
      });
    }

    const circuitRows = (await pool.query(
      "SELECT count(*) AS open_count FROM app_model_channel_health WHERE open_until > now()",
    )).rows[0];

    const results = [];
    for (const provider of providers) {
      const stat = stats.get(provider.id);
      const balance = await providerBalanceWithCache(provider, refresh);
      results.push({
        id: provider.id, name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl,
        enabled: provider.enabled !== false, timeoutMs: provider.timeoutMs, maxConcurrent: provider.maxConcurrent,
        hasCredential: credentialIds.includes(provider.id) || !!provider.credentialRef,
        balance,
        stats: stat ?? { h1: EMPTY, h24: EMPTY },
      });
    }
    return biJson({ providers: results, circuitOpenChannels: +(circuitRows?.open_count ?? 0), generatedAt: new Date().toISOString() });
  } catch (error) {
    return biJson({ error: "供应商运营数据暂不可用", detail: error instanceof Error ? error.message : String(error) }, 503);
  }
}
