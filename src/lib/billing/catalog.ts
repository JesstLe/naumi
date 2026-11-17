import {billingSnapshotFromRow as snapshot} from "./frozen-config";
import "server-only";
import type {ConfigSnapshot} from "./types";
import type { Pool, PoolClient } from "pg";
import { BillingError, type BillingConfig, type ConfigRuntime } from "./types";
import { validateBillingConfig } from "./rules/schema";
import { ensureBillingSchema } from "./schema";
import { fingerprint } from "./fingerprint";
type Deps = {
    pool: Pool;
    ensureSchema: () => Promise<void>;
    initialize: (tx: PoolClient) => Promise<BillingConfig>;
    /** Cross-module guard supplied by the assembly boundary. It runs inside the
     * publish lock, after the version check and before the new version exists;
     * throwing rejects the publish. Replays of an existing operation skip it. */
    checkPublication?: (next: BillingConfig, current: ConfigSnapshot, tx: PoolClient) => Promise<void>;
};
const POINTER = "billing_config_version";
type Row = {
    version: string | number;
    config: unknown;
    actor: string;
    request_fingerprint: string;
};
const selectCurrent = (client: Pick<Pool,"query">) => client.query<Row>("SELECT v.version,v.config,v.actor,v.request_fingerprint FROM app_settings s JOIN app_billing_config_versions v ON v.version::text=s.v WHERE s.k=$1", [POINTER]);
/** Read-only surface for an already initialized catalogue. */
export async function readPublishedBillingConfig(client:Pick<Pool,"query">):Promise<ConfigSnapshot>{
    const row=(await selectCurrent(client)).rows[0];
    if(!row)throw new BillingError("CONFIG_UNAVAILABLE","计费配置暂时不可用，请稍后重试",503);
    return snapshot(row);
}

function validateWrite(id: string, actor: string, reason: string, version: number) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !actor || actor.length > 254 || !reason.trim() || reason.length > 500 || !Number.isSafeInteger(version) || version < 1)
        throw new BillingError("INVALID_CONFIG", "配置发布参数无效", 400);
}
export function createConfigRuntime(deps: Deps): ConfigRuntime {
    // Frozen versions are append-only. The mutable current pointer stays fresh.
    const immutableVersions = new Map<number, Promise<ConfigSnapshot>>();
    const ensure = async () => { await deps.ensureSchema(); await ensureBillingSchema(deps.pool); };
    const locked = async <T>(run: (tx: PoolClient) => Promise<T>) => {
        const tx = await deps.pool.connect();
        try {
            await tx.query("BEGIN");
            await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-billing-config'))");
            const result = await run(tx);
            await tx.query("COMMIT");
            return result;
        }
        catch (error) {
            await tx.query("ROLLBACK");
            throw error;
        }
        finally {
            tx.release();
        }
    };
    const insert = async (tx: PoolClient, id: string, hash: string, actor: string, reason: string, config: BillingConfig) => {
        const { rows } = await tx.query<Row>("INSERT INTO app_billing_config_versions(operation_id,request_fingerprint,actor,reason,config) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *", [id, hash, actor, reason, JSON.stringify(config)]);
        await tx.query("INSERT INTO app_settings(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=now()", [POINTER, String(rows[0].version)]);
        return snapshot(rows[0]);
    };
    const publish = async (input: Parameters<ConfigRuntime["publish"]>[0], restoreTarget?: number) => {
        validateWrite(input.id, input.actor, input.reason, input.expectedVersion);
        const config = validateBillingConfig(input.config);
        const hash = fingerprint({ ...input, config, ...(restoreTarget === undefined ? {} : { restoreTarget }) });
        await ensure();
        return locked(async (tx) => {
            const previous = (await tx.query<Row>("SELECT * FROM app_billing_config_versions WHERE operation_id=$1", [input.id])).rows[0];
            if (previous) {
                if (previous.actor !== input.actor || previous.request_fingerprint !== hash)
                    throw new BillingError("OPERATION_CONFLICT", "该操作编号已用于不同发布", 409);
                return snapshot(previous);
            }
            const current = (await selectCurrent(tx)).rows[0];
            if (!current || Number(current.version) !== input.expectedVersion)
                throw new BillingError("CONFIG_CONFLICT", "配置已被更新，请刷新后重新发布", 409);
            if (deps.checkPublication) await deps.checkPublication(config, snapshot(current), tx);
            if(input.expectedModelVersion!==undefined){const model=(await tx.query("SELECT active_version FROM app_model_config_state WHERE singleton=true FOR SHARE")).rows[0];if(Number(model?.active_version)!==input.expectedModelVersion)throw new BillingError("CONFIG_CONFLICT","模型配置已更新，请刷新后重新设置积分",409);}
            return insert(tx, input.id, hash, input.actor, input.reason, config);
        });
    };
    const initializeCurrent = async (tx: PoolClient) => {
        const row = (await selectCurrent(tx)).rows[0];
        if (row) return snapshot(row);
        if ((await tx.query("SELECT 1 FROM app_settings WHERE k=$1", [POINTER])).rowCount)
            throw new Error("Missing billing version");
        const config = validateBillingConfig(await deps.initialize(tx));
        return insert(tx, "bootstrap", fingerprint(config), "system", "现行规则初始化", config);
    };
    const runtime: ConfigRuntime = {
        async current(tx) {
            try {
                // Task transitions have already ensured schema before BEGIN.
                // Never check out a second connection while retaining their first.
                if (!tx) await ensure();
                const found = (await selectCurrent(tx ?? deps.pool)).rows[0];
                if (found)
                    return snapshot(found);
                if (tx) {
                    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-billing-config'))");
                    return await initializeCurrent(tx);
                }
                return await locked(initializeCurrent);
            }
            catch {
                throw new BillingError("CONFIG_UNAVAILABLE", "计费配置暂时不可用，请稍后重试", 503);
            }
        },
        async byVersion(version) {
            if (!Number.isSafeInteger(version) || version < 1)
                throw new BillingError("INVALID_CONFIG", "配置版本无效", 400);
            await ensure();
            let pending = immutableVersions.get(version);
            if (!pending) {
                pending = deps.pool.query<Row>("SELECT * FROM app_billing_config_versions WHERE version=$1", [version]).then(result => {
                    const row = result.rows[0];
                    if (!row) throw new BillingError("CONFIG_UNAVAILABLE", "配置版本不存在", 404);
                    return snapshot(row);
                }).catch(error => {
                    if (immutableVersions.get(version) === pending) immutableVersions.delete(version);
                    throw error;
                });
                immutableVersions.set(version, pending);
                if (immutableVersions.size > 64) immutableVersions.delete(immutableVersions.keys().next().value!);
            } else {
                immutableVersions.delete(version); immutableVersions.set(version, pending);
            }
            // Never expose the retained value to a caller's local mutations.
            return structuredClone(await pending);
        },
        async history(limit) {
            if (!Number.isInteger(limit) || limit < 1 || limit > 100)
                throw new BillingError("INVALID_CONFIG", "记录数量无效", 400);
            await ensure();
            const { rows } = await deps.pool.query("SELECT version,actor,created_at,reason FROM app_billing_config_versions ORDER BY version DESC LIMIT $1", [limit]);
            return rows.map(row => ({ version: Number(row.version), actor: row.actor, createdAt: row.created_at.toISOString(), reason: row.reason }));
        },
        publish,
        async restore(input) { const target = await runtime.byVersion(input.targetVersion); return publish({ id: input.id, expectedVersion: input.expectedVersion, config: target.config, actor: input.actor, reason: input.reason }, input.targetVersion); },
    };
    return runtime;
}
