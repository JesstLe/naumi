import { NextResponse } from "next/server";
import { dbEnabled, addArtworks, setArtworkPosition, listArtworksByIds } from "@/lib/db";
import { provenanceEntry } from "@/lib/artwork-provenance";
import { uploadImage } from "@/lib/storage";
import { authenticatedEmail } from "@/lib/request-auth";
import { adaptiveCanvasImageSize } from "@/lib/mock-data";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRADIENTS = [
  "from-rose-100 to-slate-100",
  "from-emerald-100 to-teal-100",
  "from-sky-100 to-indigo-100",
  "from-amber-100 to-orange-100",
];

function newId() {
  return `art-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// 新增作品(画布用):
//  - multipart(含 image 文件)= 上传图片作新节点(默认根节点,或挂 parentId)
//  - json {src} = 创建副本 / 复制粘贴节点(复制源图与血缘)
// email 限定,沿用本站信任模式。
export async function POST(request: Request) {
  if (!dbEnabled)
    return NextResponse.json({ error: "未启用存储" }, { status: 400 });

  const ctype = request.headers.get("content-type") || "";
  const authenticated = await authenticatedEmail(request);
  if (!authenticated) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  // ── 上传图片作节点 ──
  if (ctype.includes("multipart/form-data")) {
    let fd: FormData;
    try {
      fd = await request.formData();
    } catch {
      return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
    }
    const email = authenticated;
    const parentId = String(fd.get("parentId") ?? "").trim() || null;
    const title = String(fd.get("title") ?? "").trim() || "上传图片";
    // linked=1(拉线建的)→ 画连线(source≠canvas-add);否则独立无线
    const linked = String(fd.get("linked") ?? "") === "1";
    const canvasGroupId = String(fd.get("canvasGroupId") ?? "").trim().slice(0, 120) || null;
    const px = Number(fd.get("x"));
    const py = Number(fd.get("y"));
    const file = fd.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "图片过大(≤12MB)" }, { status: 400 });
    }
    const id = newId();
    const buf = new Uint8Array(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(Buffer.from(buf)).rotate().metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      return NextResponse.json({ error: "图片格式无效" }, { status: 400 });
    }
    const type = file.type || "image/png";
    const ext = type.includes("png")
      ? "png"
      : type.includes("webp")
        ? "webp"
        : "jpg";
    let url: string;
    try {
      url = await uploadImage(buf, type, `canvas-uploads/${id}.${ext}`);
    } catch {
      return NextResponse.json({ error: "上传失败" }, { status: 500 });
    }
    try {
      const canvasSize = adaptiveCanvasImageSize(width, height);
      await addArtworks(email, [
        {
          id,
          title,
          category: "main",
          creationProvenance: { version: 1, operation: "upload", entry: provenanceEntry(fd.get("entry"), "canvas"), ref: id, evidence: "server-route" },
          prompt: "",
          status: "completed",
          image: url,
          gradient: GRADIENTS[0],
          parentId,
          source: linked ? "upload" : "canvas-add",
          canvasGroupId,
          width,
          height,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
        },
      ]);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }
    if (Number.isFinite(px) && Number.isFinite(py)) {
      await setArtworkPosition(email, id, px, py).catch(() => {});
    }
    const canvasSize = adaptiveCanvasImageSize(width, height);
    return NextResponse.json({
      ok: true,
      id,
      image: url,
      width,
      height,
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      canvasGroupId,
    });
  }

  // ── 创建副本 / 粘贴节点 ──
  let body: {
    entry?: string;
    email?: string;
    parentId?: string | null; // 顶层覆盖:落到当前项目某父节点下
    linked?: boolean; // true=画连线(衍生);false/缺省=独立节点(canvas-add,不连线)
    x?: number;
    y?: number;
    src?: {
      id?: string;
      image?: string;
      videoUrl?: string | null;
      title?: string;
      category?: string;
      prompt?: string;
      style?: string;
      ratio?: string;
      resolution?: string;
      parentId?: string | null;
      templateId?: string | null;
      width?: number | null;
      height?: number | null;
      canvasWidth?: number | null;
      canvasHeight?: number | null;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const email = authenticated;
  const src = body.src;
  const image = String(src?.image || "").trim();
  const videoUrl = String(src?.videoUrl || "").trim() || null;
  if (!src || (!image && !videoUrl)) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }
  const id = newId();
  const sourceId = String(src.id || "").trim().slice(0, 240);
  if (sourceId) {
    const original = (await listArtworksByIds(email, [sourceId]))[0];
    if (!original || original.image !== image || (original.videoUrl || null) !== videoUrl)
      return NextResponse.json({ error: "复制源作品不存在或不匹配" }, { status: 404 });
  }
  // 顶层 parentId(从历史加到当前项目)优先于 src.parentId(纯副本)
  const parentId =
    body.parentId !== undefined ? body.parentId : (src.parentId ?? null);
  const canvasSize =
    src.canvasWidth && src.canvasHeight
      ? { width: src.canvasWidth, height: src.canvasHeight }
      : adaptiveCanvasImageSize(src.width, src.height);
  try {
    await addArtworks(email, [
      {
        id,
        title: src.title || "作品",
        category: src.category || "main",
        creationProvenance: { version: 1, operation: sourceId ? "copy" : src.templateId ? "template" : "import", entry: provenanceEntry(body.entry, "canvas"), ref: id, ...(sourceId ? { sourceArtworkId: sourceId } : {}), evidence: "server-route" },
        prompt: src.prompt || "",
        status: "completed",
        image,
        videoUrl,
        gradient: GRADIENTS[1],
        style: src.style,
        ratio: src.ratio,
        resolution: src.resolution,
        parentId,
        templateId: src.templateId ?? null,
        width: src.width ?? null,
        height: src.height ?? null,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
        // linked → 非 canvas-add(画布会画连线);否则独立节点
        source: body.linked ? "derived" : "canvas-add",
      },
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
  const bx = Number(body.x);
  const by = Number(body.y);
  if (Number.isFinite(bx) && Number.isFinite(by)) {
    await setArtworkPosition(email, id, bx, by).catch(() => {});
  }
  return NextResponse.json({
    ok: true,
    id,
    image,
    videoUrl,
    width: src.width ?? null,
    height: src.height ?? null,
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
  });
}
