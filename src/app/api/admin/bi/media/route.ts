import { NextResponse } from "next/server";
import sharp from "sharp";
import { biAuthorize, biJson, BI_PRIVATE_HEADERS } from "@/lib/bi/access";
import { getPool } from "@/lib/db";
import { logBiAccess } from "@/lib/bi/repository";
import {
  dataUrlToBytes,
  isManagedImageUrl,
  readManagedObject,
} from "@/lib/storage";
import {
  parseDownloadSource,
  fetchDownloadSource,
} from "@/lib/download-source";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maxBytes = 32 * 1024 * 1024;
export async function GET(request: Request) {
  const auth = await biAuthorize(request);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  if (!id || id.length > 200) return biJson({ error: "作品参数无效" }, 400);
  const result = await getPool().query(
    "SELECT email,image_url FROM app_artworks WHERE id=$1",
    [id],
  );
  const row = result.rows[0];
  if (!row) return biJson({ error: "作品不存在" }, 404);
  try {
    let bytes: Buffer;
    const url = String(row.image_url);
    if (url.length > maxBytes * 1.4) throw new Error("Image too large");
    const inline = dataUrlToBytes(url);
    if (inline) {
      if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(inline.contentType))
        throw new Error("Invalid image");
      bytes = Buffer.from(inline.bytes);
    } else if (isManagedImageUrl(url))
      bytes = (await readManagedObject(url, maxBytes)).bytes;
    else {
      const source = parseDownloadSource(url, new URL(request.url).origin);
      // Same-origin sources must be managed storage; never connect to Host.
      if (source.origin === new URL(request.url).origin)
        throw new Error("Unmanaged media");
      const upstream = await fetchDownloadSource(
        source,
        AbortSignal.timeout(15_000),
      );
      if (!upstream.ok || !upstream.body) throw new Error("Unavailable media");
      const reader = upstream.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maxBytes) throw new Error("Image too large");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      bytes = Buffer.concat(chunks);
    }
    if (bytes.length > maxBytes) throw new Error("Image too large");
    const image = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: params.get("full") === "1" ? 2560 : 480,
        height: params.get("full") === "1" ? 2560 : 480,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    if (params.get("full") === "1")
      await logBiAccess(auth.actor, "view-image", "artworks", row.email);
    return new NextResponse(image, {
      headers: {
        ...BI_PRIVATE_HEADERS,
        "Content-Type": "image/webp",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return biJson({ error: "图片暂时不可读取，原始作品记录仍保留" }, 422);
  }
}
