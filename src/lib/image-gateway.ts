import { queryableImageScope } from "./model-config/apimart-image-policy";
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { currentModelExecution } from "./model-config/context";
import { ModelConfigError } from "./model-config/types";
import { setTimeout as sleep } from "node:timers/promises";

type ImageOperation = {
  /** Caller trust boundary: arbitrary BYOK endpoints are never durable Router. */
  managedGateway?: boolean;
  durable?: boolean;
  /** Shared across fan-out: one possible paid dispatch removes the permission
   * to requeue the whole root operation as never submitted. */
  dispatchState?: { attempted:boolean };
  quality?: string;
  id: string;
  resolution?: "1K" | "2K" | "4K";
  ratio?: string;
  task?: "draft" | "product" | "detail" | "layout";
  preserveIdentity?: boolean;
  textAccuracy?: "auto" | "required" | "best_effort";
};
const operations = new AsyncLocalStorage<ImageOperation>();

export function isImageGatewayModel(model: string) {
  const scope = currentModelExecution("image");
  const hub = scope && !scope.supplierRouting && queryableImageScope(scope) || scope?.supplierRouting?.targets.every(t => queryableImageScope(t.scope));
  if ((scope?.connection.protocol === "router-images" || scope?.imagePreset || hub) && [scope!.frozen.publicModelId, scope!.connection.wireModel].includes(model)) return true;
  return /^naumi-image-(auto|economy|standard|premium)$/.test(model);
}

export function imageOperationQuality(fallback: string) { return operations.getStore()?.quality || fallback; }

/** 当前图片操作 id(生图任务为 `<jobId>` 或 `<jobId>:image:<n>`);无操作上下文返回 null。 */
export function currentImageOperationId(): string | null {
  return operations.getStore()?.id ?? null;
}
export function currentImageOperationParameters() { const p=operations.getStore();return p?{resolution:p.resolution,ratio:p.ratio,quality:p.quality}:undefined; }

export class ImageOperationPending extends Error {
  constructor(readonly operationId: string, readonly cause: unknown) {
    super("本次未取得图片，请重试");
    this.name = "ImageOperationPending";
  }
}
/** A local capacity claim failed BEFORE this transport dispatched. This is not
 * supplier acceptance evidence. The shared root dispatch flag still decides
 * whether the whole paid operation may return to the existing DB queue. */
export class ImageOperationDeferred extends ImageOperationPending {
  constructor(readonly operationId: string) {
    super(operationId, new Error("local-capacity-not-dispatched"));
    this.name = "ImageOperationDeferred";
  }
}
export function imageCapacityBusy(): ModelConfigError | ImageOperationDeferred {
  const operation = operations.getStore();
  return operation?.durable
    ? new ImageOperationDeferred(operation.id)
    : new ModelConfigError("PROVIDER_BUSY", "当前模型通道繁忙，本次未提交上游", 429);
}
/** A supplier explicitly paused for review is not an actively generating task. */
export class ImageOperationReview extends ImageOperationPending {
  readonly reviewRequired=true;
  constructor(operationId:string,readonly reviewCode:"reconciling"|"waiting_login"|"waiting_client"){
    super(operationId,Error(`reverse-hub-${reviewCode}`));this.name="ImageOperationReview";
  }
}
export function noteImageSupplierDispatch(){const operation=operations.getStore();if(operation?.dispatchState)operation.dispatchState.attempted=true;}
export function imageSupplierWasDispatched(){return operations.getStore()?.dispatchState?.attempted === true;}
/** Only leased, already-started work waits in process. Never retries a POST. */
export async function waitForImageCapacity(signal:AbortSignal){await sleep(250,undefined,{signal});}

/** SDK fetch failures wrap local adapter signals in APIConnectionError.cause.
 * Recover only our typed signal for this exact paid operation (or its fan-out
 * image); names, supplier JSON and unrelated task IDs are never trusted. */
function originalImageOperationSignal(error: unknown, operationId: string) {
  const seen = new Set<object>();
  let value = error, pending: ImageOperationPending | ImageOperationDeferred | undefined;
  for (let depth = 0; depth < 8 && value instanceof Error && !seen.has(value); depth++) {
    seen.add(value);
    if ((value instanceof ImageOperationPending || value instanceof ImageOperationDeferred) && (value.operationId === operationId ||
      value.operationId.startsWith(`${operationId}:image:`) && /^\d+$/.test(value.operationId.slice(operationId.length + 7)))) {
      if (value instanceof ImageOperationReview || value instanceof ImageOperationDeferred) return value;
      pending ||= value;
    }
    value = value.cause;
  }
  return pending;
}

export async function withImageOperation<T>(model: string, operation: ImageOperation, run: () => Promise<T>): Promise<T> {
  const dispatchState = operation.dispatchState || operations.getStore()?.dispatchState || {attempted:false};
  return operations.run({...operation,dispatchState}, async () => {
    try { return await run(); }
    catch (error) {
      const signal = originalImageOperationSignal(error, operation.id);
      if (signal instanceof ImageOperationDeferred && dispatchState.attempted) throw new ImageOperationPending(operation.id, signal);
      if (signal) throw signal;
      if (error instanceof ImageOperationDeferred) throw new ImageOperationPending(operation.id,error);
      if (error instanceof ImageOperationPending) throw error;
      const status = (error as { status?: number } | null)?.status;
      // 504 is Router's accepted/uncertain contract; transport failures and
      // gateway 5xx cannot prove that a paid operation was rejected.
      if ((operation.durable || isImageGatewayModel(model)) && (status == null || status === 408 || status === 409 || status >= 500)) {
        throw new ImageOperationPending(operation.id, error);
      }
      throw error;
    }
  });
}

/** New API forwards extra_fields in JSON and as one JSON-valued form field. */
export function imageGatewayFields(model: string, multipart = false) {
  const operation = operations.getStore();
  if (operation?.managedGateway === false) return {};
  if (!isImageGatewayModel(model)) return {};
  if (!operation) throw new Error("图片网关缺少稳定任务标识");
  const frozenFacts = currentModelExecution("image")?.frozen.routerDigest ? currentModelExecution("image")!.frozen.facts : undefined;
  const fields = { naumi: {
    ...(currentModelExecution("image")?.frozen.routerDigest ? { config_digest: currentModelExecution("image")!.frozen.routerDigest, native_resolution: !!currentModelExecution("image")!.frozen.facts?.nativeResolution } : {}),
    operation_id: operation.id,
    resolution: currentModelExecution("image")?.frozen.routerDigest ? currentModelExecution("image")!.frozen.facts?.resolution || "1K" : operation.resolution || "1K",
    task: operation.task || "product",
    preserve_identity: !!operation.preserveIdentity,
    // Managed routing already checked the frozen task requirements. Re-parsing
    // the compiled prompt would mistake instructions such as “不要文字” for a
    // new text requirement, rejecting a model that passed the original check.
    text_accuracy: operation.textAccuracy || (frozenFacts ? frozenFacts.needsText ? "required" : "best_effort" : "auto"),
  } };
  return { extra_fields: multipart ? JSON.stringify(fields) : fields };
}

export function appendImageGatewayFields(form: FormData, model: string) {
  const fields = imageGatewayFields(model, true);
  if (fields.extra_fields) form.append("extra_fields", String(fields.extra_fields));
}

/** Each fan-out image is a separate paid operation, stable across job recovery. */
export function withImageIndex<T>(model: string, index: number, run: () => Promise<T>) {
  const operation = operations.getStore();
  if (!operation) return run();
  return withImageOperation(model, { ...operation, id: `${operation.id}:image:${index}` }, run);
}
