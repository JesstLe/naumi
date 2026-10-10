import "server-only";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { ChannelPolicy } from "./channel-policy";
import type { ModelExecutionScope } from "./context";
import { ensureModelSchema } from "./schema";
import { createProviderCapacity } from "./capacity";
import { ModelConfigError } from "./types";
import { imageModelDisplayId } from "../image-model-routing";
export type ChannelTarget = ChannelPolicy["channels"][number] & {
    scope: ModelExecutionScope;
};
export function supplierChannelKey(c: {
    providerId: string;
    baseUrl: string;
    wireModel: string;
}) { return createHash("sha256").update(JSON.stringify([c.providerId, c.baseUrl, imageModelDisplayId(c.wireModel)])).digest("hex"); }
export function channelHealthKey(c: ChannelTarget) { return supplierChannelKey(c.scope.connection); }
export async function channelHealthSummary(pool: Pool, config: import("./types").ModelConfig) { const keys = config.upstreamModels.map(u => { const p = config.providers.find(p => p.id === u.providerId)!; return { id: u.id, key: supplierChannelKey({ providerId: p.id, baseUrl: p.baseUrl, wireModel: u.model }) }; }); const rows = (await pool.query("SELECT key,failures,last_status,last_success_at,open_until,open_until>now() opened,probe_until>now() probing FROM app_model_channel_health WHERE key=ANY($1)", [keys.map(k => k.key)])).rows; return Object.fromEntries(keys.map(k => { const r = rows.find(r => r.key === k.key); return [k.id, { state: r?.opened ? "cooldown" : r?.probing ? "recovering" : r?.last_success_at ? "available" : r ? "failed" : "unobserved", failures: r?.failures || 0, retryAt: r?.open_until?.toISOString() || null, lastStatus: r?.last_status || null }]; })); }
export function compareChannels(a: {
    priority: number;
    weight: number;
    served: bigint;
    index: number;
}, b: typeof a, mode: ChannelPolicy["mode"]) { if (a.priority !== b.priority)
    return a.priority - b.priority; if (mode === "priority")
    return a.index - b.index; const x = (a.served + BigInt(1)) * BigInt(b.weight), y = (b.served + BigInt(1)) * BigInt(a.weight); return x < y ? -1 : x > y ? 1 : a.index - b.index; }
export async function claimChannel(pool: Pool, publicId: string, policy: ChannelPolicy, targets: ChannelTarget[], visited: Set<string>) {
    await ensureModelSchema(pool);
    const key = createHash("sha256").update(imageModelDisplayId(publicId) + JSON.stringify({ mode: policy.mode, channels: targets.map(c => ({ key: channelHealthKey(c), enabled: c.enabled, priority: c.priority, weight: c.weight })) })).digest("hex"), tx = await pool.connect();
    try {
        await tx.query("SELECT pg_advisory_lock(hashtextextended($1,0))", ["naumi-channel-select:" + key]);
        const counts = new Map((await tx.query("SELECT channel_key,served::text FROM app_model_channel_balances WHERE schedule_key=$1", [key])).rows.map(r => [r.channel_key, BigInt(r.served)]));
        const sorted = targets.map((c, index) => ({ ...c, index, served: counts.get(channelHealthKey(c)) || BigInt(0) })).filter(c => c.enabled && !visited.has(c.upstreamId)).sort((a, b) => compareChannels(a, b, policy.mode));
        for (const c of sorted) {
            const healthKey = channelHealthKey(c), health = (await tx.query("SELECT failures,open_until>now() opened,probe_until>now() probing FROM app_model_channel_health WHERE key=$1", [healthKey])).rows[0];
            if (health?.opened || health?.probing)
                continue;
            let probe = false;
            if (health?.failures >= 3) {
                probe = !!(await tx.query("UPDATE app_model_channel_health SET probe_until=now()+($2*interval '1 millisecond') WHERE key=$1 AND (probe_until IS NULL OR probe_until<=now()) AND (open_until IS NULL OR open_until<=now()) RETURNING key", [healthKey, c.scope.connection.timeoutMs + 60000])).rows.length;
                if (!probe)
                    continue;
            }
            try {
                const conn = c.scope.connection, lease = await createProviderCapacity(pool).acquire({ ...conn, maxConcurrent: conn.maxConcurrent || 1 }, tx);
                try {
                    await tx.query("INSERT INTO app_model_channel_balances(schedule_key,channel_key,served) VALUES($1,$2,1) ON CONFLICT(schedule_key,channel_key) DO UPDATE SET served=app_model_channel_balances.served+1", [key, channelHealthKey(c)]);
                }
                catch (error) {
                    await tx.query("DELETE FROM app_model_provider_leases WHERE token=$1", [lease.token]);
                    throw error;
                }
                return { target: c, release: lease.release };
            }
            catch (error) {
                if (probe)
                    await tx.query("UPDATE app_model_channel_health SET probe_until=NULL WHERE key=$1", [healthKey]);
                if (!(error instanceof ModelConfigError) || error.code !== "PROVIDER_BUSY")
                    throw error;
            }
        }
        throw new ModelConfigError("PROVIDER_BUSY", "所有兼容供应通道繁忙或暂时停用，本次尚未提交上游", 429);
    }
    finally {
        await tx.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", ["naumi-channel-select:" + key]);
        tx.release();
    }
}
export async function recordChannelOutcome(pool: Pool, c: ChannelTarget, success: boolean, status?: number) {
    const key = channelHealthKey(c);
    await pool.query(`INSERT INTO app_model_channel_health(key,failures,open_until,last_status,last_success_at) VALUES($1,CASE WHEN $2 THEN 0 ELSE 1 END,NULL,$3,CASE WHEN $2 THEN now() ELSE NULL END)
 ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN $2 THEN 0 ELSE app_model_channel_health.failures+1 END,open_until=CASE WHEN $2 THEN NULL WHEN app_model_channel_health.failures+1>=3 THEN now()+interval '60 seconds' ELSE NULL END,probe_until=NULL,last_status=$3,last_success_at=CASE WHEN $2 THEN now() ELSE app_model_channel_health.last_success_at END,updated_at=now()`, [key, success, status || null]);
}
