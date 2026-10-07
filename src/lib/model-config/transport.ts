import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { privateModelHost, modelMetadataHost, validateModelEndpoint, type ValidationOptions } from "./schema";
import { ModelConfigError } from "./types";
import { capacityFetch } from "./capacity";
import { dbEnabled, getPool } from "../db";
import { supplierCostFetch } from "../supplier-cost/collect";
import type { ModelExecutionScope } from "./context";

/** Pins validated DNS answers for the actual connection; redirects never carry supplier credentials. */
export function modelEndpointFetch(baseUrl: string, options: ValidationOptions = {}, provider?: { providerId: string; maxConcurrent?: number; timeoutMs: number; apiKey?: string; wireModel?: string; protocol?: string; credentialRef?: string; costScope?: ModelExecutionScope; costDisabled?: boolean; actor?:{userEmail:string;feature:string} }): typeof fetch {
  const base = new URL(validateModelEndpoint(baseUrl, options));
  const trusted = options.trustedOrigins?.includes(base.origin);
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== base.origin || url.username || url.password || url.hash) throw new ModelConfigError("INVALID_ENDPOINT", "模型请求超出已配置接口范围");
    if (request.signal.aborted) throw request.signal.reason;
    return new Promise<Response>((resolve, reject) => {
      const headers = Object.fromEntries(request.headers.entries());
      const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
      const upstream = transport(url, { method: request.method, headers, signal: request.signal, lookup: (host, _opts, callback) => {
        void lookup(host, { all: true, verbatim: true }).then(answers => {
          if (!answers.length || answers.some(a => modelMetadataHost(a.address) || !trusted && privateModelHost(a.address))) throw new ModelConfigError("INVALID_ENDPOINT", "模型域名解析到禁止访问的地址");
          // Node may request all addresses when auto-selecting address families.
          if ((_opts as { all?: boolean }).all) (callback as unknown as (error: null, addresses: typeof answers) => void)(null, answers);
          else callback(null, answers[0].address, answers[0].family);
        }).catch(error => callback(error, "", 0));
      } }, response => {
        const status = response.statusCode || 502;
        if (status >= 300 && status < 400) { response.resume(); reject(new ModelConfigError("INVALID_ENDPOINT", "模型接口重定向已拒绝", 503)); return; }
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        response.on("error", reject);
        const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
        const decoder = encoding === "gzip" || encoding === "x-gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null;
        if (decoder) {
          responseHeaders.delete("content-encoding"); responseHeaders.delete("content-length");
          response.on("error", error => decoder.destroy(error));
        }
        const body = status === 204 || status === 304 || request.method === "HEAD" ? null : Readable.toWeb(decoder ? response.pipe(decoder) : response) as ReadableStream<Uint8Array>;
        if (body === null) response.resume();
        resolve(new Response(body, { status, headers: responseHeaders }));
      });
      upstream.on("error", reject);
      if (request.body) {
        const body = Readable.fromWeb(request.body as never);
        body.on("error", error => upstream.destroy(error)); body.pipe(upstream);
      } else upstream.end();
    });
  };
  // Acquire the local capacity gate FIRST: a locally rejected request is not a supplier attempt.
  const observed = provider && !provider.costDisabled ? supplierCostFetch(transport, { ...provider, baseUrl }) : transport;
  return provider?.maxConcurrent && dbEnabled && process.env.NAUMI_ROUTER_MANAGEMENT_URL ? capacityFetch(observed, getPool(), { ...provider, baseUrl, maxConcurrent: provider.maxConcurrent }) : observed;
}
