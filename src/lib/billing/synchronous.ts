import { settlementFor } from "./quote";
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { dbEnabled, getPool, ensureSchema, isBanned } from "@/lib/db";
import { resolveUserEmail } from "@/lib/admin-auth";
import { quoteForRequest,getBillingRuntime } from "./server";
import { createBillingService, withBillingTransaction } from "./service";
import { BillingError, type FeatureId, type OperationInput, type Tx } from "./types";
import { operationIdFor, assertQuotedVersion, requestQuoteConfirmation, billingErrorResponse } from "./request";
import { billingJson } from "./access";
import { fingerprint } from "./fingerprint";
import type { ResolvedImageQuality } from "@/lib/image-quality";
type Context = {
    usageIncomplete?: boolean;
    usage?: import("./types").BillingResult["usage"];
    snapshot?:import("./types").ConfigSnapshot;
    request: Request;
    feature: FeatureId;
    email: string;
    id: string;
    hash: string;
    confirmation: {
        version?: number;
        credits?: number;
    };
    operation?: OperationInput;
    quality?: ResolvedImageQuality;
    charge?: number;
    error?: BillingError;
    upstream: "unobserved" | "started" | "succeeded" | "rejected" | "unknown";
};
const storage = new AsyncLocalStorage<Context>(), service = createBillingService();
export function currentSynchronousBilling() { return storage.getStore(); }
/** Only supplier receipts count as actual usage; absence remains unknown. */
export function recordBillingUsage(raw: unknown, imageInput = false) {
    const context = storage.getStore();
    if (!context) return;
    const missing = () => { context.usageIncomplete = true; };
    if (!raw || typeof raw !== "object") return missing();
    const u = raw as { prompt_tokens?: unknown; completion_tokens?: unknown; input_tokens?: unknown; output_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown }; input_tokens_details?: { cached_tokens?: unknown; image_tokens?: unknown } };
    const inputTokens = u.prompt_tokens ?? u.input_tokens, outputTokens = u.completion_tokens ?? u.output_tokens;
    const valid = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    if (!valid(inputTokens) || !valid(outputTokens)) return missing();
    const cachedInputTokens = u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0;
    const imageInputTokens = u.input_tokens_details?.image_tokens ?? (u.prompt_tokens_details as { image_tokens?: unknown } | undefined)?.image_tokens ?? 0;
    const price = context.operation?.quote.tariff.pricing;
    if (price?.mode === "usage" && ((price.cachedInputMicrosPerMillion !== undefined && u.prompt_tokens_details?.cached_tokens === undefined && u.input_tokens_details?.cached_tokens === undefined) || (imageInput && price.imageInputMicrosPerMillion !== undefined && u.input_tokens_details?.image_tokens === undefined && (u.prompt_tokens_details as { image_tokens?: unknown } | undefined)?.image_tokens === undefined))) return missing();
    if (!valid(cachedInputTokens) || !valid(imageInputTokens) || cachedInputTokens + imageInputTokens > inputTokens) return missing();
    const old = context.usage;
    context.usage = { inputTokens: (old?.inputTokens || 0) + inputTokens, outputTokens: (old?.outputTokens || 0) + outputTokens, cachedInputTokens: (old?.cachedInputTokens || 0) + cachedInputTokens, imageInputTokens: (old?.imageInputTokens || 0) + imageInputTokens };
}
export function markBillingUpstream(state: Context["upstream"]) { const context = storage.getStore(); if (context)
    context.upstream = state; }
export async function billingRequestIdentity(request: Request) {
    const copy = request.clone(), entries: unknown[] = [];
    let body: Record<string, unknown> = {};
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
        const form = await copy.formData();
        for (const [key, value] of Array.from(form.entries()).sort(([a], [b]) => a.localeCompare(b))) {
            if (key === "billingVersion" || key === "billingCredits")
                continue;
            entries.push([key, typeof value === "string" ? value : { name: value.name, type: value.type, size: value.size, sha256: createHash("sha256").update(Buffer.from(await value.arrayBuffer())).digest("hex") }]);
        }
        body = { billingVersion: form.get("billingVersion") ?? undefined, billingCredits: form.get("billingCredits") ?? undefined };
    }
    else if ((request.headers.get("content-type") || "").includes("json")) {
        body = await copy.json();
        entries.push(Object.fromEntries(Object.entries(body).filter(([k]) => k !== "billingVersion" && k !== "billingCredits").sort(([a], [b]) => a.localeCompare(b))));
    }
    else
        entries.push(await copy.text());
    return { hash: createHash("sha256").update(JSON.stringify([new URL(request.url).pathname, request.headers.get("x-naumi-image-quality"), request.headers.get("x-naumi-text-model"), request.headers.get("x-naumi-feature-model"), entries])).digest("hex"), confirmation: requestQuoteConfirmation(request, body) };
}
export async function withBillingRequest(request: Request, feature: FeatureId, action: () => Promise<Response>): Promise<Response> {
    if (!dbEnabled)
        return action();
    try {
        const email = await resolveUserEmail(request);
        if (!email)
            return billingJson({ error: "请先登录" }, 401);
        if (await isBanned(email, request.headers.get("x-real-ip") || ""))
            return billingJson({ error: "账号已被封禁" }, 403);
        await ensureSchema();
        const id = `tool-${operationIdFor(request)}`, identity = await billingRequestIdentity(request);
        const previous = (await getPool().query("SELECT email,feature,quote,state,result_response,request_fingerprint FROM app_billing_operations WHERE id=$1", [id])).rows[0];
        if (previous) {
            const expected = fingerprint({ email: email.toLowerCase(), quote: previous.quote, ledgerId: `led-${id}`, fingerprint: identity.hash });
            if (previous.email !== email.toLowerCase() || previous.feature !== feature || previous.request_fingerprint !== expected)
                throw new BillingError("OPERATION_CONFLICT", "该操作编号已用于不同请求", 409);
            if (previous.result_response && previous.state === "settled") {
                if (feature === "canvas.assistant") {
                    const events = `event: delta\ndata: ${JSON.stringify({ text: previous.result_response.text || "" })}\n\nevent: done\ndata: ${JSON.stringify({ ok: true, replayed: true })}\n\n`;
                    return new Response(events, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "private, no-store" } });
                }
                return billingJson(previous.result_response);
            }
            return billingJson({ error: previous.state === "settled" ? "扣费已完成，结果需要恢复，请联系管理员" : "任务已提交，请等待结果或联系管理员核查", code: "OPERATION_PENDING", operationId: id, ...(previous.result_response ? { result: previous.result_response } : {}) }, 409);
        }
        const context: Context = { request, feature, email, id, ...identity,snapshot:await(await getBillingRuntime()).config.current(), upstream: "unobserved" };
        return await storage.run(context, async () => {
            let response: Response;
            try {
                response = await action();
            }
            catch (error) {
                response = error instanceof BillingError ? billingErrorResponse(error) : billingJson({ error: "操作失败，请稍后重试" }, 500);
                if (error instanceof BillingError)
                    context.error = error;
            }
            if (context.error) {
                const accepted=await getPool().query("UPDATE app_billing_operations SET state='manual',updated_at=now() WHERE id=$1 AND state IN ('reserved','hold','manual') RETURNING id",[id]);
                if(accepted.rowCount)return billingJson({code:"OPERATION_PENDING",error:"任务已经提交，结果及账务需要核查；不会重复执行",operationId:id},409);
                return billingErrorResponse(context.error);
            }
            // A streaming handler owns completion/settlement. Reading a clone here
            // would buffer the entire reply and delay the first token.
            if (response.headers.get("content-type")?.includes("text/event-stream")) return response;
            const payload = await response.clone().json().catch(() => null);
            if (context.operation) {
                // Keep the paid output before any final wallet transaction can fail.
                if (response.ok && payload && JSON.stringify(payload).length < 262144)
                    await getPool().query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1", [id, JSON.stringify(payload)]);
                try {
                if (response.ok && !payload?.jobId && context.charge === undefined)
                    await settleSynchronous("工具完成");
                else if (!response.ok && context.charge === undefined) {
                    const known = context.feature === "tool.printfile" || context.upstream === "rejected" || context.upstream === "unobserved";
                    await withBillingTransaction(getPool(), tx => service.settleTx(tx, context.operation!, { state: known ? "failed" : "unknown", items: [] }));
                    if (!known && context.operation.quote.modelVersion && ["cny-fixed","usage"].includes(context.operation.quote.tariff.pricing.mode)) return billingJson({code:"OPERATION_PENDING",error:"供应商结果及付费状态需要核查，请查询原任务；不会重复提交",operationId:id},409);
                }
                } catch {
                    await getPool().query("UPDATE app_billing_operations SET state='manual',updated_at=now() WHERE id=$1 AND state IN ('reserved','hold','manual')",[id]);
                    return billingJson({code:"OPERATION_PENDING",error:"结果已保留，账务需要核查；请勿重复创建任务",operationId:id},409);
                }
            }
            return response;
        });
    }
    catch (error) {
        return billingErrorResponse(error);
    }
}
/** Expired request ownership never permits a supplier resubmission or a refund. */
export async function exposeAbandonedBillingOperations() {
    await getPool().query(`UPDATE app_billing_operations SET state='manual'
      WHERE state='reserved' AND (
        (id LIKE 'tool-%' AND updated_at < now()-make_interval(mins=>GREATEST(30,COALESCE((quote->>'staleReservationMinutes')::int,30))))
        OR EXISTS (SELECT 1 FROM app_canvas_image_tasks c WHERE c.id=app_billing_operations.id AND c.status='needs_attention')
        OR EXISTS (SELECT 1 FROM app_image_jobs j WHERE j.id=app_billing_operations.id AND j.snapshot->>'status'='needs_attention')
        OR EXISTS (SELECT 1 FROM app_video_tasks v WHERE v.id=app_billing_operations.id AND v.status='needs_attention'))`);
}
export async function synchronousCost(quality?: ResolvedImageQuality, resolution = "1K") {
    const context = storage.getStore();
    if (!context)
        return null;
    try {
        context.quality = quality;
        if (!context.operation) {
            const q = await quoteForRequest(context.request, { feature: context.feature, quantity: 1, quality: quality?.requested || "medium", resolution },context.snapshot);
            assertQuotedVersion(context.confirmation, q);
            context.operation = { id: context.id, email: context.email, quote: q, reason: "工具任务预占", ledgerId: `led-${context.id}`, fingerprint: context.hash };
            const reserved = await withBillingTransaction(getPool(), tx => service.reserveTx(tx, context.operation!));
            if (reserved.replayed)
                throw new BillingError("OPERATION_CONFLICT", "任务已提交，请等待原任务结果", 409);
        }
        return context.operation.quote.requestedCredits;
    }
    catch (error) {
        if (error instanceof BillingError)
            context.error = error;
        throw error;
    }
}
export async function settleSynchronous(reason: string, quality?: ResolvedImageQuality, tx?: Tx) {
    const context = storage.getStore();
    if (!context?.operation)
        return null;
    const result = { usage: context.usageIncomplete ? undefined : context.usage, state: "succeeded" as const, items: [{ id: context.id, state: "succeeded" as const, executedQuality: quality?.executed || context.quality?.executed || "medium" }] };
    const settled = tx ? await service.settleTx(tx, { ...context.operation, reason }, result) : await withBillingTransaction(getPool(), client => service.settleTx(client, { ...context.operation!, reason }, result));
    context.charge = settled.charge;
    if (settlementFor(context.operation.quote, result).state !== "settle") throw new BillingError("INVALID_RESULT", "结果已保留，供应商实际用量缺失，进入待核对流程", 409);
    return settled.charge;
}
export async function configuredToolCost(resolution = "1K") {
    if (!dbEnabled)
        return 0;
    const cost = await synchronousCost(undefined, resolution);
    if (cost === null)
        throw new BillingError("CONFIG_UNAVAILABLE", "工具计费上下文不可用", 503);
    return cost;
}
export function synchronousChargedCredits(fallback: number) { return storage.getStore()?.charge ?? fallback; }

export async function completeSynchronousStream(payload: { text: string; model: string }) {
    const context = storage.getStore();
    if (!context?.operation) return;
    context.upstream = "succeeded";
    try {
        await getPool().query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1", [context.id, JSON.stringify(payload)]);
        await settleSynchronous("画布助手回复完成");
    } catch {
        await getPool().query("UPDATE app_billing_operations SET state='manual',updated_at=now() WHERE id=$1 AND state IN ('reserved','hold','manual')", [context.id]);
        throw new BillingError("INVALID_RESULT", "回复已保留，账务需要核查；请勿重复提交", 409);
    }
}
export async function failSynchronousStream() {
    const context = storage.getStore();
    if (!context?.operation || context.charge !== undefined || context.upstream === "succeeded") return;
    // A supplier stream that breaks after opening has an uncertain outcome.
    // Keep authorization instead of retrying or charging for an incomplete reply.
    await withBillingTransaction(getPool(), tx => service.settleTx(tx, context.operation!, { state: "unknown", items: [] }));
}
