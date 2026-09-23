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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Box = { x: number; y: number; width: number; height: number };
type OcrSegment = { text: string; confidence: number; box: Box };

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function boxFromUnknown(value: unknown): Box | null {
  if (Array.isArray(value) && value.length >= 4 && value.every((item) => !Array.isArray(item))) {
    const [x, y, width, height] = value.map(finite);
    return { x, y, width, height };
  }
  if (Array.isArray(value) && value.length >= 2 && value.every(Array.isArray)) {
    const points = value as unknown[][];
    const xs = points.map((point) => finite(point[0]));
    const ys = points.map((point) => finite(point[1]));
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  if (value && typeof value === "object") {
    const box = value as Record<string, unknown>;
    const x = finite(box.x ?? box.left);
    const y = finite(box.y ?? box.top);
    const width = finite(box.width ?? (finite(box.right) - x));
    const height = finite(box.height ?? (finite(box.bottom) - y));
    return { x, y, width, height };
  }
  return null;
}

function normalizeSegments(input: unknown, imageWidth: number, imageHeight: number): OcrSegment[] {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === "object"
      ? ((input as Record<string, unknown>).segments ||
          (input as Record<string, unknown>).results ||
          (input as Record<string, unknown>).result ||
          [])
      : [];
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = String(row.text ?? row.transcription ?? row.label ?? "").trim();
      const rawBox = boxFromUnknown(row.box ?? row.bbox ?? row.points ?? row.position);
      if (!text || !rawBox) return null;
      const x = Math.max(0, Math.min(imageWidth - 1, Math.round(rawBox.x)));
      const y = Math.max(0, Math.min(imageHeight - 1, Math.round(rawBox.y)));
      const width = Math.max(1, Math.min(imageWidth - x, Math.round(rawBox.width)));
      const height = Math.max(1, Math.min(imageHeight - y, Math.round(rawBox.height)));
      return {
        text: text.slice(0, 300),
        confidence: Math.max(0, Math.min(1, finite(row.confidence ?? row.score ?? 1))),
        box: { x, y, width, height },
      };
    })
    .filter((segment): segment is OcrSegment => Boolean(segment))
    .slice(0, 80);
}

function collectPaddleRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const value = body as Record<string, unknown>;
  const direct = value.segments || value.results || value.result || value.data;
  if (Array.isArray(direct)) {
    const first = direct[0] as Record<string, unknown> | undefined;
    if (first && Array.isArray(first.rec_texts) && Array.isArray(first.rec_boxes)) {
      return first.rec_texts.map((text, index) => ({
        text,
        confidence: Array.isArray(first.rec_scores) ? first.rec_scores[index] : 1,
        box: (first.rec_boxes as unknown[])[index],
      }));
    }
    return direct;
  }
  return [];
}

async function paddleOcr(buffer: Buffer, mimeType: string) {
  const endpoint = (process.env.PADDLE_OCR_BASE_URL || "").trim();
  if (!endpoint) return null;
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buffer)], "canvas-image.png", { type: mimeType }));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: process.env.PADDLE_OCR_API_KEY
      ? { Authorization: `Bearer ${process.env.PADDLE_OCR_API_KEY}` }
      : undefined,
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`PaddleOCR 返回 ${response.status}：${raw.slice(0, 240)}`);
  return collectPaddleRows(JSON.parse(raw));
}

async function visionOcr(buffer: Buffer, mimeType: string, width: number, height: number, model: string) {
  const settings = await getOpenAISettings();
  // OCR belongs to the image workflow: prefer the configured OpenAI-compatible
  // image gateway. The agent gateway can be independently unavailable (for
  // example, a mainland host timing out against it), so it is only a fallback.
  const apiKey = settings.apiKey || process.env.AGENT_API_KEY;
  if (!apiKey) throw new Error("OCR 服务和视觉模型均未配置");
  const client = new OpenAI({
    apiKey,
    baseURL: (await getOpenAIBaseUrl()) || process.env.AGENT_BASE_URL || undefined,
    timeout: 90_000,
    maxRetries: 0,
  });
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    { type: "text", text: `原图尺寸 ${width}×${height} 像素。扫描整张图片，一次性提取全部文字和像素坐标框。` },
    { type: "image_url", image_url: { url: await toVisionDataUrl(buffer, mimeType), detail: "high" } },
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
  return JSON.parse(json) as unknown;
}

export async function POST(request: Request) {
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
    try {
      raw = await paddleOcr(image.buffer, image.mimeType);
      if (!raw) throw new Error("PaddleOCR 未配置");
    } catch (error) {
      if (process.env.PADDLE_OCR_REQUIRED === "true") throw error;
      engine = "vision-fallback";
      raw = await visionOcr(
        image.buffer,
        image.mimeType,
        width,
        height,
        requestedTextModel(
          request,
          process.env.PADDLE_OCR_FALLBACK_MODEL || process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna"
        )
      );
    }
    const segments = normalizeSegments(raw, width, height);
    return NextResponse.json({
      ok: true,
      engine,
      image: { width, height },
      segments: segments.map((segment, index) => ({ id: `ocr-${index + 1}`, ...segment })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "图片文字识别失败，请稍后重试") },
      { status: 502 }
    );
  }
}
