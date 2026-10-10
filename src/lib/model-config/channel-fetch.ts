import "server-only";
import { getPool } from "../db";
import type { ModelExecutionScope } from "./context";
import { executionFetch } from "./clients";
import type { ValidationOptions } from "./schema";
import { claimChannel, recordChannelOutcome } from "./channel-scheduler";
import { beginExecutionStage, finishExecutionStage } from "./execution-audit";
import { ModelConfigError } from "./types";
import { readBounded } from "../supplier-cost/io";
import { completedChannelImage } from "./channel-image-response";
import {prepareChannelText} from "./channel-text-response";

export function channelRoutingFetch(scope: ModelExecutionScope, options: ValidationOptions): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init), path = new URL(request.url).pathname, base = new URL(scope.connection.baseUrl).pathname.replace(/\/$/, "");
    const text=scope.frozen.modality==="text",suffix=path.slice(base.length);
    if (request.method !== "POST" || !path.startsWith(base + "/") || !(text?suffix==="/chat/completions":/^\/images\/(generations|edits)$/.test(suffix))) throw new ModelConfigError("INVALID_REQUEST", "供应通道请求与模型用途不匹配", 400);
    const body = await request.arrayBuffer(), policy = scope.supplierRouting!, visited = new Set<string>(), pool = getPool();
    if(text){const data=JSON.parse(new TextDecoder().decode(body));if(data.messages?.some((m:any)=>Array.isArray(m.content)&&m.content.some((p:any)=>["image_url","input_image"].includes(p.type))))for(const target of policy.targets)if(!target.scope.capabilities.vision)visited.add(target.upstreamId);}
    let attempted = false;
    for (let attempt = 1; attempt <= policy.targets.length; attempt++) {
      request.signal.throwIfAborted();
      let claim;
      try { claim = await claimChannel(pool, scope.frozen.publicModelId, policy.policy, policy.targets, visited); }
      catch (error) {
        if (!(error instanceof ModelConfigError) || error.code !== "PROVIDER_BUSY") throw error;
        if (attempted) break;
        return Response.json({ error: { message: error.message, code: error.code, billing_status: "not_charged" } }, { status: 429 });
      }
      const target = claim.target, active = { ...target.scope, capacityReserved: true, audited: true, supplierRouting: undefined }, conn = active.connection;
      visited.add(target.upstreamId); attempted = true;
      let audit: string | undefined, status: number | undefined, finished = false, receivedImage = false,streaming=false;
      try {
        audit = await beginExecutionStage(active, attempt, `channel:${target.upstreamId}`);
        const headers = new Headers(request.headers); headers.set("authorization", `Bearer ${conn.apiKey}`); headers.delete("content-length");
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(conn.timeoutMs)]);
        const response = await executionFetch(active, options)(conn.baseUrl.replace(/\/$/, "") + path.slice(base.length), { method: "POST", headers, body, signal });
        status = response.status;
        if (response.ok) {
          if(text){
            const prepared=await prepareChannelText(response,async(success,usage,cancelled)=>{try{await finishExecutionStage(audit!,success?"stream-completed":"unknown",status,usage);if(!cancelled&&!request.signal.aborted)await recordChannelOutcome(pool,target,success,status);}finally{await claim.release();}},signal);
            receivedImage=true;
            if(prepared.streaming){streaming=true;return prepared.response;}
            await finishExecutionStage(audit,"response-received",status,prepared.usage);finished=true;await recordChannelOutcome(pool,target,true,status);return prepared.response;
          }
          const complete = await completedChannelImage(response, signal, options);
          receivedImage = true;
          await finishExecutionStage(audit, "response-received", status); finished = true;
          await recordChannelOutcome(pool, target, true, status);
          return complete;
        }
        const raw = await readBounded(response, 1024 * 1024).catch(() => "");
        let receipt: any; try { receipt = JSON.parse(raw); } catch { receipt = null; }
        const definite = receipt?.billing_status === "not_charged" || receipt?.error?.billing_status === "not_charged";
        await finishExecutionStage(audit, definite ? "rejected-not-charged" : "failed-response", status); finished = true;
        if (!["INVALID_REQUEST", "MODEL_INCOMPATIBLE", "PROVIDER_BUSY"].includes(receipt?.error?.code)) await recordChannelOutcome(pool, target, false, status);
      } catch (error) {
        if (!audit || receivedImage) throw error;
        if (!finished) {
          const errorStatus = (error as {status?:number})?.status;
          await finishExecutionStage(audit, status ? "failed-output" : "unknown", status || (typeof errorStatus === "number" ? errorStatus : undefined));
          await recordChannelOutcome(pool, target, false, status);
        } else throw error;
        request.signal.throwIfAborted();
      } finally { if(!streaming)await claim.release(); }
    }
    // Customer settlement is separate from supplier attempts whose cost remains unknown.
    return Response.json({ error: { message: text?"所有可用供应通道均未取得文字结果，请稍后重试":"所有可用供应通道均未取得图片，请稍后重试", code: "SUPPLIER_CHANNELS_EXHAUSTED", type: "naumi_channel_failure" } }, { status: 400 });
  };
}
