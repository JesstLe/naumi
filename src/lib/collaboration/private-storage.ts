import 'server-only';
import { createObjectStorage, type ObjectStorage } from '@/lib/object-storage/adapter';
import { storageConfiguration } from '@/lib/object-storage/config';

/** Reuse the site's storage adapter/credentials, never its public URL or image-only API.
 * Bytes use the already blocked internal namespace; /media rejects it even when
 * MEDIA_PRIVATE is later switched off. Local storage stays on the existing durable
 * media mount (not an unmounted sibling directory in a disposable Web container).
 * Legacy public S3/R2 installations keep chat bytes on the private local store.
 */
export function collaborationStorage() {
  const config = storageConfiguration(process.env);
  const local = createObjectStorage({ ...config, driver: 'local', enabled: true, privateMedia: true });
  const managed = config.driver !== 'local' && config.privateMedia && !config.publicBase ? createObjectStorage(config) : null;
  return {
    selected: managed ? 'managed' as const : 'local' as const,
    backend(location: string): ObjectStorage {
      if (location === 'local') return local;
      if (location === 'managed' && managed) return managed;
      throw Object.assign(new Error('原私有存储配置尚未就绪'), { status: 503 });
    },
    key(uploadId: string, partId: string) { return `image-job-results/collaboration/${uploadId}/${partId}`; },
  };
}

export async function readBoundedBody(request: Request, max: number): Promise<Buffer> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) throw Object.assign(new Error('分块超过大小限制'), { status: 413 });
  const reader = request.body?.getReader(); if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength; if (bytes > max) throw Object.assign(new Error('分块超过大小限制'), { status: 413 }); chunks.push(next.value);
    }
    return Buffer.concat(chunks, bytes); // bounded to ONE configured part, never the complete file
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function detectedMedia(bytes: Buffer, filename: string) {
  if (/\.(?:svg|svgz|html?|xhtml|xml|js|mjs)$/i.test(filename)) return { mime: 'application/octet-stream', inline: false };
  let mime = '';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
  else if (['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) mime = 'image/gif';
  else if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
  else if (bytes.subarray(4, 8).toString('ascii') === 'ftyp' && /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(bytes.subarray(8, 12).toString('ascii'))) mime = 'video/mp4';
  else if (bytes.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) && bytes.subarray(0, 128).includes(Buffer.from('webm'))) mime = 'video/webm';
  return { mime: mime || 'application/octet-stream', inline: !!mime };
}
export function attachmentRange(raw: string | null, size: number): { start: number; end: number; partial: boolean } {
  if (!raw) return { start: 0, end: size - 1, partial: false };
  const m = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  const fail = () => { throw Object.assign(new Error('Range 无效'), { status: 416 }); };
  if (!m || !m[1] && !m[2] || size === 0) return fail();
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || !m[1] && Number(m[2]) === 0) return fail();
  return { start, end, partial: true };
}
export function disposition(name: string, inline: boolean) {
  const ascii = name.replace(/[^\w. -]/g, '_').slice(0, 180);
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
