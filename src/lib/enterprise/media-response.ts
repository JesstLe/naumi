import {NextResponse} from 'next/server';
import sharp from 'sharp';
import {teamJson,PRIVATE_HEADERS} from '@/lib/teams/access';
import {dataUrlToBytes,isManagedImageUrl,readManagedObject} from '@/lib/storage';
import {parseDownloadSource,fetchDownloadSource} from '@/lib/download-source';
import {mediaCacheVersion} from '@/lib/media-cache-version';
/** Authorization precedes this renderer; never accept an image URL from the browser. */
export async function enterpriseMediaResponse(request:Request,imageUrl:string){
  try {
    const max = 32 * 1024 * 1024, url = imageUrl; let bytes: Buffer;
    const expected=new URL(request.url).searchParams.get('cacheVersion');
    if(expected && expected!==await mediaCacheVersion(url))return teamJson({error:'素材版本已改变'},409);
    if (url.length > max * 1.4) throw new Error();
    const inline = dataUrlToBytes(url);
    if (inline) { if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(inline.contentType)) throw new Error(); bytes = Buffer.from(inline.bytes); }
    else if (isManagedImageUrl(url)) bytes = (await readManagedObject(url, max)).bytes;
    else {
      const source = parseDownloadSource(url, new URL(request.url).origin);
      if (source.origin === new URL(request.url).origin) throw new Error();
      const upstream = await fetchDownloadSource(source, AbortSignal.timeout(15000));
      if (!upstream.ok || !upstream.body) throw new Error();
      const reader = upstream.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > max) throw new Error(); chunks.push(next.value); } }
      finally { await reader.cancel().catch(() => {}); }
      bytes = Buffer.concat(chunks);
    }
    if (bytes.length > max) throw new Error();
    const full = new URL(request.url).searchParams.get('full') === '1';
    const output = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: full ? 2560 : 480, height: full ? 2560 : 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return new NextResponse(output, { headers: { ...PRIVATE_HEADERS, "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'" } });
  } catch { return teamJson({ error: "媒体暂时不可读取" }, 422); }
}
