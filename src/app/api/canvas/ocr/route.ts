import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requestedTextModel } from "@/lib/text-models";
import sharp from "sharp";

import { authenticatedEmail } from "@/lib/request-auth";
import { dbEnabled, listArtworksByIds } from "@/lib/db";
import { readCanvasImage } from "@/lib/canvas-image-input";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { toVisionDataUrl } from "@/lib/vision-image";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-error";
import { collectPaddleRows, normalizeOcrSegments, scaleOcrSegments } from "@/lib/canvas-ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function paddleOcr(buffer: Buffer, mimeType: string) {
  const endpoint = (process.env.PADDLE_OCR_BASE_URL || "").trim();
  if (!endpoint) return null;
  const timeoutMs = Math.max(5_000, Math.min(120_000, Number(process.env.PADDLE_OCR_TIMEOUT_MS) || 35_000));
  const maxAttempts = Math.max(1, Math.min(4, Number(process.env.PADDLE_OCR_MAX_ATTEMPTS) || 2));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(buffer)], "canvas-image.png", { type: mimeType }));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: process.env.PADDLE_OCR_API_KEY
          ? { Authorization: `Bearer ${process.env.PADDLE_OCR_API_KEY}` }
          : undefined,
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await response.text();
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const error = new Error(`PaddleOCR 返回 ${response.status}：${raw.slice(0, 240)}`);
        if (!retryable) throw error;
        lastError = error;
      } else {
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { throw new Error("PaddleOCR 返回了无效 JSON"); }
        return { rows: collectPaddleRows(parsed), attempts: attempt };
      }
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /返回 4\d\d/.test(error.message) && !/返回 (408|429)/.test(error.message)) throw error;
    }
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("PaddleOCR 请求失败");
}

async function visionOcr(buffer: Buffer, width: number, height: number, model: string) {
  const prepared = await sharp(buffer)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const scanWidth = prepared.info.width || width;
  const scanHeight = prepared.info.height || height;
  const settings = await getOpenAISettings();
  // OCR belongs to the image workflow: prefer the configured OpenAI-compatible
  // image gateway. The agent gateway can be independently unavailable (for
  // example, a mainland host timing out against it), so it is only a fallback.
  const apiKey = settings.apiKey || process.env.AGENT_API_KEY;
  if (!apiKey) throw new Error("OCR 服务和视觉模型均未配置");
  const client = new OpenAI({
    apiKey,
    baseURL: (await getOpenAIBaseUrl()) || process.env.AGENT_BASE_URL || undefined,
    timeout: 45_000,
    maxRetries: 0,
  });
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    { type: "text", text: `所见图片尺寸 ${scanWidth}×${scanHeight} 像素。扫描整张图片，一次性提取全部文字和像素坐标框。` },
    { type: "image_url", image_url: { url: await toVisionDataUrl(prepared.data, "image/jpeg"), detail: "high" } },
  ];
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 3000,
    messages: [
      {
        role: "system",
        content:
          "你是图片 OCR 服务。识别图片中所有可见文字，并返回严格 JSON，不要 Markdown。格式：{\"segments\":[{\"text\":\"原文\",\"confidence\":0到1,\"box\":{\"x\":整数,\"y\":整数,\"width\":整数,\"height\":整数}}]}。坐标必须使用原图像素，覆盖每段文字的最小外接矩形；不要翻译，不要合并相距较远的文字。",
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  });
  const content = response.choices[0]?.message?.content || "";
  const json = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = json.indexOf("{");
  const end = json.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("视觉 OCR 返回格式不正确");
  return {
    raw: JSON.parse(json.slice(start, end + 1)) as unknown,
    scanWidth,
    scanHeight,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`canvas-ocr:${clientIp(request) || "0.0.0.0"}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "OCR 操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let artworkId = "";
  try {
    artworkId = String(((await request.json()) as { artworkId?: string }).artworkId || "").trim();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!artworkId || !email) return NextResponse.json({ error: "缺少图片节点" }, { status: 400 });

  try {
    const artwork = (await listArtworksByIds(email, [artworkId]))[0];
    if (!artwork) return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });
    const image = await readCanvasImage(artwork.image, request.url);
    const metadata = await sharp(image.buffer).metadata();
    const width = metadata.width || artwork.width || 0;
    const height = metadata.height || artwork.height || 0;
    if (!width || !height) throw new Error("无法读取图片尺寸");

    let engine = "paddleocr";
    let raw: unknown;
    let scanSize: { width: number; height: number } | null = null;
    let paddleAttempts = 0;
    let fallbackReason = "";
    try {
      const paddle = await paddleOcr(image.buffer, image.mimeType);
      if (!paddle) throw new Error("PaddleOCR 未配置");
      raw = paddle.rows;
      paddleAttempts = paddle.attempts;
      if (!paddle.rows.length) throw new Error("PaddleOCR 返回空结果");
    } catch (error) {
      if (process.env.PADDLE_OCR_REQUIRED === "true") throw error;
      engine = "vision-fallback";
      fallbackReason = safeError(error, "PaddleOCR 暂不可用").slice(0, 160);
      console.warn(`[canvas-ocr] paddle fallback artwork=${artworkId} reason=${fallbackReason}`);
      const vision = await visionOcr(
        image.buffer,
        width,
        height,
        requestedTextModel(
          request,
          process.env.PADDLE_OCR_FALLBACK_MODEL || process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna"
        )
      );
      raw = vision.raw;
      scanSize = { width: vision.scanWidth, height: vision.scanHeight };
    }
    const minConfidence = Math.max(0, Math.min(1, Number(process.env.PADDLE_OCR_MIN_CONFIDENCE) || 0.12));
    let segments = normalizeOcrSegments(raw, scanSize?.width ?? width, scanSize?.height ?? height, {
      minConfidence: engine === "paddleocr" ? minConfidence : 0,
      maxSegments: 500,
    });
    if (scanSize) {
      segments = scaleOcrSegments(segments, scanSize, { width, height });
    }
    if (!segments.length) throw new Error("未识别到可编辑文字，请换一张更清晰的图片重试");
    const elapsedMs = Date.now() - startedAt;
    console.info(`[canvas-ocr] artwork=${artworkId} engine=${engine} segments=${segments.length} attempts=${paddleAttempts} elapsed=${elapsedMs}ms`);
    return NextResponse.json({
      ok: true,
      engine,
      image: { width, height },
      segments: segments.map((segment, index) => ({ id: `ocr-${index + 1}`, ...segment })),
      diagnostics: { elapsedMs, paddleAttempts, fallback: engine !== "paddleocr", fallbackReason },
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "图片文字识别失败，请稍后重试") },
      { status: 502 }
    );
  }
}
