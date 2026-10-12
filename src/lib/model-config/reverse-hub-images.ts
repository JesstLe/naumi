import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ModelExecutionScope } from "./context";
import type { ValidationOptions } from "./schema";
import { ModelConfigError } from "./types";
import { modelEndpointFetch } from "./transport";
import { mapResolution } from "./resolution-policy";
import { currentImageOperationId, currentImageOperationParameters, ImageOperationPending } from "../image-gateway";
import { currentSynchronousBilling } from "../billing/synchronous";
import { supplierContext } from "../supplier-cost/collect";
import { supplierLedger, accountIdentity } from "../supplier-cost/runtime";
import { readBoundedBytes } from "../supplier-cost/io";
import { preserveOutsideMask } from "../competitor-image";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const RATIOS = new Set(["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"]);
const reject = (message: string): never => { throw new ModelConfigError("INVALID_REQUEST", message, 422); };

/** Hub accepts complete static images <=3MiB each. Normalize before submitting,
 * not after an upstream has started expensive work. Keep originals for masks. */
async function reference(bytes: Buffer) {
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 }).rotate().resize(3072, 3072, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" });
  for (const quality of [95, 85, 72]) {
    const encoded = await image.clone().jpeg({ quality }).toBuffer();
    if (encoded.length <= 3 * 1024 * 1024) return `data:image/jpeg;base64,${encoded.toString("base64")}`;
  }
  return reject("参考图压缩后仍超过即梦接口限制");
}

export async function reverseHubImageRequest(request: Request, scope: ModelExecutionScope) {
  let body: Record<string, any>, files: Buffer[] = [], mask: Buffer | undefined;
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    body = Object.fromEntries(Array.from(form.entries()).filter(([, value]) => typeof value === "string"));
    for (const [key, value] of Array.from(form.entries())) if (typeof value !== "string") {
      if (/^image(?:\[\])?$/.test(key)) files.push(Buffer.from(await value.arrayBuffer()));
      else if (key === "mask") mask = Buffer.from(await value.arrayBuffer());
      else reject("即梦不支持该图片附件字段");
    }
  } else body = await request.json();
  const n = Number(body.n ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 4 || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 16000) reject("图片数量或提示词无效");
  if (body.background === "transparent") reject("即梦未声明透明背景能力");
  if (files.length > Math.min(10, scope.capabilities.maxReferenceImages) || files.some(bytes => bytes.length > 32 * 1024 * 1024)) reject("参考图超过即梦支持范围");
  if (mask && !files[0]) reject("局部编辑需要原图");
  const parameters = { prompt: body.prompt, n, response_format: "url" } as Record<string, any>;
  const selected = currentSynchronousBilling()?.operation?.quote.requestedParameters;
  const operation = currentImageOperationParameters();
  const resolution = operation?.resolution || selected?.resolution || scope.frozen.facts?.requestedResolution || scope.frozen.facts?.resolution;
  const size = String(body.size || "1024x1024").split("x").map(Number);
  let ratio = operation?.ratio || selected?.ratio || scope.frozen.facts?.ratio;
  if (!ratio || ratio === "auto") {
    const meta = files[0] ? await sharp(files[0]).metadata() : undefined;
    const aspect = meta?.width && meta.height ? meta.width / meta.height : size[0] && size[1] ? size[0] / size[1] : 1;
    ratio = [...RATIOS].sort((a, b) => { const value = (r: string) => { const [w, h] = r.split(":").map(Number); return Math.abs(Math.log(w / h / aspect)); }; return value(a) - value(b); })[0];
  }
  if (!RATIOS.has(ratio)) reject("即梦不支持该比例，请选择已开放的比例");
  mapResolution(parameters, scope.parameterMap.resolutionPolicy, resolution, ratio);
  if (parameters.resolution && !["1k", "1.5k", "2k", "4k"].includes(parameters.resolution) || Object.keys(parameters).some(k => !["prompt", "n", "response_format", "resolution", "ratio"].includes(k))) reject("即梦分辨率映射字段或实际值无效");
  parameters.ratio = ratio;
  if (mask) {
    const source = await sharp(files[0]).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = await sharp(mask).resize(source.info.width, source.info.height, { fit: "fill", kernel: "nearest" }).ensureAlpha().raw().toBuffer();
    // This is application-side mask guidance/compositing, NOT native mask support.
    // The first reference marks only editable pixels; pixels outside are copied
    // from the original after the durable supplier result has been retrieved.
    for (let i = 0; i < source.info.width * source.info.height; i++) if (alpha[i * 4 + 3] === 0) {
      source.data[i * 4] = Math.round(source.data[i * 4] * .7 + 255 * .3);
      source.data[i * 4 + 1] = Math.round(source.data[i * 4 + 1] * .7);
      source.data[i * 4 + 2] = Math.round(source.data[i * 4 + 2] * .7 + 255 * .3);
    }
    const guide = await sharp(source.data, { raw: source.info }).png().toBuffer();
    parameters.images = await Promise.all([guide, ...files.slice(1)].map(reference));
    parameters.prompt += "\n第一张参考图中紫色标记区域是唯一需要编辑的区域。按以上要求修改并去掉紫色标记，保持其余构图与内容。";
  } else if (files.length) parameters.images = await Promise.all(files.map(reference));
  if (parameters.prompt.length > 16000 || parameters.images?.reduce((total: number, image: string) => total + Buffer.byteLength(image.split(",")[1], "base64"), 0) > 24 * 1024 * 1024) reject("提示词或参考图合计超过即梦接口限制");
  const model = scope.connection.wireModel;
  if (!/^jimeng\/jimeng-image-[A-Za-z0-9.-]+$/.test(model)) reject("此接入仅支持已登记的即梦图片模型");
  const operationId = currentImageOperationId();
  if (!operationId) reject("即梦调用缺少稳定任务编号");
  const attemptId = hash(`reverse-hub:${scope.frozen.modelVersion}:${scope.connection.providerId}:${model}:${operationId}`);
  return { attemptId, operationId: operationId!, source: files[0], mask, n,
    payload: { operation_id: attemptId, provider: "jimeng", model, operation: files.length ? "image.edit" : "image.generate", parameters },
    requestHash: hash(JSON.stringify({ model, parameters, ...(mask ? { mask: hash(mask), source: hash(files[0]) } : {}) })) };
}

/** POST /tasks has a persisted scope+operation_id uniqueness and payload hash.
 * Replays retrieve the SAME task, including a lost submit response. Once the
 * task ID is saved, recovery only GETs that task and authenticated artifacts. */
export function reverseHubImageFetch(scope: ModelExecutionScope, options: ValidationOptions = {}, overrides?: {
  transport?: typeof fetch; ledger?: ReturnType<typeof supplierLedger>; context?: Awaited<ReturnType<typeof supplierContext>>; pollMs?: number;
}): typeof fetch {
  const c = scope.connection;
  const transport = overrides?.transport || modelEndpointFetch(c.baseUrl, options, { ...c, costDisabled: true, costScope: scope });
  const base = c.baseUrl.replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${c.apiKey}` };
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST" || !/\/images\/(generations|edits)$/.test(new URL(request.url).pathname)) reject("即梦图片适配器只接受生图与编辑");
    const prepared = await reverseHubImageRequest(request, scope);
    const ledger = overrides?.ledger || supplierLedger(), accountId = accountIdentity(base, c.apiKey);
    await ledger.account({ id: accountId, providerId: c.providerId, protocol: c.protocol, baseUrl: base, credentialRef: c.credentialRef });
    const row = await ledger.begin({ ...(overrides?.context || await supplierContext(scope)), attemptId: prepared.attemptId, accountId, providerId: c.providerId, model: c.wireModel, procurement: scope.procurement });
    await ledger.pool.query("UPDATE app_supplier_calls SET parameters=$2::jsonb,billing_unit_id=$3 WHERE id=$1 AND parameters IS NULL", [row.id, JSON.stringify({ requestHash: prepared.requestHash, modelVersion: scope.frozen.modelVersion }), prepared.operationId]);
    const saved = (await ledger.pool.query("SELECT * FROM app_supplier_calls WHERE id=$1", [row.id])).rows[0];
    if (saved.parameters?.requestHash !== prepared.requestHash) throw new ModelConfigError("OPERATION_CONFLICT", "相同即梦任务的请求内容发生变化", 409);
    let taskId: string | undefined = saved.task_id, submitted = !!taskId;
    const json = async (path: string, init: RequestInit = {}) => {
      const response = await transport(`${base}${path}`, { ...init, headers: { ...auth, ...init.headers }, signal: request.signal });
      const raw = await readBoundedBytes(response, 48 * 1024 * 1024);
      let data: any; try { data = JSON.parse(raw.toString("utf8")); } catch { throw Error("reverse-hub-invalid-receipt"); }
      return { response, data };
    };
    try {
      let task: any;
      if (!taskId) {
        submitted = true;
        const result = await json("/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prepared.payload) });
        if (!result.response.ok) {
          // Validation/auth rejection before enqueue is definite. Server/transport
          // errors may hide an accepted task and remain idempotently recoverable.
          if ([400, 401, 403, 404, 422, 429].includes(result.response.status)) {
            await ledger.apply(row.id, { state: "rejected", status: "pending", source: "reverse-hub-submit", evidence: { httpStatus: result.response.status } });
            return Response.json({ error: { message: "即梦接口拒绝当前请求，请核对通道和参数", billing_status: "not_charged" } }, { status: result.response.status });
          }
          throw Error("reverse-hub-submit-unconfirmed");
        }
        task = result.data; taskId = task.id;
        if (typeof taskId !== "string" || !/^[a-f0-9-]{36}$/i.test(taskId)) throw Error("reverse-hub-task-missing");
        await ledger.apply(row.id, { state: "submitted", taskId, status: "pending", source: "reverse-hub-submit", evidence: { operationId: prepared.attemptId } });
      }
      const deadline = Date.now() + Math.min(c.timeoutMs, 240000);
      do {
        if (!task) { const result = await json(`/tasks/${encodeURIComponent(taskId!)}`); if (!result.response.ok) throw Error("reverse-hub-query-unconfirmed"); task = result.data; }
        if (task.id !== taskId || task.operation_id !== prepared.attemptId || task.model !== c.wireModel) throw Error("reverse-hub-task-identity-mismatch");
        await ledger.apply(row.id, { state: task.state, taskId, status: "pending", source: "reverse-hub-task-query", evidence: { state: task.state }, actualModel: task.model });
        if (["failed", "cancelled"].includes(task.state)) return Response.json({ error: { message: "即梦生成任务失败，供应调用记录已保留", billing_status: "task_failed" } }, { status: 422 });
        if (task.state === "succeeded") {
          if (!Array.isArray(task.result?.data) || !task.result.data.length || task.result.data.length > prepared.n) throw Error("reverse-hub-image-missing");
          const data = [];
          for (const item of task.result.data) {
            let bytes: Buffer;
            if (typeof item.artifact === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(item.artifact)) {
              const output = await transport(`${base}/tasks/${encodeURIComponent(taskId!)}/artifacts/${encodeURIComponent(item.artifact)}/content`, { headers: auth, signal: request.signal });
              if (!output.ok) throw Error("reverse-hub-artifact-unavailable");
              bytes = await readBoundedBytes(output, 32 * 1024 * 1024);
            } else if (typeof item.b64_json === "string" && /^[A-Za-z0-9+/\s]+={0,2}$/.test(item.b64_json)) bytes = Buffer.from(item.b64_json, "base64");
            else throw Error("reverse-hub-artifact-missing");
            if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw Error("reverse-hub-image-size-invalid");
            await sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 }).resize(1, 1).raw().toBuffer();
            if (prepared.mask) bytes = await preserveOutsideMask(prepared.source!, bytes, prepared.mask);
            data.push({ b64_json: bytes.toString("base64") });
          }
          await ledger.pool.query("UPDATE app_supplier_calls SET parameters=parameters || $2::jsonb WHERE id=$1", [row.id, JSON.stringify({ acceptedOutputs: data.length })]);
          return Response.json({ created: Math.floor(Date.now() / 1000), data });
        }
        if (["waiting_login", "waiting_client", "reconciling"].includes(task.state)) throw new ImageOperationPending(prepared.operationId, Error(`reverse-hub-${task.state}`));
        await new Promise<void>((resolve, reject) => {
          const done = () => { request.signal.removeEventListener("abort", abort); resolve(); };
          const timer = setTimeout(done, overrides?.pollMs ?? 2000);
          const abort = () => { clearTimeout(timer); reject(request.signal.reason); };
          request.signal.addEventListener("abort", abort, { once: true });
          if (request.signal.aborted) abort();
        });
        task = undefined;
      } while (Date.now() < deadline);
      throw new ImageOperationPending(prepared.operationId, Error("reverse-hub-task-pending"));
    } catch (error) {
      if (!submitted) throw error;
      throw error instanceof ImageOperationPending ? error : new ImageOperationPending(prepared.operationId, error);
    }
  };
}
