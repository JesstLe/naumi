import "server-only";
import { getPool } from "../db";
import type { ModelExecutionScope } from "./context";
import { executionFetch } from "./clients";
import type { ValidationOptions } from "./schema";
import { claimChannel, recordChannelOutcome } from "./channel-scheduler";
import { beginExecutionStage, finishExecutionStage } from "./execution-audit";
import { ModelConfigError } from "./types";
import { readBounded } from "../supplier-cost/io";
export function channelRoutingFetch(scope: ModelExecutionScope, options: ValidationOptions): typeof fetch {
    return async (input, init) => {
        const request = new Request(input, init), path = new URL(request.url).pathname, base = new URL(scope.connection.baseUrl).pathname.replace(/\/$/, "");
        if (request.method !== "POST" || !path.startsWith(base + "/") || !/^\/images\/(generations|edits)$/.test(path.slice(base.length)))
            throw new ModelConfigError("INVALID_REQUEST", "供应通道仅接受图片生成和编辑", 400);
        const body = await request.arrayBuffer(), policy = scope.supplierRouting!, visited = new Set<string>(), pool = getPool();
        for (let attempt = 1; attempt <= policy.targets.length; attempt++) {
            let claim;
            try {
                claim = await claimChannel(pool, scope.frozen.publicModelId, policy.policy, policy.targets, visited);
            }
            catch (error) {
                if (error instanceof ModelConfigError && error.code === "PROVIDER_BUSY")
                    return Response.json({ error: { message: error.message, code: error.code, billing_status: "not_charged" } }, { status: 429 });
                throw error;
            }
            const target = claim.target, active = { ...target.scope, capacityReserved: true, audited: true, supplierRouting: undefined }, conn = active.connection;
            visited.add(target.upstreamId);
            let audit: string | undefined;
            try {
                audit = await beginExecutionStage(active, attempt, `channel:${target.upstreamId}`);
                const headers = new Headers(request.headers);
                headers.set("authorization", `Bearer ${conn.apiKey}`);
                headers.delete("content-length");
                const response = await executionFetch(active, options)(conn.baseUrl.replace(/\/$/, "") + path.slice(base.length), { method: "POST", headers, body, signal: request.signal });
                if (response.ok) {
                    if (!response.body) {
                        await finishExecutionStage(audit, "response-received", response.status);
                        await recordChannelOutcome(pool, target, true, response.status);
                        await claim.release();
                        return response;
                    }
                    const reader = response.body.getReader();
                    let finalized = false;
                    const done = async (success: boolean) => { if (finalized)
                        return; finalized = true; try {
                        await finishExecutionStage(audit!, success ? "response-received" : "unknown", response.status);
                        await recordChannelOutcome(pool, target, success, response.status);
                    }
                    finally {
                        await claim.release();
                    } };
                    return new Response(new ReadableStream<Uint8Array>({ async pull(controller) { try {
                            const part = await reader.read();
                            if (part.done) {
                                await done(true);
                                controller.close();
                            }
                            else
                                controller.enqueue(part.value);
                        }
                        catch (e) {
                            await done(false);
                            controller.error(e);
                        } }, async cancel(reason) { try {
                            await reader.cancel(reason);
                        }
                        finally {
                            await done(false);
                        } } }), { status: response.status, headers: response.headers });
                }
                const raw = await readBounded(response, 1024 * 1024).catch(() => ""), receipt = (() => { try {
                    return JSON.parse(raw);
                }
                catch {
                    return null;
                } })();
                const definite = [400, 401, 403, 404, 422, 429].includes(response.status) && (receipt?.billing_status === "not_charged" || receipt?.error?.billing_status === "not_charged");
                await finishExecutionStage(audit, definite ? "rejected-not-charged" : "unknown", response.status);
                if ([401, 403, 404, 429].includes(response.status) || response.status >= 500)
                    await recordChannelOutcome(pool, target, false, response.status);
                await claim.release();
                if (definite && attempt < policy.targets.length)
                    continue;
                return definite ? new Response(raw, { status: response.status, headers: response.headers }) : Response.json({ error: { message: "供应商接单状态未知，已保留原任务，不会重复提交", code: "UPSTREAM_BILLING_UNKNOWN" } }, { status: 409 });
            }
            catch (error) {
                try {
                    if (audit)
                        await finishExecutionStage(audit, "unknown");
                    await recordChannelOutcome(pool, target, false);
                }
                finally {
                    await claim.release();
                }
                throw error;
            }
        }
        throw new ModelConfigError("ROUTE_EXHAUSTED", "兼容供应通道尝试结束", 503);
    };
}
