import "server-only";
import {cutoutReceiptCheckpoint,isCutoutReceiptCheckpoint,readSettledCutoutReceipt} from "./cutout-receipt";
import {hasToolImageReceipt,readSettledToolImageReceipt,toolImageReceiptCheckpoint} from "./tool-image-receipt";
import {isSynchronousFailureCheckpoint,settledSynchronousFailure,synchronousFailureCheckpoint} from "./synchronous-failure-receipt";
import {AsyncLocalStorage} from "node:async_hooks";
import {withArtworkCreation} from "../artwork-provenance-context";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {isBanned} from "@/lib/accounts/repository";
import {getUser} from "@/lib/accounts/session";
import {createBillingService,withBillingTransaction} from "./service";
import {BillingError,type FeatureId,type OperationInput,type Tx,type BillingFacts,type BillingQuote,type ConfigSnapshot} from "./types";
import {billingFailure} from "./failure";
import {fingerprint} from "./fingerprint";
import type {ResolvedImageQuality} from "../image-quality";
import {currentModelExecution} from "../model-config/context";
export {exposeAbandonedBillingOperations} from './review-state';
import {currentCreationContext,withFrozenCreation} from "@/lib/saas/creation-scope";
import {claimCreation,finishCreation} from "../saas/creation-writer";
import { TeamError } from "../teams/errors";

type Context = {
    textOutputFailed?: boolean;
    usageIncomplete?: boolean;
    usage?: import("./types").BillingResult["usage"];
    snapshot?:import("./types").ConfigSnapshot;
    quote: SynchronousOperation["quote"];
    feature: FeatureId;
    email: string;
    id: string;
    hash: string;
    operation?: OperationInput;
    quality?: ResolvedImageQuality;
    charge?: number;
    error?: BillingError;
    upstream: "unobserved" | "started" | "succeeded" | "rejected" | "unknown";
    creationId?:string;
    resultCheckpointed?: boolean;
};
const storage = new AsyncLocalStorage<Context>(), service = createBillingService();
export function currentSynchronousBilling() { return storage.getStore(); }
/** Only a fully received text response can prove unusable output. This does not alter upstream acceptance/cost. */
export function recordSynchronousTextFailure() { const c=storage.getStore(); if(c && ["canvas.text-generate","canvas.assistant"].includes(c.feature)) c.textOutputFailed=true; }
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
/** Typed completion used by existing HTTP tools and in-process image steps.
 * stream is only an opaque compatibility pass-through for the existing SSE owner. */
export type SynchronousResult={status:number;body:Record<string,any>|null;stream?:true;replayed?:boolean};
type QuoteFacts=Partial<BillingFacts>&{feature:FeatureId;quantity:number;ratio?:string};
export type SynchronousOperation={
    email:string;operationId:string;path:string;feature:FeatureId;ip?:string|null;entry?:string;
    identity:()=>Promise<{hash:string;confirmation?:{version?:number;credits?:number}}>;
    snapshot:()=>Promise<ConfigSnapshot>;
    quote:(facts:QuoteFacts,snapshot?:ConfigSnapshot)=>Promise<BillingQuote>;
};
function synchronousResult(body:Record<string,any>|null,status=200):SynchronousResult{return {body,status};}
function synchronousFailure(error:unknown):SynchronousResult{const {status,...body}=billingFailure(error);return {status,body};}

/** The actor/scope belongs to the authenticated entry; receipts, reservation and settlement have one owner. */
export async function withSynchronousOperation(input:SynchronousOperation,action:()=>Promise<SynchronousResult>):Promise<SynchronousResult>{
    if(!dbEnabled)return action();
    const email=input.email.toLowerCase(),feature=input.feature,id=`tool-${input.operationId}`;
    try{
        if(!/^[a-zA-Z0-9_-]{8,120}$/.test(input.operationId))throw new BillingError("INVALID_RESULT","计费操作编号无效",400);
        const scope=currentCreationContext();
        if(scope&&scope.actorEmail!==email)throw new TeamError("创作操作者不一致",409);
        if(await isBanned(email,input.ip||""))return synchronousResult({error:"账号已被封禁"},403);
        await ensureSchema();
        const identity=await input.identity();
        const previous = (await getPool().query("SELECT email,feature,quote,state,result_response,request_fingerprint,charged_credits,settlement_result FROM app_billing_operations WHERE id=$1", [id])).rows[0];
        if (previous) {
            let receiptScopeVerified=false;
            const creation=currentCreationContext();
            // UNION of the two keyed lookups; the OR over a LEFT JOIN seq-scanned every creation link.
            if(creation){const old=(await getPool().query(`SELECT scope_kind,tenant_id FROM app_creation_records WHERE actor_email=$2 AND source_kind=$3 AND source_id=$1
              UNION SELECT c.scope_kind,c.tenant_id FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id
              WHERE l.target_type='billing' AND l.target_id=$1 AND l.actor_email=$2 AND c.actor_email=$2`,[id,email.toLowerCase(),feature])).rows;
              if(old.some(r=>r.scope_kind!==creation.scopeKind||r.tenant_id!==creation.tenantId))throw new TeamError('原操作的工作空间已固定，不能跨空间重用',409);
              receiptScopeVerified=old.length>0;
            }
            const expected = fingerprint({ email: email.toLowerCase(), quote: previous.quote, ledgerId: `led-${id}`, fingerprint: identity.hash });
            if (previous.email !== email.toLowerCase() || previous.feature !== feature || previous.request_fingerprint !== expected)
                throw new BillingError("OPERATION_CONFLICT", "该操作编号已用于不同请求", 409);
            const failed = settledSynchronousFailure({ ...previous, id });
            if (failed && receiptScopeVerified) return synchronousResult(failed.body, failed.httpStatus);
            if (failed || isSynchronousFailureCheckpoint(previous.result_response))
                return synchronousResult({ error: "原操作的结果或归属尚待核实，请保留原操作核查", code: "OPERATION_PENDING", operationId: id }, 409);
            if (feature === "tool.cutout" && previous.state === "settled" && (!previous.result_response || isCutoutReceiptCheckpoint(previous.result_response))) {
                const recovered = await readSettledCutoutReceipt(getPool(), { id, email, chargedCredits: Number(previous.charged_credits), checkpoint: previous.result_response });
                if (recovered) return {...synchronousResult({...recovered,replayed:true,user:await getUser(email).catch(()=>null)}),replayed:true};
                return synchronousResult({ error: "原抠图结果尚未恢复，请保留原任务稍后查询", code: "OPERATION_PENDING", operationId: id }, 409);
            }
            if (hasToolImageReceipt(feature) && previous.state === "settled") {
                if (!receiptScopeVerified) return synchronousResult({ error: "原工具操作的归属记录尚未核实，请保留原操作核查", code: "OPERATION_PENDING", operationId: id }, 409);
                const recovered = await readSettledToolImageReceipt(getPool(), { id, email, feature, chargedCredits: Number(previous.charged_credits), checkpoint: previous.result_response });
                if (recovered) return {...synchronousResult({...recovered,replayed:true,user:await getUser(email).catch(()=>null)}),replayed:true};
                return synchronousResult({ error: "原工具结果尚未恢复，请保留原操作核查；不会重复生成", code: "OPERATION_PENDING", operationId: id }, 409);
            }
            if (previous.result_response && previous.state === "settled") {
                return {...synchronousResult(previous.result_response),replayed:true};
            }
            return synchronousResult({ error: previous.state === "settled" ? "扣费已完成，结果需要恢复，请联系管理员" : "任务已提交，请等待结果或联系管理员核查", code: "OPERATION_PENDING", operationId: id, ...(previous.result_response ? { result: previous.result_response } : {}) }, 409);
        }
        const context: Context = { quote:input.quote, feature, email, id, hash:identity.hash, snapshot:await input.snapshot(), upstream:"unobserved" };
        context.creationId=(await claimCreation(feature,id,email)).id||undefined;
        return await storage.run(context, async () => withFrozenCreation(scope?{...scope,creationId:context.creationId}:undefined,async()=>{
            let response: SynchronousResult;
            try {
                response = await withArtworkCreation({ path: input.path, operationId: id, entry: input.entry|| (input.path.startsWith("/api/canvas/") ? "canvas" : "toolbox") }, action);
            }
            catch (error) {
                response = error instanceof BillingError ? synchronousFailure(error) : synchronousResult({ error: "操作失败，请稍后重试" }, 500);
                if (error instanceof BillingError)
                    context.error = error;
            }
            if (context.error) {
                // Only this invocation's accepted reservation can be moved to review.
                // A losing concurrent request must not change the winning operation.
                if(context.operation){
                    const accepted=await getPool().query("UPDATE app_billing_operations SET state='manual',updated_at=now() WHERE id=$1 AND state IN ('reserved','hold','manual') RETURNING id",[id]);
                    if(accepted.rowCount){
                        await finishCreation(context.creationId,email,'needs_review',{summary:'任务已提交，结果及账务需要核查'});
                        return synchronousResult({code:"OPERATION_PENDING",error:"任务已经提交，结果及账务需要核查；不会重复执行",operationId:id},409);
                    }
                }
                // Rejected before any accepted reservation: nothing was executed or charged.
                await finishCreation(context.creationId,email,'failed',{summary:context.error.message});
                return synchronousFailure(context.error);
            }
            // A streaming handler owns completion/settlement. Reading a clone here
            // would buffer the entire reply and delay the first token.
            if (response.stream) return response;
            const payload = response.body;
            let reviewPending = false;
            if (context.operation) {
                // Keep the paid output before any final wallet transaction can fail.
                if ((response.status>=200&&response.status<300) && payload)await checkpointSynchronousResult(payload);
                try {
                if ((response.status>=200&&response.status<300) && !payload?.jobId && context.charge === undefined)
                    await settleSynchronous("工具完成");
                else if (!(response.status>=200&&response.status<300) && context.charge === undefined) {
                    const known = context.textOutputFailed === true || context.upstream === "rejected" || context.upstream === "unobserved";
                    const failureCheckpoint = known ? synchronousFailureCheckpoint(response.status, payload) : undefined;
                    const settled = await withBillingTransaction(getPool(), async tx => {
                        // Failure receipt and final billing outcome commit together.
                        // A saved error alone never converts an UNKNOWN into failure.
                        if (failureCheckpoint) await tx.query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1 AND email=$3", [id, JSON.stringify(failureCheckpoint), email]);
                        return service.settleTx(tx, context.operation!, { state: known ? "failed" : "unknown", items: [] });
                    });
                    reviewPending = settled.state === "hold" || settled.state === "manual";
                    if (known && !settled.replayed) {
                        const failed = settledSynchronousFailure({ id, state: settled.state, charged_credits: settled.charge,
                            settlement_result: { state: "failed", items: [] }, result_response: failureCheckpoint });
                        if (failed) response = synchronousResult(failed.body, failed.httpStatus);
                    }
                    if (!known && reviewPending && context.operation.quote.modelVersion && ["cny-fixed","usage"].includes(context.operation.quote.tariff.pricing.mode)) {
                        await finishCreation(context.creationId,email,'needs_review',{summary:'供应商结果及付费状态需要核查'});
                        return synchronousResult({code:"OPERATION_PENDING",error:"供应商结果及付费状态需要核查，请查询原任务；不会重复提交",operationId:id},409);
                    }
                }
                } catch {
                    await getPool().query("UPDATE app_billing_operations SET state='manual',updated_at=now() WHERE id=$1 AND state IN ('reserved','hold','manual')",[id]);
                    await finishCreation(context.creationId,email,'needs_review',{summary:context.resultCheckpointed?'结果已保留，账务需要核查':'任务结果及账务需要核查'});
                    return synchronousResult({code:"OPERATION_PENDING",error:context.resultCheckpointed?"结果已保留，账务需要核查；请勿重复创建任务":"任务结果及账务需要核查；请保留原操作，不要重复创建任务",operationId:id},409);
                }
            }
            // An accepted async job owns its creation lifecycle from here; writing
            // 'queued' now could regress a job that already advanced.
            if ((response.status>=200&&response.status<300) && payload?.jobId) return response;
            const failedStatus = context.operation ? (reviewPending ? 'needs_review' : 'failed') : context.upstream==='unknown' ? 'needs_review' : 'failed';
            await finishCreation(context.creationId,email,(response.status>=200&&response.status<300)?'succeeded':failedStatus,{
                text:typeof payload?.text==='string'?payload.text:typeof payload?.reply==='string'?payload.reply:typeof payload?.title==='string'?payload.title:undefined,
                artworkIds:[...(Array.isArray(payload?.images)?payload.images.map((a:any)=>a.id||a.artworkId):[]),...(Array.isArray(payload?.artworks)?payload.artworks.map((a:any)=>a.id):[]),payload?.artworkId,payload?.id].filter((v):v is string=>typeof v==='string'),
            });
            return response;
        }));
    }
    catch (error) {
        if(error instanceof TeamError)return synchronousResult({error:error.message},error.status);
        return synchronousFailure(error);
    }
}
/** Persist the original paid result before early wallet settlement. */
export async function checkpointSynchronousResult(payload: unknown) {
    const context = storage.getStore();
    if (!context?.operation) return;
    if (hasToolImageReceipt(context.feature)) {
        const value = payload as { ok?: unknown; id?: unknown; url?: unknown } | null;
        if (value?.ok !== true || typeof value.url !== "string" || !value.url)
            throw new BillingError("INVALID_RESULT", "工具输出尚未确认，请保留原操作核查", 409);
        await checkpointToolArtwork(context, undefined, typeof value.id === "string" ? value.id : undefined);
        return;
    }
    const value = context.feature === "tool.cutout" ? cutoutReceiptCheckpoint(payload) || payload : payload;
    const serialized = JSON.stringify(value);
    if (serialized && serialized.length < 262144) {
        await getPool().query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1 AND email=$3", [context.id, serialized, context.email]);
        context.resultCheckpointed = true;
    }
}
async function checkpointToolArtwork(context: Context, tx?: Tx, expectedId?: string) {
    // Once saved, do not rebind the receipt to later canvas replacements while
    // the same handler is constructing its response or repeating settlement.
    if (context.resultCheckpointed) return;
    const client = tx || getPool();
    const checkpoint = await toolImageReceiptCheckpoint(client, context, expectedId);
    if (!checkpoint) throw new BillingError("INVALID_RESULT", "作品保存尚未确认，结果和账务需要核查；请保留原操作", 409);
    const stored = await client.query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1 AND email=$3 RETURNING id", [context.id, JSON.stringify(checkpoint), context.email]);
    if (stored.rowCount !== 1) throw new BillingError("INVALID_RESULT", "原操作回执保存尚未确认，请保留原操作核查", 409);
    context.resultCheckpointed = true;
}
export async function synchronousCost(quality?: ResolvedImageQuality, resolution = "1K") {
    const context = storage.getStore();
    if (!context)
        return null;
    try {
        context.quality = quality;
        if (!context.operation) {
            const requested=currentModelExecution("image")?.frozen.requestedParameters;
            const q = await context.quote({ feature: context.feature, quantity: 1, quality: quality?.requested || requested?.quality || "medium", resolution:resolution!=="1K"?resolution:requested?.resolution||resolution,ratio:requested?.ratio },context.snapshot);
            const operation = { id: context.id, email: context.email, quote: q, reason: "工具任务预占", ledgerId: `led-${context.id}`, fingerprint: context.hash };
            const reserved = await withBillingTransaction(getPool(), tx => service.reserveTx(tx, operation));
            if (reserved.replayed)
                throw new BillingError("OPERATION_PENDING", "任务已提交，请等待原任务结果", 409);
            context.operation=operation;
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
    // Legacy routes settle before constructing their HTTP response. Close that
    // window centrally, including routes which swallowed addArtworks failures.
    // A caller-owned transaction is reused; never nest a pool checkout in it.
    if (hasToolImageReceipt(context.feature)) await checkpointToolArtwork(context, tx);
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
/** A background continuation of an accepted request (returned jobId) records its
 * own terminal outcome; the HTTP wrapper no longer writes one for it. */
export async function finishSynchronousCreation(artworkIds: string[]) {
    const context = storage.getStore();
    if (context) await finishCreation(context.creationId, context.email, "succeeded", { artworkIds });
}
/** The background continuation failed: settle like a failed synchronous reply. A
 * rejected/unobserved supplier is a known failure; anything else stays reviewable. */
export async function failSynchronousBackground(summary: string) {
    const context = storage.getStore();
    if (!context) return;
    if (!context.operation || context.charge !== undefined) {
        await finishCreation(context.creationId, context.email, context.charge !== undefined ? "needs_review" : "failed", { summary });
        return;
    }
    const known = context.textOutputFailed === true || context.upstream === "rejected" || context.upstream === "unobserved";
    let review = true;
    try {
        const settled = await withBillingTransaction(getPool(), tx => service.settleTx(tx, context.operation!, { state: known ? "failed" : "unknown", items: [] }));
        review = settled.state === "hold" || settled.state === "manual";
    } catch {
        await getPool().query("UPDATE app_billing_operations SET state='manual',updated_at=now() WHERE id=$1 AND state IN ('reserved','hold','manual')", [context.id]).catch(() => {});
    }
    await finishCreation(context.creationId, context.email, review ? "needs_review" : "failed", { summary });
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
    const settled = await withBillingTransaction(getPool(), tx => service.settleTx(tx, context.operation!, { state: "unknown", items: [] }));
    if (settled.state === "hold" || settled.state === "manual") await finishCreation(context.creationId,context.email,'needs_review',{summary:'流式执行中断，已接受请求不会重新提交'});
    else await finishCreation(context.creationId,context.email,'failed',{summary:'流式执行中断，未交付完整结果，未扣费'});
}

/** A fully received but unusable text reply is financially final, unlike an interrupted stream. */
export async function failSynchronousTextStream(body: Record<string, unknown>) {
    const c=storage.getStore();
    if(!c?.operation || !c.textOutputFailed || c.feature!=="canvas.assistant")return null;
    const checkpoint=synchronousFailureCheckpoint(422,body);
    const settled=await withBillingTransaction(getPool(),async tx=>{
        await tx.query("UPDATE app_billing_operations SET result_response=$2::jsonb WHERE id=$1 AND email=$3",[c.id,JSON.stringify(checkpoint),c.email]);
        return service.settleTx(tx,c.operation!,{state:"failed",items:[]});
    });
    c.charge=settled.charge;
    await finishCreation(c.creationId,c.email,"failed",{text:typeof body.partialText==="string"?body.partialText:undefined,summary:"回复未完成，已保留可用文字"});
    return settledSynchronousFailure({id:c.id,state:settled.state,charged_credits:settled.charge,settlement_result:{state:"failed",items:[]},result_response:checkpoint})?.body || null;
}
