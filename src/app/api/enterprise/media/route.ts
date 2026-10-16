import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { teamJson, teamFailure, PRIVATE_HEADERS } from "@/lib/teams/access";
import { enterpriseArtwork } from "@/lib/enterprise/server";
import { enterpriseAuthorize } from "@/lib/enterprise/access";
import { dataUrlToBytes, isManagedImageUrl, readManagedObject } from "@/lib/storage";
import { parseDownloadSource, fetchDownloadSource } from "@/lib/download-source";
import {mediaCacheVersion} from '@/lib/media-cache-version';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const query = z.object({ enterpriseId: z.string().uuid(), email: z.string().min(1).max(254), id: z.string().min(1).max(200) });
export async function GET(request: Request) {
  const actor = await enterpriseAuthorize(request); if (actor instanceof NextResponse) return actor;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return teamJson({ error: "作品参数无效" }, 400);
  let row;
  try { const q = parsed.data; row = await enterpriseArtwork(actor, q.enterpriseId, q.email.trim().toLowerCase(), q.id); }
  catch (error) { return teamFailure(error); }
  try {
    const max = 32 * 1024 * 1024, url = String(row.image_url); let bytes: Buffer;
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
