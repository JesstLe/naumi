import {acceptedModelVersions} from "../model-config/accepted-context";
import {getModelAdministration} from "../model-config/server";
import { settlementFor } from "./quote";
import { cutoutReceiptCheckpoint, isCutoutReceiptCheckpoint, readSettledCutoutReceipt } from "./cutout-receipt";
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { withArtworkCreation } from "@/lib/artwork-provenance-context";
import { provenanceEntry } from "@/lib/artwork-provenance";
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
import { currentModelExecution } from "@/lib/model-config/context";
import { excludeImportedHistory } from "../staging-history";
import {currentCreationContext,withCreationRequest,withFrozenCreation,type CreationContext} from '../saas/creation-context';
import {startCreation,finishCreation,prepareOriginalCreationInput} from '../saas/creation-writer';
import {TeamError} from '../teams/server';
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
    creationId?:string;
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
        const creation=currentCreationContext();if(creation){
            const text=form.get('userPrompt')||form.get('prompt')||form.get('instruction')||form.get('requirements');if(typeof text==='string')creation.requestText=text.slice(0,50000);
            creation.parameters={...creation.parameters,...Object.fromEntries(['ratio','resolution','quality','count','size','mode'].filter(k=>form.has(k)).map(k=>[k,form.get(k)]))};
        }
        let filePosition=0;
        for (const [key, value] of Array.from(form.entries()).sort(([a], [b]) => a.localeCompare(b))) {
            if (key === "billingVersion" || key === "billingCredits")
                continue;
            if(typeof value==='string')entries.push([key,value]);else {const bytes=Buffer.from(await value.arrayBuffer());entries.push([key,{name:value.name,type:value.type,size:value.size,sha256:createHash('sha256').update(bytes).digest('hex')}]);
                await prepareOriginalCreationInput(bytes,value.type||'application/octet-stream',key==='mask'?'mask':'reference',key==='mask'?0:filePosition++);
            }
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
        if(!currentCreationContext())return await withCreationRequest(request,email,()=>withBillingRequest(request,feature,action));
        if (await isBanned(email, request.headers.get("x-real-ip") || ""))
            return billingJson({ error: "账号已被封禁" }, 403);
        await ensureSchema();
        const id = `tool-${operationIdFor(request)}`, identity = await billingRequestIdentity(request);
        const previous = (await getPool().query("SELECT email,feature,quote,state,result_response,request_fingerprint,charged_credits FROM app_billing_operations WHERE id=$1", [id])).rows[0];
        if (previous) {
            const creation=currentCreationContext();
            if(creation){const old=(await getPool().query(`SELECT DISTINCT c.scope_kind,c.tenant_id FROM app_creation_records c LEFT JOIN app_creation_links l ON l.creation_id=c.id
              WHERE c.actor_email=$2 AND ((c.source_kind=$3 AND c.source_id=$1) OR (l.target_type='billing' AND l.target_id=$1 AND l.actor_email=$2))`,[id,email.toLowerCase(),feature])).rows;
              if(old.some(r=>r.scope_kind!==creation.scopeKind||r.tenant_id!==creation.tenantId))throw new TeamError('原操作的工作空间已固定，不能跨空间重用',409);
            }
            const expected = fingerprint({ email: email.toLowerCase(), quote: previous.quote, ledgerId: `led-${id}`, fingerprint: identity.hash });
            if (previous.email !== email.toLowerCase() || previous.feature !== feature || previous.request_fingerprint !== expected)
                throw new BillingError("OPERATION_CONFLICT", "该操作编号已用于不同请求", 409);
            if (feature === "tool.cutout" && previous.state === "settled" && (!previous.result_response || isCutoutReceiptCheckpoint(previous.result_response))) {
                const recovered = await readSettledCutoutReceipt(getPool(), { id, email, chargedCredits: Number(previous.charged_credits), checkpoint: previous.result_response });
                if (recovered) return billingJson(recovered);
                return billingJson({ error: "原抠图结果尚未恢复，请保留原任务稍后查询", code: "OPERATION_PENDING", operationId: id }, 409);
            }
            if (previous.result_response && previous.state === "settled") {
                if (feature === "canvas.assistant") {
                    if (Array.isArray(previous.result_response.agentFrames)) {
                        const frames = previous.result_response.agentFrames.map((frame: {type:string;data:unknown}) => `event: ${frame.type}\ndata: ${JSON.stringify(frame.data)}\n\n`).join("");
                        return new Response(frames + `event: done\ndata: ${JSON.stringify({ok:true,replayed:true})}\n\n`, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "private, no-store" } });
                    }
                    const events = `event: delta\ndata: ${JSON.stringify({ text: previous.result_response.text || "" })}\n\nevent: done\ndata: ${JSON.stringify({ ok: true, replayed: true })}\n\n`;
                    return new Response(events, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "private, no-store" } });
                }
                return billingJson(previous.result_response);
            }
            return billingJson({ error: previous.state === "settled" ? "扣费已完成，结果需要恢复，请联系管理员" : "任务已提交，请等待结果或联系管理员核查", code: "OPERATION_PENDING", operationId: id, ...(previous.result_response ? { result: previous.result_response } : {}) }, 409);
        }
        const context: Context = { request, feature, email, id, ...identity,snapshot:await (async()=>{const accepted=await acceptedModelVersions(request);return accepted?(await getModelAdministration()).billing.byVersion(accepted.billingVersion):(await getBillingRuntime()).config.current();})(), upstream: "unobserved" };
        const scope=currentCreationContext();context.creationId=(await startCreation(feature,id,email))||undefined;
        return await storage.run(context, async () => withFrozenCreation(scope?{...scope,creationId:context.creationId}:undefined,async()=>{
            let response: Response;
            try {
                response = await withArtworkCreation({ path: new URL(request.url).pathname, operationId: id, entry: provenanceEntry(request.headers.get("x-naumi-client-entry"), new URL(request.url).pathname.startsWith("/api/canvas/") ? "canvas" : "toolbox") }, action);
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
                if (response.ok && payload) await checkpointSynchronousResult(payload);
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
            await finishCreation(context.creationId,email,response.ok?(payload?.jobId?'queued':'succeeded'):context.upstream==='unknown'?'needs_review':'failed',{
                text:typeof payload?.text==='string'?payload.text:typeof payload?.reply==='string'?payload.reply:typeof payload?.title==='string'?payload.title:undefined,
                artworkIds:[...(Array.isArray(payload?.images)?payload.images.map((a:any)=>a.id||a.artworkId):[]),...(Array.isArray(payload?.artworks)?payload.artworks.map((a:any)=>a.id):[]),payload?.artworkId,payload?.id].filter((v):v is string=>typeof v==='string'),
            });
            return response;
        }));
    }
    catch (error) {
        if(error instanceof TeamError)return billingJson({error:error.message},error.status);
        return billingErrorResponse(error);
    }
}
/** Persist a recoverable response before a route performs its early settlement. */
export async function checkpointSynchronousResult(payload: unknown) {
    const context = storage.getStore();
    if (!context?.operation) return;
    const value = context.feature === "tool.cutout" ? cutoutReceiptCheckpoint(payload) || payload : payload;
    const serialized = JSON.stringify(value);
    if (serialized && serialized.length < 262144)
        await getPool().query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1 AND email=$3", [context.id, serialized, context.email]);
}
/** Expired request ownership never permits a supplier resubmission or a refund. */
export async function exposeAbandonedBillingOperations() {
    await getPool().query(`UPDATE app_billing_operations SET state='manual'
      WHERE state='reserved' AND (
        (id LIKE 'tool-%' AND updated_at < now()-make_interval(mins=>GREATEST(30,COALESCE((quote->>'staleReservationMinutes')::int,30))))
        OR EXISTS (SELECT 1 FROM app_canvas_image_tasks c WHERE c.id=app_billing_operations.id AND c.status='needs_attention')
        OR EXISTS (SELECT 1 FROM app_image_jobs j WHERE j.id=app_billing_operations.id AND j.snapshot->>'status'='needs_attention')
        OR EXISTS (SELECT 1 FROM app_video_tasks v WHERE v.id=app_billing_operations.id AND v.status='needs_attention'))
      ${excludeImportedHistory("app_billing_operations")}`);
}
export async function synchronousCost(quality?: ResolvedImageQuality, resolution = "1K") {
    const context = storage.getStore();
    if (!context)
        return null;
    try {
        context.quality = quality;
        if (!context.operation) {
            const requested=currentModelExecution("image")?.frozen.requestedParameters;
            const q = await quoteForRequest(context.request, { feature: context.feature, quantity: 1, quality: quality?.requested || requested?.quality || "medium", resolution:resolution!=="1K"?resolution:requested?.resolution||resolution,ratio:requested?.ratio },context.snapshot);
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
    if (settled.state === "manual" || settled.state === "hold") throw new BillingError("INVALID_RESULT", "结果已保留，供应商费用或实际用量缺失，进入待核对流程", 409);
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

export async function completeSynchronousStream(payload: { text: string; model: string; agentFrames?: {type:string;data:unknown}[] }) {
    const context = storage.getStore();
    if (!context?.operation) return;
    context.upstream = "succeeded";
    try {
        await getPool().query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1", [context.id, JSON.stringify(payload)]);
        await settleSynchronous("画布助手回复完成");
        await finishCreation(context.creationId,context.email,'succeeded',{text:payload.text});
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
    await finishCreation(context.creationId,context.email,'needs_review',{summary:'流式执行中断，已接受请求不会重新提交'});
}
