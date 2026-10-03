import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { dbEnabled, getPool, ensureSchema, isBanned } from "@/lib/db";
import { resolveUserEmail } from "@/lib/admin-auth";
import { quoteForRequest } from "./server";
import { createBillingService, withBillingTransaction } from "./service";
import { BillingError, type FeatureId, type OperationInput, type Tx } from "./types";
import { operationIdFor, assertQuotedVersion, requestQuoteConfirmation, billingErrorResponse } from "./request";
import { billingJson } from "./access";
import { fingerprint } from "./fingerprint";
import type { ResolvedImageQuality } from "@/lib/image-quality";
type Context = {
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
export function markBillingUpstream(state: Context["upstream"]) { const context = storage.getStore(); if (context)
    context.upstream = state; }
async function requestIdentity(request: Request) {
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
    return { hash: createHash("sha256").update(JSON.stringify([new URL(request.url).pathname, request.headers.get("x-naumi-image-quality"), request.headers.get("x-naumi-text-model"), entries])).digest("hex"), confirmation: requestQuoteConfirmation(request, body) };
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
        const id = `tool-${operationIdFor(request)}`, identity = await requestIdentity(request);
        const previous = (await getPool().query("SELECT email,feature,quote,state,result_response,request_fingerprint FROM app_billing_operations WHERE id=$1", [id])).rows[0];
        if (previous) {
            const expected = fingerprint({ email: email.toLowerCase(), quote: previous.quote, ledgerId: `led-${id}`, fingerprint: identity.hash });
            if (previous.email !== email.toLowerCase() || previous.feature !== feature || previous.request_fingerprint !== expected)
                throw new BillingError("OPERATION_CONFLICT", "该操作编号已用于不同请求", 409);
            if (previous.result_response && previous.state === "settled")
                return billingJson(previous.result_response);
            return billingJson({ error: previous.state === "settled" ? "扣费已完成，结果需要恢复，请联系管理员" : "任务已提交，请等待结果或联系管理员核查", code: "OPERATION_PENDING", operationId: id, ...(previous.result_response ? { result: previous.result_response } : {}) }, 409);
        }
        const context: Context = { request, feature, email, id, ...identity, upstream: "unobserved" };
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
            if (context.error)
                return billingErrorResponse(context.error);
            const payload = await response.clone().json().catch(() => null);
            if (context.operation) {
                if (response.ok && !payload?.jobId && context.charge === undefined)
                    await settleSynchronous("工具完成");
                else if (!response.ok && context.charge === undefined) {
                    const known = context.feature === "tool.printfile" || context.upstream === "rejected" || context.upstream === "unobserved";
                    await withBillingTransaction(getPool(), tx => service.settleTx(tx, context.operation!, { state: known ? "failed" : "unknown", items: [] }));
                }
                if (response.ok && payload && JSON.stringify(payload).length < 262144)
                    await getPool().query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1", [id, JSON.stringify(payload)]);
            }
            return response;
        });
    }
    catch (error) {
        return billingErrorResponse(error);
    }
}
export async function synchronousCost(quality?: ResolvedImageQuality, resolution = "1K") {
    const context = storage.getStore();
    if (!context)
        return null;
    try {
        context.quality = quality;
        if (!context.operation) {
            const q = await quoteForRequest(context.request, { feature: context.feature, quantity: 1, quality: quality?.requested || "medium", resolution });
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
    const result = { state: "succeeded" as const, items: [{ id: context.id, state: "succeeded" as const, executedQuality: quality?.executed || context.quality?.executed || "medium" }] };
    const settled = tx ? await service.settleTx(tx, { ...context.operation, reason }, result) : await withBillingTransaction(getPool(), client => service.settleTx(client, { ...context.operation!, reason }, result));
    context.charge = settled.charge;
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
