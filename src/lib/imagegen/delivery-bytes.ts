import { Buffer } from "node:buffer";

type DecodedImage = { bytes: Uint8Array; contentType: string };
type DeliveryImage = { bytes: Buffer; contentType: string };

/** Owned by one delivery attempt, never a process/global cache. Only the active
 * batch is retained; a changed URL is a different byte identity. Callers treat
 * returned bytes as read-only and retire them after persistence or failure. */
export function createImageDeliveryBytes(decode: (url: string) => DecodedImage | null) {
  const entries = new Map<string, DeliveryImage>();
  return {
    read(url: string): DeliveryImage | null {
      const existing = entries.get(url);
      if (existing) return existing;
      const decoded = decode(url);
      if (!decoded) return null;
      const { bytes, contentType } = decoded;
      const value = { bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), contentType };
      entries.set(url, value);
      return value;
    },
    encode(bytes: Buffer, contentType: string): string {
      const url = `data:${contentType};base64,${bytes.toString("base64")}`;
      entries.set(url, { bytes, contentType });
      return url;
    },
    retain(urls: Iterable<string>) {
      const active = new Set(urls);
      for (const url of entries.keys()) if (!active.has(url)) entries.delete(url);
    },
    release(url: string) { entries.delete(url); },
    clear() { entries.clear(); },
  };
}

export type ImageDeliveryBytes = ReturnType<typeof createImageDeliveryBytes>;
