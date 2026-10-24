import { NextResponse } from "next/server";
import sharp from "sharp";
import { ARTWORK_INPUT_COLUMNS, ARTWORK_INPUT_JOINS, artworkInputs } from "@/lib/bi/artwork-inputs";
import { readImagegenInputAsset } from "@/lib/imagegen/input-assets";
import { biAuthorize, biJson, BI_PRIVATE_HEADERS } from "@/lib/bi/access";
import { getPool } from "@/platform/db/pool";
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
  const slot = params.get("slot") || "result";
  const indexText = params.get("index") || "0";
  if (!["result", "input"].includes(slot) || !/^(0|[1-9]\d?)$/.test(indexText))
    return biJson({ error: "图片参数无效" }, 400);
  const result = await getPool().query(
    `SELECT a.email,a.image_url,a.creation_provenance,a.source_url,j.kind AS job_kind,c.kind AS canvas_task_kind,
      ${ARTWORK_INPUT_COLUMNS} FROM app_artworks a ${ARTWORK_INPUT_JOINS} WHERE a.id=$1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return biJson({ error: "作品不存在" }, 404);
  try {
    let bytes: Buffer;
    let url = String(row.image_url);
    if (slot === "input") {
      const input = artworkInputs(row).inputs[Number(indexText)];
      if (!input) return biJson({ error: "原图记录不存在" }, 404);
      if (input.url) {
        // Frozen durable input pointers must be managed; never accept a client URL.
        if (!isManagedImageUrl(input.url)) return biJson({ error: "原图记录不可读取" }, 422);
        url = input.url;
      } else if (!input.artworkId) {
        return biJson({ error: "原图记录无效" }, 422);
      } else if (input.artworkId.startsWith("asset-")) {
        url = (await readImagegenInputAsset(input.artworkId, row.email)).url;
      } else {
        const source = (await getPool().query("SELECT image_url FROM app_artworks WHERE id=$1 AND email=$2", [input.artworkId,row.email])).rows[0];
        if (!source?.image_url) return biJson({ error: "原图已失效" }, 404);
        url = String(source.image_url);
      }
    }
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
      await logBiAccess(auth.actor, slot === "input" ? "view-input-image" : "view-image", "artworks", row.email);
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
