import "server-only";
import sharp from "sharp";
import { readBoundedBytes } from "../supplier-cost/io";
import { modelEndpointFetch } from "./transport";
import type { ValidationOptions } from "./schema";
const acceptedResponses = new WeakSet<Response>();
/** Only adapters which already bounded and fully decoded every returned image
 * may mark their own response. This is pixel validation, not customer delivery. */
export function validatedChannelImageResponse(response: Response) {
  acceptedResponses.add(response);
  return response;
}
const failureStages = new WeakMap<object, string>();
export const channelImageFailureStage = (error: unknown) => error && typeof error === "object" ? failureStages.get(error) : undefined;
const retryableDownload=(error:unknown)=>{
 const e=error as {code?:string;cause?:{code?:string}}|null;
 return ['ECONNRESET','ETIMEDOUT','UND_ERR_SOCKET','ERR_STREAM_PREMATURE_CLOSE','UND_ERR_CONNECT_TIMEOUT'].includes(e?.code||e?.cause?.code||'');
};

/** Complete and validate the image before accepting a supplier attempt. */
export async function completedChannelImage(response: Response, signal: AbortSignal, options: ValidationOptions) {
  if(acceptedResponses.has(response))return response;
  let stage = "read-response";
  try {
  const raw = await readBoundedBytes(response, 48 * 1024 * 1024);
  stage = "parse-response";
  const body = JSON.parse(raw.toString("utf8"));
  stage = "validate-envelope";
  if (!Array.isArray(body?.data) || !body.data.length || body.data.length > 6) throw Error("supplier-image-missing");
  for (const item of body.data) {
    let bytes: Buffer;
    stage = "decode-base64";
    if (typeof item?.b64_json === "string" && /^[A-Za-z0-9+/\s]+={0,2}$/.test(item.b64_json)) bytes = Buffer.from(item.b64_json, "base64");
    else if (typeof item?.url === "string") {
      stage = "parse-image-url";
      const url = new URL(item.url);
      stage = "download-image";
      try {
        const downloadSignal=AbortSignal.any([signal,AbortSignal.timeout(60000)]);
        const fetchImage=modelEndpointFetch(url.origin,options);
        // Retry only the SAME result URL's read, at most once within the original
        // 60s budget. No generator POST, channel fallback, auth or redirects.
        for(let attempt=0;;attempt++){
          try{
            downloadSignal.throwIfAborted();
            const download=await fetchImage(url,{method:'GET',redirect:'error',signal:downloadSignal});
            if(!download.ok){await download.body?.cancel();throw Error('supplier-image-download-failed');}
            bytes=await readBoundedBytes(download);break;
          }catch(error){if(attempt!==0||downloadSignal.aborted||!retryableDownload(error))throw error;}
        }
      } catch (cause) { throw new Error("supplier-image-download-failed", { cause }); }
    } else throw Error("supplier-image-missing");
    stage = "validate-size";
    if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw Error("supplier-image-size-invalid");
    stage = "decode-pixels";
    try { await sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 }).resize(1, 1).raw().toBuffer(); }
    catch(cause) { throw new Error("supplier-image-invalid-output", { cause }); }
    item.b64_json = bytes.toString("base64");
    delete item.url;
  }
  stage = "serialize-response";
  const headers = new Headers(response.headers);
  headers.delete("content-length"); headers.delete("content-encoding"); headers.set("content-type", "application/json");
  const complete=new Response(JSON.stringify(body), { status: response.status, headers });
  return validatedChannelImageResponse(complete);
  } catch (error) {
    if (error && typeof error === "object") failureStages.set(error, stage);
    throw error;
  }
}
