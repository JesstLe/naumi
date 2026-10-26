import "server-only";
import { dbEnabled, getPool } from "../db";
import type { ModelExecutionScope } from "../model-config/context";
import type { ValidationOptions } from "../model-config/schema";
import { completedChannelImage, channelImageFailureStage } from "../model-config/channel-image-response";
import {ModelConfigError} from "../model-config/types";
import { ImageOperationDeferred, currentImageOperationId } from "../image-gateway";
import { imageFailureEvidence } from "../imagegen/failure-evidence";
import { prepareChannelText } from "../model-config/channel-text-response";
import { createHealthRepository } from "./repository";
import { healthTargetKey } from "./targets";
import { classifyHealthFailure } from "./outcomes";
import type { HealthResult } from "./contracts";

export async function observeBusinessHealth(scope: ModelExecutionScope, result: HealthResult) {
  if (!dbEnabled || scope.frozen.feature === "system.model-health" || !scope.connection.credentialRef || scope.connection.providerId === "managed-router") return;
  try {
    await createHealthRepository(getPool()).observe({key:healthTargetKey(scope),provider:{id:scope.connection.providerId} as any,upstream:{model:scope.connection.wireModel} as any},result);
  } catch { /* Monitoring must not break customer delivery or settlement. */ }
}

/** Observe only the concrete execution, never the outer fallback/router facade. */
export function healthObservedFetch(scope: ModelExecutionScope, fetcher: typeof fetch, options: ValidationOptions): typeof fetch {
  if (!dbEnabled || scope.frozen.feature === "system.model-health" || scope.supplierRouting || scope.businessOption && !scope.audited || scope.connection.providerId === "managed-router") return fetcher;
  return async (input, init) => {
    const request = new Request(input, init);
    const image = scope.frozen.modality === "image" && /\/images\/(generations|edits)$/.test(new URL(request.url).pathname);
    const text = scope.frozen.modality === "text" && /\/chat\/completions$/.test(new URL(request.url).pathname);
    if (request.method !== "POST" || !image && !text) return fetcher(request);
    const started = Date.now(); let status: number | null = null;
    try {
      const response = await fetcher(request); status = response.status;
      if (!response.ok) {
        // User-specific parameter rejection and local capacity do not condemn the supplier.
        if (response.headers.get("x-naumi-local-capacity") !== "1" && ([401,402,403,429].includes(status) || status >= 500)) await observeBusinessHealth(scope,classifyHealthFailure(null,status,Date.now()-started));
        return response;
      }
      if (image) {
        const valid = await completedChannelImage(response, request.signal, options);
        await observeBusinessHealth(scope,{success:true,reason:null,status,latencyMs:Date.now()-started});
        return valid;
      }
      const valid = await prepareChannelText(response,async(success,_usage,cancelled)=>{
        if (!cancelled && !request.signal.aborted) await observeBusinessHealth(scope,success?{success:true,reason:null,status,latencyMs:Date.now()-started}:{success:false,reason:"invalid-output",status,latencyMs:Date.now()-started});
      },request.signal);
      if (!valid.streaming) await observeBusinessHealth(scope,{success:true,reason:null,status,latencyMs:Date.now()-started});
      return valid.response;
    } catch (error) {
      if (image && status !== null && status >= 200 && status < 300) {
        // This response already exists; logging cannot authorize another POST.
        // The original exception still propagates, with bounded diagnostics only.
        try { console.error("[image-postaccept]", JSON.stringify({
          operationId: currentImageOperationId(), modelVersion: scope.frozen.modelVersion,
          stage: channelImageFailureStage(error) || "observe-image", status,
          ...imageFailureEvidence(error),
        })); } catch { /* Observability must not break delivery. */ }
      }
      if (!request.signal.aborted && !(error instanceof ImageOperationDeferred) && !(error instanceof ModelConfigError && error.code === "PROVIDER_BUSY")) await observeBusinessHealth(scope,classifyHealthFailure(error,status,Date.now()-started));
      throw error;
    }
  };
}
