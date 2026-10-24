import "server-only";
import { currentObservedCallId } from "../bi/call-scope";
import { createHash, randomUUID } from "node:crypto";
import { dbEnabled } from "@/platform/db/pool";
import { currentModelExecution, type ModelExecutionScope } from "../model-config/context";
import { currentSynchronousBilling } from "../billing/synchronous";
import { currentImageOperationId, noteImageSupplierDispatch } from "../image-gateway";
import { accountIdentity, supplierLedger } from "./runtime";
import { genericReceipt, safeUsage, submittedAPIMartTask } from "./adapters";
import { ReceiptBuffer } from "./receipt-buffer";
import { modelCostPhase } from "./phase";
import { parseReceiptJson } from "./money";
import type { CostContext } from "./types";
import { ModelConfigError } from "../model-config/types";
import { imageSupplierFailure } from "../model-config/supplier-failure";
import { supplierFailureEvidence } from "./failure-evidence";

export async function supplierContext(scope?: ModelExecutionScope | null): Promise<CostContext> {
  const { currentBiContext } = await import("../bi/model-observer");
  const billing = currentSynchronousBilling(), bi = currentBiContext();
  return { biCallId: currentObservedCallId(), operationId: billing?.id || bi?.id || currentImageOperationId() || randomUUID(), userEmail: billing?.email || bi?.email, feature: scope?.frozen.feature || billing?.feature || bi?.operation || "unattributed-call", publicModelId: scope?.frozen.publicModelId, modelVersion: scope?.frozen.modelVersion, billingVersion: scope?.frozen.billingVersion, phase: scope?.costPhase || modelCostPhase(scope?.frozen.binding,scope?.frozen.modality), matchedRuleId: scope?.costRuleId || scope?.routing?.matchedRuleId };
}

/** Instrument the actual HTTP boundary, not SDK+observer+gateway layers simultaneously. */
export function supplierCostFetch(fetcher: typeof fetch, connection: { providerId: string; apiKey?: string; baseUrl: string; wireModel?: string; protocol?: string; credentialRef?: string; costScope?: ModelExecutionScope; phase?: string; observeTaskGets?: boolean; actor?: { userEmail: string; feature: string } }): typeof fetch {
  const dispatch: typeof fetch = async (input, init) => {
    const request = new Request(input, init); request.signal.throwIfAborted();
    // Managed transports mark AFTER their capacity/live gates. Legacy/BYOK
    // fetchers have no lower transport hook, but share the same root anti-replay flag.
    if (request.method === "POST" && !connection.costScope) noteImageSupplierDispatch();
    return fetcher(request);
  };
  return async (input, init) => {
    if (!dbEnabled) return dispatch(input, init);
    const request = new Request(input, init);
    if (request.method !== "POST" && !(connection.observeTaskGets && request.method==='GET')) return dispatch(input, init);
    const scope = connection.costScope || currentModelExecution(), ledger = supplierLedger(), context = await supplierContext(scope);
    context.userEmail ||= connection.actor?.userEmail;
    if(context.feature==='unattributed-call'&&connection.actor)context.feature=connection.actor.feature;
    let model = connection.wireModel;
    if (!model && request.headers.get("content-type")?.includes("application/json")) { const body = await request.clone().json().catch(()=>null); if(typeof body?.model==='string')model=body.model.slice(0,200); }
    if (!model && request.headers.get("content-type")?.includes("multipart/form-data")) { const m=(await request.clone().formData()).get("model"); if(typeof m==='string')model=m.slice(0,200); }
    if (connection.protocol === "router-images" || /^naumi-image-(auto|economy|standard|premium)$/.test(model||"")) {
      const id = currentImageOperationId();
      if (!id) throw new Error("Router cost collection requires stable operation ID");
      // Reliable outbox BEFORE gateway submission; worker imports every durable Router attempt even on timeout.
      await ledger.enqueue(`router:${id}`, "router", { operation: id, context, frozen: scope?.frozen, requestStartedAt: new Date().toISOString() });
      return dispatch(request);
    }
    const accountId = accountIdentity(connection.baseUrl, connection.apiKey || request.headers.get("authorization")?.replace(/^Bearer\s+/i,'') || "no-key");
    await ledger.account({ id: accountId, providerId: connection.providerId, protocol: connection.protocol || "unknown", baseUrl: connection.baseUrl, credentialRef: connection.credentialRef });
    let row: any;
    if(request.method==='GET'){
      const task=decodeURIComponent(new URL(request.url).pathname.split('/').at(-1)||'');
      row=(await ledger.pool.query("SELECT * FROM app_supplier_calls WHERE account_id=$1 AND request_id=$2 ORDER BY started_at LIMIT 1",[accountId,task])).rows[0];
      if(!row)return dispatch(request);
    }else row = await ledger.begin({ ...context, phase:connection.phase||context.phase,attemptId: request.headers.get('idempotency-key')||randomUUID(), accountId, providerId: connection.providerId, model: model || "unknown", procurement: scope?.procurement });
    try {
      const response = await dispatch(request);
      if (!response.body) { await ledger.apply(row.id, genericReceipt({}, response.ok ? "response-received" : "unknown", scope?.procurement)); return response; }
      const stream = response.headers.get("content-type")?.includes("text/event-stream");
      // Consume receipt bytes alongside the caller, without cloning/ buffering entire b64 image outputs.
      const reader = response.body.getReader(), decoder = new TextDecoder();
      const capture = new ReceiptBuffer(), hash = createHash("sha256");
      let pending = "", usage: unknown, id: string | undefined, responseModel: string | undefined, completed = false, finished = false;
      const event = (line: string) => { if (!line.startsWith("data:")) return; const text = line.slice(5).trim(); if (text === "[DONE]") { completed = true; return; } try { const d = parseReceiptJson(text); if (d.usage) usage = safeUsage(d.usage); if (d.id) id = d.id; if (typeof d.model === "string") responseModel = d.model.slice(0,200); } catch { /* incomplete supplier event */ } };
      const finish = async (state: string) => {
        if (finished) return; finished = true;
        let body: any = stream ? { usage, id, model: responseModel } : {};
        if (!stream) { capture.push(decoder.decode()); const raw = capture.result(); if (raw) try { body = parseReceiptJson(raw); } catch { /* missing receipt remains pending */ } }
        const apimartSubmit=!stream&&request.method==='POST'&&['apimart-images','apimart'].includes(connection.protocol||'');
        const receipt = genericReceipt(body, state, apimartSubmit?undefined:scope?.procurement);
        if(apimartSubmit){receipt.delivered=undefined;receipt.outputs=undefined;}
        receipt.requestId ||= response.headers.get("x-request-id") || undefined;
        receipt.evidence = { ...receipt.evidence, responseSha256: hash.digest("hex"), httpStatus: response.status, metadataComplete: stream || capture.result() !== null, ...supplierFailureEvidence(response.status,body) };
        if (!response.ok && !stream && (scope?.frozen.modality === "image" || connection.protocol === "openai-images")) receipt.evidence.upstreamFailure = imageSupplierFailure(response.status, body);
        if (!stream && ["apimart-images", "apimart"].includes(connection.protocol || "") && request.method === "POST") receipt.taskId = submittedAPIMartTask(body) || undefined;
        await ledger.apply(row.id, receipt);
        if (receipt.taskId && ["apimart-images", "apimart"].includes(connection.protocol || "")) await ledger.enqueue(`task:${row.id}`, "task", { callId: row.id }, accountId);
      };
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) { if (stream && pending) event(pending); await finish(response.ok ? stream ? completed ? "stream-completed" : "unknown" : "response-received" : "unknown"); controller.close(); return; }
            hash.update(part.value);
            if (stream) { pending += decoder.decode(part.value, { stream: true }); let end; while ((end = pending.indexOf("\n")) >= 0) { event(pending.slice(0,end)); pending = pending.slice(end+1); } if (pending.length > 131072) pending = ""; }
            else capture.push(decoder.decode(part.value,{stream:true}));
            controller.enqueue(part.value);
          } catch (e) { await finish("unknown"); controller.error(e); }
        },
        async cancel(reason) { await reader.cancel(reason); await finish("unknown"); },
      });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      if (error instanceof ModelConfigError && ["CHANNEL_DISABLED","CONFIG_UNAVAILABLE"].includes(error.code)) {
        const receipt=genericReceipt({billing_status:"not_charged"},"rejected",scope?.procurement);
        await ledger.apply(row.id,{...receipt,source:"local-channel-disabled",evidence:{billing_status:"not_charged",source:"local-channel-disabled"}});
      } else await ledger.apply(row.id, { state: "unknown", status: "pending", source: "transport-unknown", evidence: { source: "transport-unknown", ...supplierFailureEvidence(0,undefined,error) } });
      throw error;
    }
  };
}
