import "server-only";
import { parseReceiptJson } from "./money";
import { modelEndpointFetch } from "../model-config/transport";
export async function readBounded(response: Response, max = 2 * 1024 * 1024) {
  return (await readBoundedBytes(response, max)).toString("utf8");
}
export async function readBoundedBytes(response: Response, max = 32 * 1024 * 1024) {
  const reader = response.body?.getReader(); if (!reader) throw new Error("empty receipt");
  let bytes = 0; const parts: Uint8Array[] = [];
  while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > max) { await reader.cancel(); throw new Error("receipt too large"); } parts.push(part.value); }
  return Buffer.concat(parts);
}
export async function queryReceipt(baseUrl: string, path: string, key: string, fetcher?: typeof fetch) {
  const transport = fetcher || modelEndpointFetch(baseUrl, { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) });
  const response = await transport(`${baseUrl.replace(/\/$/, "")}${path}`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`supplier-query-http-${response.status}`); }
  return parseReceiptJson(await readBounded(response));
}
