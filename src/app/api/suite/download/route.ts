import JSZip from "jszip";
import path from "path";
import { isManagedImageUrl, readManagedObject } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

// 服务端打包套图为 ZIP:前端传图片 URL 列表,服务器逐张拉取(server→R2,无跨域)
// 后压成 zip 流回客户端。避免浏览器 fetch 跨域 R2 的 CORS 问题。
type Item = { url: string; name: string };

function safeName(s: string, i: number): string {
  const cleaned = (s || `image-${i + 1}`).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  return cleaned || `image-${i + 1}`;
}

function allowedRemote(u: URL): boolean {
  if (u.protocol !== "https:" || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  return (
    host.endsWith(".r2.dev") ||
    host === "naumi.local" ||
    host.endsWith(".naumi.local")
  );
}

async function readItem(raw: string): Promise<{ buf: Buffer; ext: string } | null> {
  if (isManagedImageUrl(raw)) {
    const object = await readManagedObject(raw, 50 * 1024 * 1024);
    const ext = (path.extname(raw.split("?", 1)[0]).slice(1) || "png").toLowerCase();
    return { buf: object.bytes, ext };
  }
  const u = new URL(raw);
  if (!allowedRemote(u)) return null;
  const res = await fetch(u, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (u.pathname.match(/\.([a-z0-9]+)$/i)?.[1] || "png").toLowerCase();
  return { buf, ext };
}

export async function POST(request: Request) {
  let items: Item[] = [];
  try {
    const body = (await request.json()) as { items?: Item[] };
    items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  } catch {
    return new Response(JSON.stringify({ error: "请求格式不正确" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (items.length === 0) {
    return new Response(JSON.stringify({ error: "没有可下载的图片" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const zip = new JSZip();
  let ok = 0;
  await Promise.all(
    items.map(async (it, i) => {
      try {
        const item = await readItem(it.url);
        if (!item) return;
        zip.file(
          `${String(i + 1).padStart(2, "0")}-${safeName(it.name, i)}.${item.ext}`,
          item.buf
        );
        ok++;
      } catch {
        /* 单张失败跳过 */
      }
    })
  );

  if (ok === 0) {
    return new Response(JSON.stringify({ error: "图片拉取失败" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const blob = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(blob, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="suite-${Date.now()}.zip"`,
      "content-length": String(blob.length),
    },
  });
}
