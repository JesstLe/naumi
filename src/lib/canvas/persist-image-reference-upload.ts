"use client";

import { authHeader } from "../supabase";
import { prepareImageUploads, uploadFormData } from "../client-image-upload";
import { clientIntentKey } from "../billing/client-intent";
import { ORIGINAL_IMAGE_MAX_BYTES } from "../image-upload-policy";

export type CanvasPromptReferenceReceipt = { id: string; image: string; title: string };
export type CanvasPromptReferenceUploadOptions = {
  parentId: string;
  projectKey: string;
  workspace: string;
  ownerScope: string;
  isCurrent: () => boolean;
  request?: typeof fetch;
};
type Attempt = { operationId: string; receipt?: CanvasPromptReferenceReceipt; running?: Promise<CanvasPromptReferenceReceipt> };
const attempts = new WeakMap<File, Map<string, Attempt>>();
function contentOperationId(key: string) {
  const digest = key.slice(key.lastIndexOf(":") + 1);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${((parseInt(digest[16], 16) & 3) | 8).toString(16)}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Formal reference import: original bytes + bounded browser previews. It never
 * calls a model. An uncertain response retains the same operation identifier. */
export async function uploadCanvasPromptReference(file: File, options: CanvasPromptReferenceUploadOptions): Promise<CanvasPromptReferenceReceipt> {
  const assertCurrent = () => { if (!options.isCurrent()) throw new Error("账号或画布已切换，未继续上传图片"); };
  assertCurrent();
  if (!options.ownerScope || !options.projectKey || !options.parentId) throw new Error("请先选择已保存的图片节点");
  if (!file.size || file.size > ORIGINAL_IMAGE_MAX_BYTES) throw new Error("原图需在64MiB以内");
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type) && !(!file.type && /\.(png|jpe?g|webp)$/i.test(file.name))) throw new Error("请选择PNG、JPEG或WebP图片");
  const scope = JSON.stringify([options.ownerScope, options.workspace, options.projectKey, options.parentId]);
  let byScope = attempts.get(file);
  if (!byScope) { byScope = new Map(); attempts.set(file, byScope); }
  let attempt = byScope.get(scope);
  if (!attempt) { attempt = { operationId: "" }; byScope.set(scope, attempt); }
  if (attempt.receipt) return attempt.receipt;
  if (attempt.running) { const receipt = await attempt.running; assertCurrent(); return receipt; }
  const selectedAttempt = attempt;
  selectedAttempt.running = (async () => {
    const frozenHeaders = new Headers(await authHeader());
    assertCurrent();
    frozenHeaders.set("x-naumi-workspace", options.workspace);
    frozenHeaders.set("x-naumi-project-context", options.projectKey);
    frozenHeaders.delete("content-type");
    const input = new FormData();
    input.set("image", file); input.set("title", file.name.slice(0, 200) || "参考图片");
    input.set("projectKey", options.projectKey); input.set("parentId", options.parentId); input.set("workspace", options.workspace);
    // Re-selecting the identical file after an interrupted response also reuses
    // the operation. Only opaque IDs, never file bytes or auth, enter storage.
    const key = (await clientIntentKey(options.ownerScope, "/canvas/image-reference-upload", { body: input }))
      .replace("naumi:billing-intent:", "naumi:canvas-reference-upload:");
    assertCurrent();
    let saved: string | undefined;
    try { saved = sessionStorage.getItem(key) || undefined; } catch { /* Content identity remains reproducible. */ }
    selectedAttempt.operationId = contentOperationId(key);
    if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved)) selectedAttempt.operationId = saved;
    try { sessionStorage.setItem(key, selectedAttempt.operationId); } catch { /* Retain the in-memory receipt. */ }
    const [prepared] = await prepareImageUploads([file], 1, { preserveOriginal: true });
    assertCurrent();
    if (prepared.error) throw new Error(prepared.error);
    input.set("image", prepared.file);
    input.set("operationId", selectedAttempt.operationId);
    const result = await uploadFormData<Partial<CanvasPromptReferenceReceipt>>("/api/canvas/image-reference-upload", input, undefined, 120_000, assertCurrent,
      { headers: frozenHeaders, ...(options.request ? { request: options.request } : {}) });
    if (typeof result.id !== "string" || !result.id || typeof result.image !== "string" || !/^(?:\/media\/|https?:\/\/)/.test(result.image)) throw new Error("图片上传回执尚未核实，请重试原文件");
    // Keep a committed receipt even if its original view was left while awaiting
    // the response. The caller still has to pass its current-owner fence.
    selectedAttempt.receipt = { id: result.id, image: result.image, title: typeof result.title === "string" ? result.title : file.name };
    assertCurrent();
    return selectedAttempt.receipt;
  })();
  try { return await selectedAttempt.running; }
  finally { selectedAttempt.running = undefined; }
}
