import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type ImageOperation = {
  /** Caller trust boundary: arbitrary BYOK endpoints are never durable Router. */
  managedGateway?: boolean;
  durable?: boolean;
  quality?: string;
  id: string;
  resolution?: "1K" | "2K" | "4K";
  task?: "draft" | "product" | "detail" | "layout";
  preserveIdentity?: boolean;
  textAccuracy?: "auto" | "required" | "best_effort";
};
const operations = new AsyncLocalStorage<ImageOperation>();

export function isImageGatewayModel(model: string) {
  return /^naumi-image-(auto|economy|standard|premium)$/.test(model);
}

export function imageOperationQuality(fallback: string) { return operations.getStore()?.quality || fallback; }

/** 当前图片操作 id(生图任务为 `<jobId>` 或 `<jobId>:image:<n>`);无操作上下文返回 null。 */
export function currentImageOperationId(): string | null {
  return operations.getStore()?.id ?? null;
}

export class ImageOperationPending extends Error {
  constructor(readonly operationId: string, readonly cause: unknown) {
    super("图片任务正在核查或恢复中，请保留当前任务等待结果");
    this.name = "ImageOperationPending";
  }
}

export async function withImageOperation<T>(model: string, operation: ImageOperation, run: () => Promise<T>): Promise<T> {
  return operations.run(operation, async () => {
    try { return await run(); }
    catch (error) {
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
  if (!isImageGatewayModel(model)) return {};
  const operation = operations.getStore();
  if (!operation) throw new Error("图片网关缺少稳定任务标识");
  const fields = { naumi: {
    operation_id: operation.id,
    resolution: operation.resolution || "1K",
    task: operation.task || "product",
    preserve_identity: !!operation.preserveIdentity,
    text_accuracy: operation.textAccuracy || "auto",
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
