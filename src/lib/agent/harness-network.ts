import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { HarnessError } from "./harness";

const mediaPath = /^\/(?:media|api\/media|uploads)\/[\w%./-]+$/;
export function assertMediaUrl(raw: string, origin: string): URL {
  if (/[\u0000-\u0020\\]/.test(raw) || raw.startsWith("//")) throw new HarnessError("ARGUMENT_INVALID");
  const url = new URL(raw, origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new HarnessError("ARGUMENT_INVALID");
  if (url.origin === new URL(origin).origin) {
    const decoded = decodeURIComponent(url.pathname);
    if (!mediaPath.test(url.pathname) || decoded.includes("..") || /[\\\u0000]/.test(decoded)) throw new HarnessError("ARGUMENT_INVALID");
  }
  return url;
}
function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a > 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && [0,168].includes(b)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && [18,19].includes(b));
  }
  // Fail closed on IPv6/mapped IPv4 until the outbound transport pins vetted DNS results.
  return false;
}
export async function assertPublicImageHost(url: URL, allowed: RegExp) {
  if (url.protocol !== "https:" || !allowed.test(url.hostname) || url.port && url.port !== "443") throw new HarnessError("ARGUMENT_INVALID");
  const addresses = await lookup(url.hostname, { all: true, family:4 });
  if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw new HarnessError("ARGUMENT_INVALID");
  return addresses[0];
}
export async function publicImageBytes(url: URL, allowed: RegExp, limit: number, signal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
  const address = await assertPublicImageHost(url, allowed);
  // Pin the vetted IPv4 answer; TLS still verifies the original hostname. No redirect follow.
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { signal, lookup: (_host, _opts, done) => done(null, address.address, 4) }, res => {
      const contentType = String(res.headers["content-type"] || "").split(";")[0];
      if (res.statusCode !== 200 || !/^image\/(?:png|jpeg|webp|gif)$/.test(contentType) || Number(res.headers["content-length"]) > limit) { res.destroy(); reject(new HarnessError("OUTPUT_BLOCKED")); return; }
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > limit) { res.destroy(new HarnessError("OUTPUT_BLOCKED")); return; } chunks.push(chunk); });
      res.on("error", reject); res.on("end", () => resolve({ bytes: Buffer.concat(chunks), contentType }));
    });
    req.setTimeout(15_000, () => req.destroy(new HarnessError("OUTPUT_BLOCKED"))); req.on("error", reject); req.end();
  });
}
/** Central endpoint allowlist. No URLs/redirects/admin endpoints can carry Agent credentials. */
export function assertInternalAgentPath(path: string, method: string) {
  if (!path.startsWith("/api/") || /[\\\u0000-\u0020]/.test(path)) throw new HarnessError("TOOL_DENIED", 403);
  const url = new URL(path, "http://internal.invalid"), pathname = url.pathname;
  const reads = /^\/api\/(?:models|templates|account|generate-image|aplus|suite|packaging3d|comfyui\/workflows|video\/(?:catalog|byoc\/catalog|assets|projects|texts|nodes|tasks(?:\/[\w.:%-]+)?|media-jobs(?:\/[\w.:%-]+)?|media-jobs\/quote|workflows(?:\/[\w.:%-]+)?)|canvas\/(?:timeline-nodes\/[\w.:%-]+|storyboards(?:\/review)?|video-nodes(?:\/[\w.:%-]+)?)|competitors)$/;
  const writes = /^\/api\/(?:generate-image|canvas\/generate-image|retouch|recolor|replicate|suite|aplus|packaging3d|comfyui\/run|video\/(?:texts|generate|tasks\/[\w.:%-]+\/(?:cancel|retry|send-to-canvas)|media-jobs|workflows(?:\/[\w.:%-]+)?)|canvas\/(?:timeline-nodes(?:\/[\w.:%-]+\/(?:render|adopt))?|storyboards(?:\/(?:inspect|roughcut|fork|dialogue|costs|structure-inspect|structure|structure-restore|review-frames|review))?|video-workflows|video-nodes(?:\/[\w.:%-]+(?:\/generate)?)?)|agent\/verify-image|cutout|avatar|upscale|inpaint|style|dewatermark|tryon|garment|garment3d|dewrinkle|extract|ipcheck|printfile|title-gen|competitors(?:\/[\w-]+\/action)?|artworks\/add)$/;
  if (url.origin !== "http://internal.invalid" || !(method === "GET" ? reads : method === "POST" ? writes : method==="PATCH"?/^\/api\/canvas\/video-nodes\/[\w.:%-]+$/:method==="DELETE"?/^\/api\/video\/media-jobs\/[\w.:%-]+$/:null)?.test(pathname)) throw new HarnessError("TOOL_DENIED", 403);
}
export async function readBoundedBytes(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new HarnessError("OUTPUT_BLOCKED"); }
  const reader = response.body?.getReader(); if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new HarnessError("OUTPUT_BLOCKED"); chunks.push(value); } }
  catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
