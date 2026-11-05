import { toolImageError } from "../tool-ui";
import type { WorkbenchAccountOwner, WorkbenchAccountScope, WorkbenchTransport } from "./workbench-contract";

type Upload = { scope: WorkbenchAccountScope; generation: number; controller: AbortController };
export type WorkbenchAttachmentContext = WorkbenchTransport & {
  setBusy(change: boolean | ((previous: boolean) => boolean)): void;
  setError(value: string | null): void;
};
type Uploaded = { urls: string[]; complete: boolean; current(): boolean };
const MAX_UPLOAD = 12 * 1024 * 1024;

/** Keep the original CDN/path alias contract used by canvas/regenerate links. */
function imageKey(url: string): string {
  try {
    const path = decodeURIComponent(new URL(url, "http://x").pathname);
    return path.split("/").pop() || path;
  } catch {
    return url.split("?")[0].split("/").pop() || url;
  }
}

/** One attachment lifecycle under the conversation account. Upload batches and
 * artwork-index reads have separate revisions: readiness can invalidate an
 * index lookup without cancelling a same-account upload or accepted SSE. */
export function createWorkbenchAttachments(account: WorkbenchAccountOwner) {
  let generation = 0, indexRevision = 0;
  let index: Record<string, string> = {};
  const uploads = new Set<Upload>(), lookups = new Set<AbortController>();
  function ownsResult(owner: Upload) {
    return account.owns(owner.scope) && generation === owner.generation && !owner.controller.signal.aborted;
  }
  function ownsUpload(owner: Upload) { return ownsResult(owner) && uploads.has(owner); }
  function reset(context?: Pick<WorkbenchAttachmentContext, "setBusy">) {
    generation += 1;
    for (const owner of uploads) owner.controller.abort();
    uploads.clear();
    const scope = account.current();
    context?.setBusy(previous => account.owns(scope) ? uploads.size > 0 : previous);
  }
  function resetIndex() {
    indexRevision += 1;
    for (const controller of lookups) controller.abort();
    lookups.clear();
    index = {};
  }
  async function one(file: File, owner: Upload, context: WorkbenchAttachmentContext): Promise<string | null> {
    if (!ownsUpload(owner)) return null;
    if (toolImageError(file, MAX_UPLOAD)) { context.setError("请选择12MB以内的PNG / JPG / WebP图片"); return null; }
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("title", "Agent 上传");
      body.append("entry", "agent");
      const headers = await context.headers();
      if (!ownsUpload(owner)) return null;
      const response = await context.request("/api/artworks/add", { method: "POST", headers, body, signal: owner.controller.signal });
      if (!ownsUpload(owner)) { await response.body?.cancel().catch(() => {}); return null; }
      const data = await response.json();
      if (!ownsUpload(owner)) return null;
      if (!response.ok) throw new Error(data.error || "图片上传失败，请重试");
      const url = data?.artwork?.image || data?.image || data?.url;
      const id = data?.artwork?.id || data?.id || null;
      if (url && id) index[imageKey(url)] = id;
      return url || null;
    } catch (caught) {
      if (ownsUpload(owner)) context.setError(caught instanceof Error ? caught.message : "图片上传失败，请重试");
      return null;
    }
  }
  async function upload(files: File[], context: WorkbenchAttachmentContext, requireAll = false): Promise<Uploaded> {
    const scope = account.current();
    if (!account.owns(scope)) return { urls: [], complete: false, current: () => false };
    const owner = { scope, generation, controller: new AbortController() };
    uploads.add(owner);
    context.setBusy(previous => ownsResult(owner) ? uploads.size > 0 : previous);
    const urls: string[] = [], result = () => ({ urls, complete: urls.length === files.length, current: () => ownsResult(owner) });
    try {
      for (const file of files) {
        const url = await one(file, owner, context);
        if (!ownsUpload(owner)) return result();
        if (url) urls.push(url);
        else if (requireAll) return result();
      }
      return result();
    } finally {
      const current = ownsUpload(owner);
      uploads.delete(owner);
      // Compute at React updater execution, not when an older batch finishes.
      if (current) context.setBusy(previous => ownsResult(owner) ? uploads.size > 0 : previous);
    }
  }
  async function append(files: File[], context: WorkbenchAttachmentContext & {
    setAttachments(change: (previous: string[]) => string[]): void;
  }) {
    const result = await upload(files, context);
    if (result.urls.length) context.setAttachments(previous => result.current() ? [...previous, ...result.urls] : previous);
  }
  async function resolveArtworkId(url: string, context: WorkbenchTransport): Promise<string | null> {
    const scope = account.current(), key = imageKey(url);
    if (!key || !account.owns(scope) || !scope.account) return null;
    if (index[key]) return index[key];
    const revision = indexRevision, controller = new AbortController();
    lookups.add(controller);
    const current = () => account.owns(scope) && revision === indexRevision && !controller.signal.aborted;
    try {
      const headers = await context.headers();
      if (!current()) return null;
      const response = await context.request(`/api/account?email=${encodeURIComponent(scope.account)}`, { headers, signal: controller.signal });
      if (!response.ok || !current()) { await response.body?.cancel().catch(() => {}); return null; }
      const data = await response.json();
      if (!current()) return null;
      for (const artwork of (data.artworks ?? []) as { id: string; image: string }[]) {
        if (artwork.id && artwork.image) index[imageKey(artwork.image)] = artwork.id;
      }
      return index[key] ?? null;
    } catch {
      return null;
    } finally {
      lookups.delete(controller);
    }
  }
  return { upload, append, reset, resetIndex, resolveArtworkId, snapshot: () => ({ ...index }) };
}
