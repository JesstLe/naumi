import { NextResponse } from "next/server";
import sharp from "sharp";

import { authenticatedEmail } from "@/lib/request-auth";
import {
  addArtworks,
  addLedgerEntry,
  dbEnabled,
  getUser,
  listArtworksByIds,
  refundCredits,
  reserveCredits,
} from "@/lib/db";
import { readCanvasImage } from "@/lib/canvas-image-input";
import { editImage } from "@/lib/image-edit";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { resolutionCost } from "@/lib/mock-data";
import { safeError } from "@/lib/api-error";

// ---------------------------------------------------------------------------
// 画布标注编辑(quick edit)端点。
//
// 前端在原图上叠加箭头/涂抹/编号标注并合成一张标注版图片发来,
// 同时附结构化指令列表。原图 + 标注版双图输入交 gpt-image edit:
// 模型把标注当编辑指令逐条执行,输出干净成图(无 mask,整图理解)。
// 同步返回(与 canvas/text-edit 同款管线),完成后落库 category="canvas-annotate"。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ANNOTATED_BYTES = 12 * 1024 * 1024;

const TYPE_LABEL: Record<string, string> = {
  arrow: "箭头",
  brush: "涂抹",
  text: "编号",
};

function editSize(width: number, height: number) {
  const ratio = width / height;
  return ratio > 1.2 ? "1536x1024" as const : ratio < 0.83 ? "1024x1536" as const : "1024x1024" as const;
}

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`canvas-annotate:${clientIp(request) || "0.0.0.0"}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "标注编辑操作过于频繁，请稍后再试" }, { status: 429 });
  }

  let artworkId = "";
  let annotatedBuf: Buffer | null = null;
  let notes: { type: string; note: string }[] = [];
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) throw new Error("format");
    const form = await request.formData();
    artworkId = String(form.get("artworkId") || "").trim();
    const file = form.get("image");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_ANNOTATED_BYTES) throw new Error("标注图过大");
      annotatedBuf = Buffer.from(await file.arrayBuffer());
    }
    try {
      const parsed = JSON.parse(String(form.get("annotations") || "[]"));
      if (Array.isArray(parsed)) {
        notes = parsed
          .map((item) => ({
            type: TYPE_LABEL[String(item?.type)] ? String(item.type) : "arrow",
            note: String(item?.note || "").trim().slice(0, 300),
          }))
          .filter((item) => item.note);
      }
    } catch {
      /* 注解列表损坏则按空处理 */
    }
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!email || !artworkId || !annotatedBuf || !notes.length) {
    return NextResponse.json({ error: "请先在图上完成标注并填写修改指令" }, { status: 400 });
  }

  const cost = resolutionCost("1K");
  let reserved = false;
  try {
    const artwork = (await listArtworksByIds(email, [artworkId]))[0];
    if (!artwork) return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });
    if (cost > 0) {
      reserved = await reserveCredits(email, cost);
      if (!reserved) return NextResponse.json({ error: "积分不足，请升级方案后重试" }, { status: 402 });
    }

    const image = await readCanvasImage(artwork.image, request.url);
    const original = await sharp(image.buffer).rotate().png().toBuffer();
    const metadata = await sharp(original).metadata();
    const width = metadata.width || artwork.width || 0;
    const height = metadata.height || artwork.height || 0;
    if (!width || !height) throw new Error("无法读取图片尺寸");
    const annotated = await sharp(annotatedBuf).rotate().resize(width, height, { fit: "fill" }).png().toBuffer();

    const instructions = notes.map((item, idx) => `${idx + 1}. （${TYPE_LABEL[item.type]}）${item.note}`).join("\n");
    const prompt = [
      "任务：按标注编辑图片。",
      "第 1 张是原图；第 2 张是在原图上叠加了红色标注（箭头 / 涂抹 / 编号气泡）的标注版。",
      "把每条标注当作一条独立的编辑指令，在原图基础上执行以下修改：",
      instructions,
      "要求：",
      "- 输出修改后的干净完整图片，不允许残留任何箭头、涂抹色块、编号或其它标注痕迹；",
      "- 未被标注的区域 100% 保持原样；",
      "- 修改处与周围的光影、透视、材质、风格自然融合，看不出编辑痕迹。",
    ].join("\n");
    const editedRaw = await editImage({
      images: [original, annotated],
      prompt,
      size: editSize(width, height),
      quality: "high",
    });
    const edited = await sharp(editedRaw).resize(width, height, { fit: "fill" }).png().toBuffer();
    const id = `anno-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let url = `data:image/png;base64,${edited.toString("base64")}`;
    if (storageEnabled) {
      url = await uploadImage(new Uint8Array(edited), "image/png", `canvas-annotates/${id}.png`);
    }
    await addArtworks(email, [{
      id,
      title: `${artwork.title || "图片"} · 标注编辑`,
      category: "canvas-annotate",
      prompt,
      status: "completed",
      image: url,
      gradient: artwork.gradient || "from-rose-100 to-amber-100",
      style: artwork.style ?? null,
      ratio: artwork.ratio ?? null,
      resolution: artwork.resolution ?? "1K",
      source: artwork.image,
      parentId: artwork.id,
      parentIds: [],
      origin: "canvas",
      width,
      height,
    }], `anno-${Date.now()}`);
    if (cost > 0) await addLedgerEntry(email, -cost, "画布标注编辑").catch(() => {});
    const user = await getUser(email).catch(() => null);
    return NextResponse.json({ ok: true, id, width, height, user });
  } catch (error) {
    if (reserved && cost > 0) await refundCredits(email, cost).catch(() => {});
    return NextResponse.json(
      { error: safeError(error, "标注编辑失败，请稍后重试") },
      { status: 502 }
    );
  }
}
