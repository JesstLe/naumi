import { canvasParameterError } from "@/lib/canvas/generation-parameters";
import {withBillingRequest,synchronousChargedCredits} from "@/lib/billing/synchronous";
import { withBiRequest } from "@/lib/bi/model-observer";
import { imageRequestBilling, requestImageQuality, settleToolImage } from "@/lib/image-quality-request";
import { NextResponse } from "next/server";
import sharp from "sharp";

import { authenticatedEmail } from "@/lib/request-auth";
import {
  addArtworks,
  dbEnabled,
  getUser,
  listArtworksByIds,
  refundCredits,
  reserveCredits,
} from "@/lib/db";
import { readCanvasImage } from "@/lib/canvas-image-input";
import { editImage } from "@/lib/image-edit";
import {canvasEditedImage} from "@/lib/canvas/edited-image-output";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { safeError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Box = { x: number; y: number; width: number; height: number };

function clampBox(box: Box, imageWidth: number, imageHeight: number) {
  const padding = Math.max(4, Math.round(Math.max(box.width, box.height) * 0.12));
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(box.x) - padding));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(box.y) - padding));
  const right = Math.max(x + 1, Math.min(imageWidth, Math.round(box.x + box.width) + padding));
  const bottom = Math.max(y + 1, Math.min(imageHeight, Math.round(box.y + box.height) + padding));
  return { x, y, width: right - x, height: bottom - y };
}

function editSize(width: number, height: number) {
  const ratio = width / height;
  return ratio > 1.2 ? "1536x1024" as const : ratio < 0.83 ? "1024x1536" as const : "1024x1024" as const;
}

async function handleObservedPost(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let requestedQuality: unknown;
  let input: { artworkId: string; oldText: string; newText: string; box: Box };
  try {
    const body = (await request.json()) as Partial<typeof input>;
    requestedQuality = (body as typeof body & {quality?:unknown}).quality;
    input = {
      artworkId: String(body.artworkId || "").trim(),
      oldText: String(body.oldText || "").trim().slice(0, 300),
      newText: String(body.newText || "").trim().slice(0, 300),
      box: {
        x: Number(body.box?.x),
        y: Number(body.box?.y),
        width: Number(body.box?.width),
        height: Number(body.box?.height),
      },
    };
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!email || !input.artworkId || !input.oldText || !input.newText) {
    return NextResponse.json({ error: "请选择文字并输入新内容" }, { status: 400 });
  }
  if (![input.box.x, input.box.y, input.box.width, input.box.height].every(Number.isFinite) || input.box.width <= 0 || input.box.height <= 0) {
    return NextResponse.json({ error: "OCR 文字坐标无效" }, { status: 400 });
  }

  const quality = requestImageQuality(request, requestedQuality);
  let cost = 0;
  let reserved = false;
  try {
    const artwork = (await listArtworksByIds(email, [input.artworkId]))[0];
    if (!artwork) return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });
    cost = (await imageRequestBilling(request, requestedQuality, artwork.resolution || "1K")).cost;
    if (cost > 0) {
      reserved = await reserveCredits(email, cost);
      if (!reserved) return NextResponse.json({ error: "积分不足，请联系管理员补充额度" }, { status: 402 });
    }

    const image = await readCanvasImage(artwork.image, request.url, email);
    const original = await sharp(image.buffer).rotate().png().toBuffer();
    const metadata = await sharp(original).metadata();
    const width = metadata.width || artwork.width || 0;
    const height = metadata.height || artwork.height || 0;
    if (!width || !height) throw new Error("无法读取图片尺寸");
    const box = clampBox(input.box, width, height);
    const clear = await sharp({
      create: { width: box.width, height: box.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const mask = await sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).composite([{ input: clear, left: box.x, top: box.y, blend: "dest-out" }]).png().toBuffer();
    const location = `原图 ${width}×${height} 像素中的矩形区域：x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`;
    const prompt = [
      "任务：编辑图片，只修改指定区域的文字，图片其余所有画面100%保持原样，不要改动产品、光影、材质、背景。",
      "要求：字体风格、颜色、光影、质感、透视和原图完全匹配。",
      `需要修改的区域：${location}`,
      `旧文字：${input.oldText}`,
      `新文字：${input.newText}`,
      "禁止改动其他任何元素，不要增加物体，不要改变背景、产品包装、3D数字。",
    ].join("\n");
    const editedRaw = await editImage({
      images: [original],
      mask,
      prompt,
      size: editSize(width, height),
      sourceFrame: {width,height},
      quality,
    });
    const result = await canvasEditedImage(editedRaw);
    const edited = result.bytes;
    const id = `txtedit-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let url = `data:image/png;base64,${edited.toString("base64")}`;
    if (storageEnabled) {
      url = await uploadImage(new Uint8Array(edited), "image/png", `canvas-text-edits/${id}.png`);
    }
    await addArtworks(email, [{
      id,
      title: `${artwork.title || "图片"} · 改字`,
      category: "canvas-text-edit",
      prompt,
      status: "completed",
      image: url,
      gradient: artwork.gradient || "from-slate-100 to-sky-100",
      style: artwork.style ?? null,
      ratio: result.ratio,
      resolution: artwork.resolution ?? "1K",
      source: artwork.image,
      parentId: artwork.id,
      parentIds: [],
      origin: "canvas",
      width: result.width,
      height: result.height,
    }], `txtedit-${Date.now()}`);
    await settleToolImage(email, cost, "画布在线改字", quality, id, artwork.resolution || "1K");
    const user = await getUser(email).catch(() => null);
    return NextResponse.json({ ok: true, id, width:result.width, height:result.height, user, cost, quality });
  } catch (error) {
    if (reserved && cost > 0) await refundCredits(email, cost).catch(() => {});
    return NextResponse.json(
      { error: safeError(error, "在线改字失败，请稍后重试") },
      { status: 502 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){const invalid = await canvasParameterError(request); if (invalid) return invalid; return withBillingRequest(request,"canvas.text-edit",()=>billingRoutePost(request));}
