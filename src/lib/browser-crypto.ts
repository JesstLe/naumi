import {webBytes} from "@/platform/bytes/web";
import { sha256 } from "@noble/hashes/sha256";

/** HTTP origins lack SubtleCrypto. Keep exactly the same SHA-256 on both paths. */
export async function browserSha256Hex(value: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const hash = subtle
    ? new Uint8Array(await subtle.digest("SHA-256", webBytes(value)))
    : sha256(value);
  return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** getRandomValues remains available on HTTP; never weaken IDs to Math.random. */
export function browserRandomUUID(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== "function") {
    throw new Error("浏览器不支持随机请求编号，请更新浏览器后重试");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
