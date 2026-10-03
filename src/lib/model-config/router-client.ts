import "server-only";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { validateModelEndpoint, type ValidationOptions } from "./schema";
import { ModelConfigError } from "./types";
import type { RouterPayload } from "./projection";

export type SealedCredential = { ref: string; providerID: string; ciphertext: { iv: string; tag: string; ct: string } };
const statusSchema = z.strictObject({ id: z.string().max(100), digest: z.string().regex(/^[a-f0-9]{64}$/), phase: z.literal("applied") });
export type RouterStatus = z.infer<typeof statusSchema>;
export interface RouterControl {
  prepare(payload: RouterPayload, credentials: SealedCredential[]): Promise<void>;
  activate(id: string, expectedDigest: string, digest: string): Promise<RouterStatus>;
  status(id: string): Promise<RouterStatus | null>;
  state(): Promise<string>;
  legacy(): Promise<{ config: unknown; credentials: SealedCredential[] }>;
  seal(ref: string, providerID: string, plain: string): SealedCredential;
  open(credential: SealedCredential): string;
}
export function createRouterControl(input: ValidationOptions & { baseUrl: string; token: string; envelopeSecret: string }): RouterControl {
  if (input.token.length < 32 || input.envelopeSecret.length < 32 || input.token === input.envelopeSecret)
    throw new ModelConfigError("ROUTER_UNAVAILABLE", "请配置独立的模型管理凭据与加密密钥", 503);
  const base = validateModelEndpoint(input.baseUrl, input).replace(/\/$/, "");
  const key = createHash("sha256").update(input.envelopeSecret).digest();
  const request = async (method: string, path: string, body?: unknown, missing = false): Promise<any> => {
    try {
      const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (missing && response.status === 404) return null;
      if (!response.ok) throw new ModelConfigError(response.status === 409 ? "ROUTER_CONFLICT" : response.status === 400 ? "INVALID_PROJECTION" : "ROUTER_UNAVAILABLE", response.status === 409 ? "Router 配置已更新，请核对发布状态" : response.status === 400 ? "Router 无法准备该配置，请检查协议、能力与参数" : "Router 管理服务暂时不可用", response.status === 409 ? 409 : response.status === 400 ? 400 : 503);
      let bytes = 0; const parts: Uint8Array[] = [];
      const reader = response.body?.getReader(); if (!reader) throw new Error("empty response");
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 512 * 1024) { await reader.cancel(); throw new Error("oversize response"); } parts.push(chunk.value); }
      return JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch (error) {
      if (error instanceof ModelConfigError) throw error;
      throw new ModelConfigError("ROUTER_UNAVAILABLE", "Router 管理操作结果待核对，请使用原操作编号重试", 503);
    }
  };
  return {
    async prepare(payload, credentials) {
      const data = await request("POST", "/internal/config/prepare", { ...payload, credentials });
      if (data?.digest !== payload.digest || data?.phase !== "prepared") throw new ModelConfigError("ROUTER_UNAVAILABLE", "Router 准备摘要不一致", 503);
    },
    async activate(id, expectedDigest, digest) { const data = await request("POST", "/internal/config/activate", { id, expectedDigest, digest }); const parsed = statusSchema.safeParse(data); if (!parsed.success || parsed.data.id !== id || parsed.data.digest !== digest) throw new ModelConfigError("ROUTER_UNAVAILABLE", "Router 应用状态无法核对", 503); return parsed.data; },
    async status(id) { if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(id)) throw new ModelConfigError("INVALID_CONFIG", "发布编号无效"); const data = await request("GET", `/internal/config/publications/${encodeURIComponent(id)}`, undefined, true); if (data === null) return null; const parsed = statusSchema.safeParse(data); if (!parsed.success || parsed.data.id !== id) throw new ModelConfigError("ROUTER_UNAVAILABLE", "Router 应用状态无法核对", 503); return parsed.data; },
    async state() { const data = await request("GET", "/internal/config/state"); if (typeof data?.digest !== "string" || data.digest && !/^[a-f0-9]{64}$/.test(data.digest)) throw new ModelConfigError("ROUTER_UNAVAILABLE", "Router 当前版本无法核对", 503); return data.digest; },
    async legacy() { const config = await request("GET", "/internal/config/legacy"); const data = await request("GET", "/internal/config/legacy/credentials"); if (!Array.isArray(data?.credentials)) throw new ModelConfigError("ROUTER_UNAVAILABLE", "Router 导入凭据无法核对", 503); return { config, credentials: data.credentials }; },
    seal(ref, providerID, plain) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from(`${providerID}\0${ref}`)); const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]); return { ref, providerID, ciphertext: { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") } }; },
    open(credential) { try { const { iv, tag, ct } = credential.ciphertext; const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64")); decipher.setAAD(Buffer.from(`${credential.providerID}\0${credential.ref}`)); decipher.setAuthTag(Buffer.from(tag, "base64")); return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8"); } catch { throw new ModelConfigError("CREDENTIAL_UNAVAILABLE", "导入凭据无法解密", 503); } },
  };
}
