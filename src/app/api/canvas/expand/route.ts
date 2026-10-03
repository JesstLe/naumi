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
import { storageEnabled, uploadImage } from "@/lib/storage";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";

// ---------------------------------------------------------------------------
// 画布扩图(outpaint)端点。
//
// 原图不动,按目标比例 + 锚点求最小外扩画布;透明大画布贴原图作为输入,
// mask 全不透明并挖空原图区域(透明 = 待生成),交 gpt-image edit 补全四周。
// 同步返回(与 canvas/text-edit 同款管线),完成后落库 category="canvas-expand"。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_LONG_SIDE = 4096;

const ANCHORS = new Set(["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"]);

function anchorOffset(anchor: string, padX: number, padY: number) {
  const horiz = anchor.endsWith("w") ? 0 : anchor.endsWith("e") ? padX : Math.round(padX / 2);
  const vert = anchor.startsWith("n") ? 0 : anchor.startsWith("s") ? padY : Math.round(padY / 2);
  return { x: horiz, y: vert };
}

function editSize(width: number, height: number) {
  const ratio = width / height;
  return ratio > 1.2 ? "1536x1024" as const : ratio < 0.83 ? "1024x1536" as const : "1024x1024" as const;
}

async function handleObservedPost(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`canvas-expand:${clientIp(request) || "0.0.0.0"}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "扩图操作过于频繁，请稍后再试" }, { status: 429 });
  }

  let requestedQuality: unknown;
  let input: { artworkId: string; ratio: string; anchor: string };
  try {
    const body = (await request.json()) as Partial<typeof input>;
    requestedQuality = (body as typeof body & {quality?:unknown}).quality;
    input = {
      artworkId: String(body.artworkId || "").trim(),
      ratio: String(body.ratio || "").trim(),
      anchor: String(body.anchor || "center").trim(),
    };
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const ratioMatch = input.ratio.match(/^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/);
  if (!email || !input.artworkId || !ratioMatch) {
    return NextResponse.json({ error: "请选择图片与目标比例" }, { status: 400 });
  }
  if (!ANCHORS.has(input.anchor)) input.anchor = "center";
  const ratioW = Number(ratioMatch[1]);
  const ratioH = Number(ratioMatch[2]);
  if (ratioW <= 0 || ratioH <= 0) return NextResponse.json({ error: "目标比例无效" }, { status: 400 });

  const quality = requestImageQuality(request, requestedQuality);
  let cost = 0;
  let reserved = false;
  try {
    const artwork = (await listArtworksByIds(email, [input.artworkId]))[0];
    if (!artwork) return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });


    const image = await readCanvasImage(artwork.image, request.url);
    let original = await sharp(image.buffer).rotate().png().toBuffer();
    const meta = await sharp(original).metadata();
    let width = meta.width || artwork.width || 0;
    let height = meta.height || artwork.height || 0;
    if (!width || !height) throw new Error("无法读取图片尺寸");

    // 原比例已接近目标比例则拒绝(在预扣积分之前,避免白扣)
    if (Math.abs(width / height - ratioW / ratioH) / (ratioW / ratioH) < 0.02) {
      return NextResponse.json({ error: "当前图片已是该比例，无需扩图" }, { status: 400 });
    }

    cost = (await imageRequestBilling(request, requestedQuality, artwork.resolution || "1K")).cost;
    if (cost > 0) {
      reserved = await reserveCredits(email, cost);
      if (!reserved) return NextResponse.json({ error: "积分不足，请联系管理员补充额度" }, { status: 402 });
    }

    // 最小外扩:先按高定宽,不够再按宽定高(只外扩不裁切)
    let targetW = Math.round((height * ratioW) / ratioH);
    let targetH = height;
    if (targetW < width) {
      targetW = width;
      targetH = Math.round((width * ratioH) / ratioW);
    }
    // 超长边上限:整体等比缩小(原图跟着缩,相对位置不变)
    const long = Math.max(targetW, targetH);
    if (long > MAX_LONG_SIDE) {
      const scale = MAX_LONG_SIDE / long;
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
      const scaledW = Math.max(1, Math.round(width * scale));
      const scaledH = Math.max(1, Math.round(height * scale));
      original = await sharp(original).resize(scaledW, scaledH, { kernel: "lanczos3" }).png().toBuffer();
      width = scaledW;
      height = scaledH;
    }

    const { x, y } = anchorOffset(input.anchor, targetW - width, targetH - height);
    const padded = await sharp({
      create: { width: targetW, height: targetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: original, left: x, top: y }])
      .png()
      .toBuffer();
    // mask 语义(OpenAI):透明 = 待生成,不透明 = 保留。
    // 扩图要保原图、生成四周 → 透明大画布上只贴原图大小的实心块。
    const keep = await sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const mask = await sharp({
      create: { width: targetW, height: targetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: keep, left: x, top: y }])
      .png()
      .toBuffer();

    const prompt = [
      "任务：扩图。把图片四周的空白透明区域自然填充为完整画面，向外交互延展场景内容。",
      "要求：",
      "- 原图已有内容 100% 保持不变，构图、主体、位置都不移动；",
      "- 新增区域与原图在风格、光影、透视、色调、景深上完全一致，衔接处过渡自然；",
      "- 新增内容应合理延续原图场景（地面/墙面/天空/环境），不要出现纯色带、黑边、白边、重复条纹；",
      "输出填充完整后的矩形图片。",
    ].join("\n");
    const editedRaw = await editImage({
      images: [padded],
      mask,
      prompt,
      size: editSize(targetW, targetH),
      quality,
    });
    const edited = await sharp(editedRaw).resize(targetW, targetH, { fit: "fill" }).png().toBuffer();
    const id = `exp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let url = `data:image/png;base64,${edited.toString("base64")}`;
    if (storageEnabled) {
      url = await uploadImage(new Uint8Array(edited), "image/png", `canvas-expands/${id}.png`);
    }
    await addArtworks(email, [{
      id,
      title: `${artwork.title || "图片"} · 扩图`,
      category: "canvas-expand",
      prompt,
      status: "completed",
      image: url,
      gradient: artwork.gradient || "from-sky-100 to-emerald-100",
      style: artwork.style ?? null,
      ratio: `${ratioW}:${ratioH}`,
      resolution: artwork.resolution ?? "1K",
      source: artwork.image,
      parentId: artwork.id,
      parentIds: [],
      origin: "canvas",
      width: targetW,
      height: targetH,
    }], `exp-${Date.now()}`);
    await settleToolImage(email, cost, "画布扩图", quality, id, artwork.resolution || "1K");
    const user = await getUser(email).catch(() => null);
    return NextResponse.json({ ok: true, id, width: targetW, height: targetH, user, cost, quality });
  } catch (error) {
    if (reserved && cost > 0) await refundCredits(email, cost).catch(() => {});
    return NextResponse.json(
      { error: safeError(error, "扩图失败，请稍后重试") },
      { status: 502 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingRequest(request,"canvas.expand",()=>billingRoutePost(request));}
