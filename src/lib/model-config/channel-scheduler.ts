import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ChannelPolicy } from "./channel-policy";
import type { ModelExecutionScope } from "./context";
import { ensureModelSchema } from "./schema";
import { createProviderCapacity } from "./capacity";
import { ModelConfigError } from "./types";
import { imageModelDisplayId } from "../image-model-routing";
import { readLiveChannels, channelStillEnabled, readChannelOperationPin } from "./channel-availability";
import { channelFailurePolicy, type ChannelFailure } from "./channel-health-policy";
import { imageCapacityBusy } from "../image-gateway";
export type ChannelTarget = ChannelPolicy["channels"][number] & {
    scope: ModelExecutionScope;
};
export function supplierChannelKey(c: {
    providerId: string;
    baseUrl: string;
    wireModel: string;
}) { return createHash("sha256").update(JSON.stringify([c.providerId, c.baseUrl, imageModelDisplayId(c.wireModel)])).digest("hex"); }
export function channelHealthKey(c: ChannelTarget) { return supplierChannelKey(c.scope.connection); }
export async function channelHealthSummary(pool: Pool, config: import("./types").ModelConfig) { const keys = config.upstreamModels.map(u => { const p = config.providers.find(p => p.id === u.providerId)!; return { id: u.id, key: supplierChannelKey({ providerId: p.id, baseUrl: p.baseUrl, wireModel: u.model }) }; }); const rows = (await pool.query("SELECT key,failures,last_status,last_failure_kind,last_success_at,open_until,open_until>now() opened,probe_until>now() probing FROM app_model_channel_health WHERE key=ANY($1)", [keys.map(k => k.key)])).rows; return Object.fromEntries(keys.map(k => { const r = rows.find(r => r.key === k.key); return [k.id, { state: r?.opened ? "cooldown" : r?.probing ? "recovering" : r?.failures > 0 ? "failed" : r?.last_success_at ? "available" : "unobserved", failures: r?.failures || 0, retryAt: r?.open_until?.toISOString() || null, lastStatus: r?.last_status || null, failureKind: r?.last_failure_kind || null }]; })); }
export function compareChannels(a: {
    priority: number;
    weight: number;
    served: bigint;
    index: number;
}, b: typeof a, mode: ChannelPolicy["mode"]) { if (a.priority !== b.priority)
    return a.priority - b.priority; if (mode === "priority")
    return a.index - b.index; const x = (a.served + BigInt(1)) * BigInt(b.weight), y = (b.served + BigInt(1)) * BigInt(a.weight); return x < y ? -1 : x > y ? 1 : a.index - b.index; }
export async function claimChannel(pool: Pool, publicId: string, policy: ChannelPolicy, targets: ChannelTarget[], visited: Set<string>, operationKey?: string) {
    await ensureModelSchema(pool);
    const key = createHash("sha256").update(imageModelDisplayId(publicId) + JSON.stringify({ mode: policy.mode, channels: targets.map(c => ({ key: channelHealthKey(c), enabled: c.enabled, priority: c.priority, weight: c.weight })) })).digest("hex"), tx = await pool.connect();
    try {
        await tx.query("SELECT pg_advisory_lock(hashtextextended($1,0))", ["naumi-channel-select:" + key]);
        const pinned = await readChannelOperationPin(tx, publicId, targets, operationKey);
        const live = pinned ? undefined : await readLiveChannels(tx, publicId, targets);
        const allowed = pinned ? targets.filter(c => c.upstreamId === pinned.upstream_id) : targets.filter(c => c.enabled && channelStillEnabled(live!, c));
        if (pinned && !allowed.length) throw new ModelConfigError("EXECUTION_MISMATCH", "已提交任务的原供应通道不在冻结配置中", 409);
        if (!allowed.length) throw new ModelConfigError("CHANNEL_DISABLED", "本任务原有供应通道已关闭，本次尚未提交上游", 422);
        const counts = new Map((await tx.query("SELECT channel_key,served::text FROM app_model_channel_balances WHERE schedule_key=$1", [key])).rows.map(r => [r.channel_key, BigInt(r.served)]));
        const sorted = allowed.map((c, index) => ({ ...c, index, served: counts.get(channelHealthKey(c)) || BigInt(0) })).filter(c => !visited.has(c.upstreamId)).sort((a, b) => compareChannels(a, b, policy.mode));
        for (const c of sorted) {
            const healthKey = channelHealthKey(c), health = pinned ? undefined : (await tx.query("SELECT failures,open_until IS NOT NULL needs_probe,open_until>now() opened,probe_until>now() probing FROM app_model_channel_health WHERE key=$1", [healthKey])).rows[0];
            if (!pinned && (health?.opened || health?.probing)) {
                continue;
            }
            let probeToken: string | undefined;
            if (!pinned && (health?.needs_probe || health?.failures >= 2)) {
                probeToken = randomUUID();
                if (!(await tx.query("UPDATE app_model_channel_health SET probe_until=now()+($2*interval '1 millisecond'),probe_token=$3 WHERE key=$1 AND (probe_until IS NULL OR probe_until<=now()) AND (open_until IS NULL OR open_until<=now()) RETURNING key", [healthKey, c.scope.connection.timeoutMs + 60000, probeToken])).rows.length)
                    continue;
            }
            const releaseProbe = async (sql: Pick<Pool, "query"> = pool) => { if (probeToken) await sql.query("UPDATE app_model_channel_health SET probe_until=NULL,probe_token=NULL WHERE key=$1 AND probe_token=$2", [healthKey, probeToken]); };
            try {
                const startedAt = (await tx.query("SELECT clock_timestamp()::text AS started_at")).rows[0].started_at as string;
                const conn = c.scope.connection, lease = await createProviderCapacity(pool).acquire({ ...conn, maxConcurrent: conn.maxConcurrent || 1 }, tx);
                try {
                    await tx.query("INSERT INTO app_model_channel_balances(schedule_key,channel_key,served) VALUES($1,$2,1) ON CONFLICT(schedule_key,channel_key) DO UPDATE SET served=app_model_channel_balances.served+1", [key, channelHealthKey(c)]);
                }
                catch (error) {
                    await tx.query("DELETE FROM app_model_provider_leases WHERE token=$1", [lease.token]);
                    throw error;
                }
                return { target: c, recovering: !!pinned, startedAt, async release() { try { await lease.release(); } finally { await releaseProbe(); } } };
            }
            catch (error) {
                await releaseProbe(tx);
                if (!(error instanceof ModelConfigError) || error.code !== "PROVIDER_BUSY")
                    throw error;
            }
        }
        // Defer only when an unvisited candidate remains. Exhaustion must let
        // the caller return its last definite supplier failure, not wait forever.
        // Durable dispatched roots keep Deferred for the low-level capacity wait;
        // non-durable accepted pins retain Pending rather than a false rejection.
        if (sorted.length > 0 && targets[0]?.scope.frozen.modality === "image") throw imageCapacityBusy(pinned ? operationKey : undefined);
        throw new ModelConfigError("PROVIDER_BUSY", "所有兼容供应通道繁忙或暂时停用，本次尚未提交上游", 429);
    }
    finally {
        await tx.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", ["naumi-channel-select:" + key]);
        tx.release();
    }
}
export async function recordChannelOutcome(pool: Pool, c: ChannelTarget, success: boolean, status?: number, detail: ChannelFailure & { startedAt?: string } = {}) {
    const key = channelHealthKey(c), policy = channelFailurePolicy(status, detail);
    if (!success && !policy) return;
    await pool.query(`INSERT INTO app_model_channel_health(key,failures,open_until,last_status,last_success_at,last_failure_kind,last_failure_at)
 VALUES($1,CASE WHEN $2 THEN 0 ELSE 1 END,CASE WHEN NOT $2 AND $4=1 THEN now()+(GREATEST($5::double precision,$6::double precision)*interval '1 millisecond') ELSE NULL END,$3,CASE WHEN $2 THEN now() ELSE NULL END,CASE WHEN $2 THEN NULL ELSE $7 END,CASE WHEN $2 THEN NULL ELSE now() END)
 ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN $2 THEN 0 ELSE app_model_channel_health.failures+1 END,
 open_until=CASE WHEN $2 THEN NULL WHEN app_model_channel_health.failures+1 >= $4 THEN GREATEST(app_model_channel_health.open_until,now()+(GREATEST(LEAST(300000,$5::double precision*power(2,LEAST(4,app_model_channel_health.failures+1-$4))),$6::double precision)*interval '1 millisecond')) ELSE app_model_channel_health.open_until END,
 last_failure_kind=CASE WHEN $2 THEN NULL ELSE $7 END,
 last_failure_at=CASE WHEN $2 THEN app_model_channel_health.last_failure_at ELSE now() END,
 last_status=$3,last_success_at=CASE WHEN $2 THEN now() ELSE app_model_channel_health.last_success_at END,updated_at=now()
 WHERE NOT $2 OR $8::timestamptz IS NULL OR app_model_channel_health.last_failure_at IS NULL OR app_model_channel_health.last_failure_at<=$8::timestamptz`,
    [key, success, status || null, policy?.threshold || 2, policy?.baseMs || 30000, policy?.retryAfterMs || 0, policy?.kind || null, detail.startedAt || null]);
}
