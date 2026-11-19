import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { getPool } from "@/platform/db/pool";
import { withTransaction } from "@/platform/db/transaction";
import { listArtworksByIds } from "@/lib/artworks/repository";
import { canReadMedia, ensureMediaSchema } from "@/lib/media-assets";
import { registerPrivateMediaTx } from "@/lib/media-assets/writer";
import { readManagedObject } from "@/lib/object-storage/managed-read";
import { privateMedia, storageDriver, storageKeyFromManagedUrl, writeStoredObject } from "@/lib/object-storage/runtime";
import { currentCreationContext } from "@/lib/saas/creation-scope";
import { assertCreationProjectInput } from "@/lib/saas/creation-access";
import { creationLinkTx } from "@/lib/saas/creation-writer";
import { createCredentialReader } from "@/lib/model-config/credential-reader";
import { readPublishedModelSnapshot } from "@/lib/model-config/published";
import { getBillingRuntime, meteringFor } from "@/lib/billing/runtime";
import { quote } from "@/lib/billing/quote";
import { BillingError } from "@/lib/billing/types";
import { configuredToolCost, currentSynchronousBilling, markBillingUpstream, withSynchronousOperation } from "@/lib/billing/synchronous-operation";
import { accountIdentity, supplierLedger } from "@/lib/supplier-cost/runtime";
import { apimartTask } from "@/lib/supplier-cost/adapters";
import { canvasArtworkProjectKey } from "./project-catalog";
import { createLayerProvider, downloadLayerStack, LayerProviderHttpError, LayerProviderReceiptError } from "./layer-decomposition-provider";
import { encodeLayeredPsd } from "./layered-psd";

const FEATURE = "canvas.layered-psd";
const MODEL = "seedream-5-0-pro";
const PATH = "/api/canvas/layered-psd";
export const PSD_TYPE = "image/vnd.adobe.photoshop";
export const MAX_PSD_BYTES = 110 * 1024 * 1024;
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

async function channel() {
  if (!privateMedia) throw new BillingError("CONFIG_UNAVAILABLE", "智能拆层需要私有媒体存储", 503);
  const snapshot = await readPublishedModelSnapshot();
  const upstream = snapshot.config.upstreamModels.find(item => item.id === `apib:${MODEL}` && item.enabled);
  const provider = snapshot.config.providers.find(item => item.id === upstream?.providerId && item.enabled);
  if (!provider?.credentialRef || provider.protocol !== "apimart-images" || new URL(provider.baseUrl).origin !== "https://api.apib.ai") {
    throw new BillingError("CONFIG_UNAVAILABLE", "智能拆层暂不可用", 503);
  }
  return { version: snapshot.version, provider: { ...provider, credentialRef: provider.credentialRef } };
}

export async function layerPrice() {
  const channelPin = await channel();
  const billing = await (await getBillingRuntime()).config.current();
  const pricing = billing.config.features[FEATURE];
  // Independent tariff. Never reuse the ordinary image price or silently start
  // a supplier operation while the administrator has not published this tool.
  if (!pricing?.enabled || pricing.unit !== "task" || pricing.pricing.mode !== "fixed"
      || pricing.rules.length || pricing.settlement.unknown !== "hold" || pricing.settlement.reserveBps !== 10_000 || pricing.settlement.failureBps !== 0
      || !await meteringFor(billing)) {
    throw new BillingError("CONFIG_UNAVAILABLE", "智能拆层尚未开放", 503);
  }
  const frozen = quote(billing, { feature: FEATURE, quantity: 1, quality: "medium", resolution: "1K", paidFen: 0,
    providerId: channelPin.provider.id, modelId: MODEL, userGroup: "default", byok: false, metered: true });
  return { channelPin, billing, frozen };
}

async function ownedCanvasSource(email: string, id: string) {
  const scope = currentCreationContext();
  if (!scope?.parentContext) throw new BillingError("INVALID_RESULT", "缺少当前画布项目", 400);
  const [source] = await listArtworksByIds(email, [id]);
  const key = source && storageKeyFromManagedUrl(source.image);
  if (!source || !key || source.videoUrl || source.category === "audio" || source.status !== "completed"
      || source.source === "workflow-decoration" || source.source === "workflow-placeholder") {
    throw new BillingError("INVALID_RESULT", "图片不存在或无权访问", 404);
  }
  const parents = new Map([[source.id, source]]);
  let parentId = source.parentId;
  while (parentId && !parents.has(parentId) && parents.size < 64) {
    const [parent] = await listArtworksByIds(email, [parentId]);
    if (!parent) break;
    parents.set(parent.id, parent);
    parentId = parent.parentId;
  }
  const project = canvasArtworkProjectKey(source, parents);
  if (project !== scope.parentContext || !await canReadMedia(key, email)) throw new BillingError("INVALID_RESULT", "图片不属于当前画布", 404);
  await assertCreationProjectInput(email, project, undefined, true);
  return { source, project, key };
}

export async function runLayerDecomposition(email: string, input: {
  operationId: string; artworkId: string; sourceImage: string; version: number; credits: number;
}, transport?: typeof fetch) {
  const { source, project, key } = await ownedCanvasSource(email, input.artworkId);
  if (storageKeyFromManagedUrl(input.sourceImage) !== key) {
    throw new BillingError("OPERATION_CONFLICT", "图片已更新，请重新打开拆层", 409);
  }
  const hash = sha256(JSON.stringify([PATH, source.id, source.image, project]));
  let price: Awaited<ReturnType<typeof layerPrice>>;
  return withSynchronousOperation({ email, operationId: input.operationId, path: PATH, feature: FEATURE,
    identity: async () => ({ hash }), snapshot: async () => {
      price = await layerPrice();
      if (price.billing.version !== input.version || price.frozen.authorizedCredits !== input.credits) {
        throw new BillingError("OPERATION_CONFLICT", "拆层价格已更新，请刷新报价后重新确认", 409);
      }
      return price.billing;
    }, quote: async () => price.frozen }, async () => {
    const signal = AbortSignal.timeout(235_000);
    const image = await readManagedObject(source.image, 16 * 1024 * 1024, signal);
    const prepared = await sharp(image.bytes, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    if (prepared.info.width * prepared.info.height < 262_144
        || Math.min(prepared.info.width, prepared.info.height) < 15
        || Math.max(prepared.info.width / prepared.info.height, prepared.info.height / prepared.info.width) > 16) {
      return { status: 400, body: { error: "图片尺寸超出智能拆层支持范围" } };
    }
    await configuredToolCost();
    const operation = currentSynchronousBilling()!;
    if (!operation.creationId) throw new Error("拆层任务缺少归属记录");
    await withTransaction(getPool(), tx => creationLinkTx(tx, operation.creationId!, email, "canvas-project", project, "input"));
    const { provider, version } = price.channelPin;
    const key = await createCredentialReader(getPool()).read(provider.credentialRef, provider.id);
    const api = createLayerProvider({ baseUrl: provider.baseUrl, apiKey: key, model: MODEL }, transport);
    const attemptId = sha256(`canvas-layered-psd:${operation.id}`);
    const accountId = accountIdentity(provider.baseUrl, key), ledger = supplierLedger();
    await ledger.account({ id: accountId, providerId: provider.id, protocol: provider.protocol, baseUrl: provider.baseUrl, credentialRef: provider.credentialRef });
    const call = await ledger.begin({ operationId: operation.id, userEmail: email, feature: FEATURE,
      attemptId, accountId, providerId: provider.id, model: MODEL, phase: "layer-decomposition", modelVersion: version, billingVersion: price.billing.version });
    const upload = await api.upload(prepared.data, "image/png", signal);
    await ledger.apply(call.id, { state: "submitting", status: "pending", source: "layer-decomposition-submit", evidence: {} });
    markBillingUpstream("started");
    let submitted: Awaited<ReturnType<typeof api.submit>>;
    try {
      submitted = await api.submit(upload, attemptId, signal);
    } catch (error) {
      if (error instanceof LayerProviderHttpError && [400, 401, 403, 404, 422, 429].includes(error.status)) {
        markBillingUpstream("rejected");
        await ledger.apply(call.id, { state: "failed", requestId: error.requestId, status: "pending", source: "layer-decomposition-rejection", evidence: { httpStatus: error.status } });
        return { status: 502, body: { error: "拆层请求未受理" } };
      }
      const receipt = error instanceof LayerProviderReceiptError || error instanceof LayerProviderHttpError ? error : null;
      await ledger.apply(call.id, { state: "unknown", requestId: receipt?.requestId, status: "pending", source: "layer-decomposition-submit",
        evidence: receipt instanceof LayerProviderReceiptError ? { bodyHash: receipt.bodyHash } : {} });
      return { status: 409, body: { code: "OPERATION_PENDING", error: "原拆层请求的受理结果待核对" } };
    }
    const { taskId: task, requestId, bodyHash } = submitted;
    await ledger.apply(call.id, { state: "submitted", taskId: task, requestId, status: "pending", source: "layer-decomposition-submit", evidence: { bodyHash } });
    await ledger.enqueue(`task:${call.id}`, "task", { callId: call.id }, accountId);
    for (;;) {
      signal.throwIfAborted();
      const raw = await api.poll(task, signal);
      const receipt = apimartTask(raw, task);
      await ledger.apply(call.id, receipt);
      if (["failed", "cancelled", "canceled"].includes(receipt.state)) {
        markBillingUpstream("rejected");
        return { status: 422, body: { error: "本次拆层失败" } };
      }
      if (["completed", "success", "succeeded"].includes(receipt.state)) {
        markBillingUpstream("succeeded");
        const stack = await downloadLayerStack(raw.data.result, signal, transport);
        const psd = await encodeLayeredPsd(stack);
        if (psd.length > MAX_PSD_BYTES) throw new Error("PSD 文件超出导出范围");
        const fileKey = `layered-psd/${sha256(email + "\0" + operation.id)}.psd`;
        await ensureMediaSchema();
        const file = await writeStoredObject(psd, PSD_TYPE, fileKey);
        await withTransaction(getPool(), tx => registerPrivateMediaTx(tx, { key: fileKey, owner: email, driver: storageDriver,
          remoteReady: file.remoteReady, contentType: PSD_TYPE, sha256: sha256(psd), bytes: psd.length }));
        return { status: 200, body: { ok: true, operationId: input.operationId, sourceId: source.id,
          project, fileKey, layerCount: stack.layers.length, width: stack.width, height: stack.height } };
      }
      await new Promise<void>(resolve => setTimeout(resolve, 7000));
    }
  });
}

/** Read an existing receipt without invoking the model again. */
export async function layeredPsdReceipt(email: string, operationId: string) {
  const context = currentCreationContext();
  if (!context?.parentContext) return null;
  const billingId = `tool-${operationId}`;
  const record = (await getPool().query(`SELECT b.state, b.result_response, b.settlement_result FROM app_billing_operations b
    JOIN app_creation_records c ON c.source_kind=$3 AND c.source_id=b.id AND c.actor_email=b.email
    JOIN app_creation_links l ON l.creation_id=c.id AND l.target_type='canvas-project' AND l.relation='input' AND l.actor_email=c.actor_email
    WHERE b.id=$1 AND b.email=$2 AND b.feature=$3 AND c.scope_kind=$4 AND c.tenant_id IS NOT DISTINCT FROM $5::uuid AND l.target_id=$6`,
  [billingId, email, FEATURE, context.scopeKind, context.tenantId, context.parentContext])).rows[0];
  if (!record) return null;
  const result = record.result_response;
  if (record.state === "settled" && result?.ok && result.project === context.parentContext
      && result.fileKey === `layered-psd/${sha256(email + "\0" + billingId)}.psd`) {
    return { state: "ready" as const, fileKey: result.fileKey };
  }
  return { state: record.state === "settled" && record.settlement_result?.state === "failed" ? "failed" as const : "pending" as const };
}
