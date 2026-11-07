import "server-only";
import { storageKeyFromManagedUrl } from "@/lib/object-storage/runtime";
import { canReadMedia } from "@/lib/media-assets";
import { serveMedia } from "@/lib/media/response";
import { addArtworks } from "@/lib/artworks/writer";
import { provenanceEntry } from "@/lib/artwork-provenance";
import { adaptiveCanvasImageSize } from "@/lib/canvas/image-size";
import { originalImageMetadata, saveCanvasOriginal } from "@/lib/canvas-original-upload";
import { GatewayError } from "./errors";
import { internalCookie } from "./tool-session";

// Media adapter for remote agents: owned-only references in, owned-only bytes out.
// Uploads reuse the canvas original-image path and appear in the account's works as "Agent 上传".

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MEDIA_PREFIX = "/media/";

/** Site-relative media path for a reference the gateway recognizes, otherwise null. */
function managedPath(value: string, origins: readonly string[]): string | null {
  if (value !== value.trim() || value.length > 2048 || /[\u0000- \\]/.test(value)) return null;
  if (value.startsWith(MEDIA_PREFIX)) return value.split(/[?#]/, 1)[0];
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.username || url.password) return null;
  if (origins.includes(url.origin) && url.pathname.startsWith(MEDIA_PREFIX)) return url.pathname;
  return storageKeyFromManagedUrl(value) ? value.split(/[?#]/, 1)[0] : null;
}

async function assertOwned(reference: string, email: string): Promise<string> {
  const key = storageKeyFromManagedUrl(reference);
  if (!key) throw new GatewayError("MEDIA_INVALID", "媒体地址无效", 400);
  if (!(await canReadMedia(key, email))) throw new GatewayError("MEDIA_NOT_FOUND", "图片不存在或不属于当前账号", 404);
  return key;
}

/**
 * Rewrites this site's absolute media URLs to the managed form the tools accept and rejects
 * media the token owner cannot read. Other strings (prompts, public URLs) pass through untouched.
 */
export async function normalizeMediaArguments<T>(value: T, email: string, origins: readonly string[]): Promise<T> {
  const visit = async (input: unknown, depth: number): Promise<unknown> => {
    if (depth > 12) return input;
    if (typeof input === "string") {
      const path = managedPath(input, origins);
      if (!path) return input;
      await assertOwned(path, email);
      return path;
    }
    if (Array.isArray(input)) return Promise.all(input.map(item => visit(item, depth + 1)));
    if (input && typeof input === "object") return Object.fromEntries(await Promise.all(Object.entries(input).map(async ([key, item]) => [key, await visit(item, depth + 1)])));
    return input;
  };
  return visit(value, 0) as Promise<T>;
}

/** Absolute URL for a remote caller; already-absolute (CDN) URLs are kept. */
export function publicMediaUrl(reference: string, origin: string): string {
  return reference.startsWith(MEDIA_PREFIX) ? origin + reference : reference;
}

/** Streams one owned media object through the site's normal media server (ranges, presigned redirects). */
export async function ownedMediaResponse(reference: string, email: string, origins: readonly string[], range: string | null): Promise<Response> {
  const path = managedPath(reference, origins);
  if (!path) throw new GatewayError("MEDIA_INVALID", "只能下载本站媒体地址", 400);
  await assertOwned(path, email);
  if (!path.startsWith(MEDIA_PREFIX)) return Response.redirect(path, 307);
  let segments: string[];
  try { segments = path.slice(MEDIA_PREFIX.length).split("/").map(decodeURIComponent); } catch { throw new GatewayError("MEDIA_INVALID", "媒体地址无效", 400); }
  const headers: Record<string, string> = { cookie: internalCookie(email) };
  if (range) headers.range = range;
  return serveMedia(new Request(`http://internal.invalid${path}`, { headers }), segments);
}

export async function saveAgentUpload(email: string, file: File): Promise<{ url: string; id: string; width: number | null; height: number | null; contentType: string; bytes: number }> {
  if (file.size <= 0) throw new GatewayError("MEDIA_INVALID", "文件为空", 400);
  if (file.size > MAX_UPLOAD_BYTES) throw new GatewayError("MEDIA_INVALID", "图片不能超过 12MB", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  let meta: Awaited<ReturnType<typeof originalImageMetadata>>;
  try { meta = await originalImageMetadata(bytes); } catch { throw new GatewayError("MEDIA_INVALID", "仅支持 png / jpg / webp 图片", 400); }
  const id = `art-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const saved = await saveCanvasOriginal(bytes, `canvas-uploads/${id}.${meta.extension}`, email);
  const width = meta.width ?? null, height = meta.height ?? null, canvas = adaptiveCanvasImageSize(width, height);
  await addArtworks(email, [{
    id, title: "Agent 上传", category: "main", prompt: "", status: "completed", image: saved.url,
    creationProvenance: { version: 1, operation: "upload", entry: provenanceEntry("agent", "canvas"), ref: id, evidence: "server-route" },
    gradient: "from-rose-100 to-slate-100", parentId: null, source: "canvas-add", canvasGroupId: null,
    width, height, canvasWidth: canvas.width, canvasHeight: canvas.height,
  }]);
  return { url: saved.url, id, width, height, contentType: saved.mime, bytes: bytes.length };
}
