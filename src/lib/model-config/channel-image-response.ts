import "server-only";
import sharp from "sharp";
import { readBoundedBytes } from "../supplier-cost/io";
import { modelEndpointFetch } from "./transport";
import type { ValidationOptions } from "./schema";

/** Complete and validate the image before accepting a supplier attempt. */
export async function completedChannelImage(response: Response, signal: AbortSignal, options: ValidationOptions) {
  const raw = await readBoundedBytes(response, 48 * 1024 * 1024);
  const body = JSON.parse(raw.toString("utf8"));
  if (!Array.isArray(body?.data) || !body.data.length || body.data.length > 6) throw Error("supplier-image-missing");
  for (const item of body.data) {
    let bytes: Buffer;
    if (typeof item?.b64_json === "string" && /^[A-Za-z0-9+/\s]+={0,2}$/.test(item.b64_json)) bytes = Buffer.from(item.b64_json, "base64");
    else if (typeof item?.url === "string") {
      const url = new URL(item.url);
      const download = await modelEndpointFetch(url.origin, options)(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
      if (!download.ok) { await download.body?.cancel(); throw Error("supplier-image-download-failed"); }
      bytes = await readBoundedBytes(download);
    } else throw Error("supplier-image-missing");
    if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw Error("supplier-image-size-invalid");
    await sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 }).resize(1, 1).raw().toBuffer();
    item.b64_json = bytes.toString("base64");
    delete item.url;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length"); headers.delete("content-encoding"); headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status: response.status, headers });
}
