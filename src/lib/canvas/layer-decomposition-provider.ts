import "server-only";
import { createHash } from "node:crypto";
import { readBounded, readBoundedBytes } from "../supplier-cost/io";
import { submittedAPIMartTask, validTaskId } from "../supplier-cost/adapters";
import { parseReceiptJson } from "../supplier-cost/money";
import { modelEndpointFetch } from "../model-config/transport";
import { MAX_LAYER_COUNT, MAX_LAYER_SIZE, type LayerStack } from "./layered-psd";

const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
export const DECOMPOSITION_PROMPT = "拆分原图的背景、商品主体和主要装饰或文案，保留原构图、颜色和细节。将遮挡主体后的背景自然补全，商品和装饰分别以透明图层返回。";

type OutputLayer = Omit<LayerStack["layers"][number], "bytes"> & { url: string; z: number };
type ProviderLayer = { z_index?: number | string; name?: string; bounding_box?: { absolute?: (number | string)[] } };
type ProviderResult = { images?: { layer_decomposition?: boolean; url?: string[]; sizes?: string[]; layers?: ProviderLayer[] }[] };

/** Preserve the exact receipt bijection even when z-order differs from list order. */
export function readLayerReceipt(result: unknown) {
  const images = (result as ProviderResult | null)?.images;
  if (!Array.isArray(images) || images.length !== 1) throw new Error("拆层结果缺少图层清单");
  const entry = images[0];
  if (!entry?.layer_decomposition || !Array.isArray(entry.url) || !Array.isArray(entry.layers) || !Array.isArray(entry.sizes)
      || entry.url.length < 2 || entry.url.length > MAX_LAYER_COUNT || entry.layers.length !== entry.url.length
      || entry.sizes.length !== entry.url.length) throw new Error("拆层结果的图层数无效");
  const sizes = entry.sizes.map(size => {
    const match = typeof size === "string" && /^(\d{1,4})[xX](\d{1,4})$/.exec(size);
    const w = match ? Number(match[1]) : 0, h = match ? Number(match[2]) : 0;
    if (w < 1 || h < 1 || w > MAX_LAYER_SIZE || h > MAX_LAYER_SIZE) throw new Error("拆层结果尺寸无效");
    return { w, h };
  });
  const { w: width, h: height } = sizes[0];
  const layers = entry.layers.map((layer, index): OutputLayer => {
    const url = new URL(entry.url![index]);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("拆层结果地址无效");
    const z = integer(layer?.z_index);
    if (!Number.isInteger(z) || z < 0 || (index === 0) !== (z === 0)) throw new Error("拆层结果顺序无效");
    if (index === 0) return { url: url.href, z: 0, left: 0, top: 0, width, height, name: "背景" };
    const bounds = layer.bounding_box?.absolute?.map(integer);
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isInteger)) throw new Error("拆层结果缺少图层坐标");
    const [left, top, right, bottom] = bounds;
    const { w, h } = sizes[index];
    // Some native-size receipts use inclusive endpoints. Upsampled cutouts
    // instead carry an independent placement rectangle on the base canvas.
    const nativeBox = [w, w - 1].includes(right - left) && [h, h - 1].includes(bottom - top);
    const placedWidth = nativeBox ? w : right - left;
    const placedHeight = nativeBox ? h : bottom - top;
    if (left < 0 || top < 0 || placedWidth < 1 || placedHeight < 1
        || left + placedWidth > width || top + placedHeight > height) throw new Error("拆层结果坐标超出原图");
    return { url: url.href, z, left, top, width: w, height: h, placedWidth, placedHeight, name: typeof layer.name === "string" ? layer.name : "" };
  });
  if (new Set(layers.map(layer => layer.z)).size !== layers.length) throw new Error("拆层结果层级重复");
  return { width, height, layers: layers.sort((a, b) => a.z - b.z) };
}

function integer(value: unknown) {
  return typeof value === "number" || typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
}

export class LayerProviderHttpError extends Error {
  constructor(readonly status: number, readonly requestId?: string) { super(`拆层服务返回 HTTP ${status}`); }
}

export class LayerProviderReceiptError extends Error {
  constructor(readonly requestId?: string, readonly bodyHash?: string) { super("未确认拆层服务是否受理"); }
}

/** The operation owner must persist the one submission claim before invoking submit. */
export function createLayerProvider(connection: { baseUrl: string; apiKey: string; model: string }, transport?: typeof fetch) {
  const base = connection.baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const request = transport ?? modelEndpointFetch(base);
  async function json(path: string, init: RequestInit) {
    const response = await request(base + path, { ...init, headers: { Authorization: `Bearer ${connection.apiKey}`, ...init.headers }, redirect: "error", cache: "no-store" });
    const id = response.headers.get("x-request-id") ?? response.headers.get("request-id");
    const requestId = validTaskId(id) ? id : undefined;
    if (!response.ok) { await response.body?.cancel(); throw new LayerProviderHttpError(response.status, requestId); }
    const body = await readBounded(response).catch(() => { throw new LayerProviderReceiptError(requestId); });
    const bodyHash = createHash("sha256").update(body).digest("hex");
    try { return { result: parseReceiptJson(body), requestId, bodyHash }; }
    catch { throw new LayerProviderReceiptError(requestId, bodyHash); }
  }
  return {
    async upload(bytes: Buffer, mime: string, signal: AbortSignal): Promise<string> {
      const form = new FormData();
      const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
      form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `source.${extension}`);
      const { result } = await json("/v1/uploads/images", { method: "POST", body: form, signal });
      const url = new URL(result?.url);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("拆层服务未返回有效的输入回执");
      return url.href;
    },
    async submit(source: string, operation: string, signal: AbortSignal) {
      const { result, requestId, bodyHash } = await json("/v1/images/generations", { method: "POST", signal,
        headers: { "Content-Type": "application/json", "Idempotency-Key": operation, "X-APIMart-Response-Version": "2026-07-27" },
        body: JSON.stringify({ model: connection.model, image_urls: [source], size: "1K", layer_decomposition: true, prompt: DECOMPOSITION_PROMPT }) });
      let taskId: string | null;
      try { taskId = submittedAPIMartTask(result); }
      catch { throw new LayerProviderReceiptError(requestId, bodyHash); }
      if (!taskId) throw new LayerProviderReceiptError(requestId, bodyHash);
      return { taskId, requestId, bodyHash };
    },
    async poll(task: string, signal: AbortSignal) {
      const { result } = await json(`/v1/tasks/${encodeURIComponent(task)}`, { signal });
      const data = result?.data;
      if (!data || data.id !== task) throw new Error("拆层结果与原任务不符");
      return result;
    },
  };
}

export async function downloadLayerStack(result: unknown, signal: AbortSignal, fetcher?: typeof fetch): Promise<LayerStack> {
  const receipt = readLayerReceipt(result);
  const layers: LayerStack["layers"] = [];
  let remaining = MAX_DOWNLOAD_BYTES;
  for (const layer of receipt.layers) {
    if (remaining <= 0) throw new Error("拆层结果体积超出导出范围");
    const get = fetcher ?? modelEndpointFetch(new URL(layer.url).origin);
    const response = await get(layer.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]), redirect: "error", cache: "no-store" });
    if (!response.ok || !/^image\/(png|jpeg)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      throw new Error("无法读取拆层图片");
    }
    const bytes = await readBoundedBytes(response, remaining);
    remaining -= bytes.length;
    layers.push({ name: layer.name, left: layer.left, top: layer.top, width: layer.width, height: layer.height,
      placedWidth: layer.placedWidth, placedHeight: layer.placedHeight, bytes });
  }
  return { width: receipt.width, height: receipt.height, layers };
}
