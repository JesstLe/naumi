import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  addArtworks,
  dbEnabled,
  listArtworksByIds,
  setArtworkPosition,
} from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { uploadImage,isManagedImageUrl,readManagedObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STITCH_IMAGES = 12;
const MAX_LONG_EDGE = 24_000;

function allowedRemoteImage(url: URL): boolean {
  for (const base of [
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_IMAGE_BASE_URL,
  ]) {
    if (!base) continue;
    try {
      if (url.host === new URL(base).host) return true;
    } catch {
      /* ignore invalid deployment config */
    }
  }
  return (
    url.protocol === "https:" &&
    (url.host === "images.unsplash.com" || url.host.endsWith(".r2.dev"))
  );
}

async function readArtworkImage(source: string, requestUrl: string): Promise<Buffer> {
  if(isManagedImageUrl(source))return (await readManagedObject(source,32*1024*1024)).bytes;
  const sameOrigin = source.startsWith("/") && !source.startsWith("//");
  const target = sameOrigin ? new URL(source, requestUrl) : new URL(source);
  if (!sameOrigin && !allowedRemoteImage(target)) {
    throw new Error("所选图片来源不允许拼接");
  }
  const response = await fetch(target, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`读取图片失败 (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ error: "未启用作品存储" }, { status: 400 });
  }
  const email = await authenticatedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { ids?: unknown; title?: unknown; x?: unknown; y?: unknown }
    | null;
  const ids = Array.isArray(body?.ids)
    ? Array.from(new Set(body.ids.map(String).map((id) => id.trim()).filter(Boolean)))
    : [];
  if (ids.length < 2 || ids.length > MAX_STITCH_IMAGES) {
    return NextResponse.json(
      { error: `请选择 2–${MAX_STITCH_IMAGES} 张图片` },
      { status: 400 }
    );
  }

  try {
    const found = await listArtworksByIds(email, ids);
    const byId = new Map(found.map((artwork) => [artwork.id, artwork]));
    const artworks = ids.map((id) => byId.get(id)).filter(Boolean) as typeof found;
    if (artworks.length !== ids.length) throw new Error("部分图片不存在或无权访问");
    const groupIds = new Set(artworks.map((artwork) => artwork.groupId || artwork.id));
    if (groupIds.size !== 1) throw new Error("只能拼接同一画布项目中的图片");

    const sources = await Promise.all(
      artworks.map((artwork) => readArtworkImage(artwork.image, request.url))
    );
    const metadata = await Promise.all(sources.map((input) => sharp(input).rotate().metadata()));
    let targetWidth = Math.min(
      1536,
      Math.max(...metadata.map((meta) => meta.width || 1024))
    );
    const estimatedHeight = metadata.reduce((sum, meta) => {
      const width = meta.width || targetWidth;
      const height = meta.height || targetWidth;
      return sum + Math.round((height / width) * targetWidth);
    }, 0);
    if (estimatedHeight > MAX_LONG_EDGE) {
      targetWidth = Math.max(640, Math.floor(targetWidth * (MAX_LONG_EDGE / estimatedHeight)));
    }

    const panels = await Promise.all(
      sources.map((input) =>
        sharp(input)
          .rotate()
          .resize({ width: targetWidth, withoutEnlargement: false })
          .flatten({ background: "#ffffff" })
          .png()
          .toBuffer({ resolveWithObject: true })
      )
    );
    const totalHeight = panels.reduce((sum, panel) => sum + panel.info.height, 0);
    const longImage = await sharp({
      create: {
        width: targetWidth,
        height: totalHeight,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite(
        panels.map((panel, index) => ({
          input: panel.data,
          left: 0,
          top: panels.slice(0, index).reduce((sum, previous) => sum + previous.info.height, 0),
        }))
      )
      .png()
      .toBuffer();

    const id = `canvas-long-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const image = await uploadImage(
      new Uint8Array(longImage),
      "image/png",
      `canvas-stitches/${id}.png`,undefined,email
    );
    const title = String(body?.title || `详情长图 · ${ids.length} 张`).trim().slice(0, 80);
    await addArtworks(email, [
      {
        id,
        title,
        category: "detail",
        creationProvenance: { version: 1, operation: "canvas-stitch", entry: "canvas", ref: id, evidence: "server-route" },
        prompt: `按画布顺序纵向拼接 ${ids.length} 张详情图`,
        status: "completed",
        image,
        gradient: "from-slate-100 to-white",
        ratio: "long",
        resolution: "1K",
        source: "derived",
        parentId: ids[0],
        parentIds: ids.slice(1),
        origin: "canvas",
      },
    ]);
    const x = Number(body?.x);
    const y = Number(body?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      await setArtworkPosition(email, id, x, y);
    }
    return NextResponse.json({ ok: true, id, image, width: targetWidth, height: totalHeight });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "详情长图拼接失败" },
      { status: 500 }
    );
  }
}
