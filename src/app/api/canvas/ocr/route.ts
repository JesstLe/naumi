import { currentModelExecution } from "@/lib/model-config/context";
import { modelAwareOpenAI } from "@/lib/model-config/clients";
import {chatAnswerText} from "@/lib/model-config/chat-completion-response";
import {observeOpenAI} from "@/lib/bi/model-calls";
import {withBiRequest} from "@/lib/bi/request";
import { NextResponse } from "next/server";
import { requestedTextModel } from "@/lib/text-models";
import sharp from "sharp";

import { authenticatedEmail } from "@/lib/request-auth";
import {dbEnabled} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import { readCanvasImage } from "@/lib/canvas-image-input";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { clientIp } from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { safeError } from "@/lib/api-error";
import { normalizeOcrSegments, scaleOcrSegments } from "@/lib/canvas-ocr";
import {withBillingRequest} from "@/lib/billing/synchronous";
import {configuredToolCost, markBillingUpstream} from "@/lib/billing/synchronous-operation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  const apiKey = settings.apiKey || process.env.AGENT_API_KEY || (currentModelExecution("vision") ? "managed-canvas-ocr" : "");
  if (!apiKey) throw new Error("OCR 服务和视觉模型均未配置");
  const client = observeOpenAI(modelAwareOpenAI({
    apiKey,
    baseURL: (await getOpenAIBaseUrl()) || process.env.AGENT_BASE_URL || undefined,
    timeout: 45_000,
    maxRetries: 0,
  }));
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    { type: "text", text: `所见图片尺寸 ${scanWidth}×${scanHeight} 像素。扫描整张图片，一次性提取全部文字和像素坐标框。` },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${prepared.data.toString("base64")}`, detail: "high" } },
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
  const content = chatAnswerText(response.choices[0]?.message?.content);
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

async function handleObservedPost(request: Request) {
  const startedAt = Date.now();
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const rateLimitResult = await checkRateLimit(`canvas-ocr:${clientIp(request) || "0.0.0.0"}`, 30, 10 * 60 * 1000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) {
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
    const image = await readCanvasImage(artwork.image, request.url, email);
    const metadata = await sharp(image.buffer).metadata();
    const width = metadata.width || artwork.width || 0;
    const height = metadata.height || artwork.height || 0;
    if (!width || !height) throw new Error("无法读取图片尺寸");

    await configuredToolCost();
    // Canvas OCR uses the configured vision model directly. Legacy Paddle
    // environment flags no longer select or require another OCR service.
    const engine = "vision";
    const vision = await visionOcr(image.buffer,width,height,requestedTextModel(request,
      process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna"));
    const scanSize = {width:vision.scanWidth,height:vision.scanHeight};
    const segments = scaleOcrSegments(normalizeOcrSegments(vision.raw,scanSize.width,scanSize.height,
      {minConfidence:0,maxSegments:500}),scanSize,{width,height});
    if (!segments.length) throw new Error("未识别到可编辑文字，请换一张更清晰的图片重试");
    const elapsedMs = Date.now() - startedAt;
    console.info(`[canvas-ocr] artwork=${artworkId} engine=${engine} segments=${segments.length} attempts=1 elapsed=${elapsedMs}ms`);
    markBillingUpstream("succeeded");
    return NextResponse.json({
      ok: true,
      engine,
      image: { width, height },
      segments: segments.map((segment, index) => ({ id: `ocr-${index + 1}`, ...segment })),
      diagnostics: { elapsedMs, paddleAttempts:0, fallback:false, fallbackReason:"" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "图片文字识别失败，请稍后重试") },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  return withBillingRequest(request, "canvas.ocr", () => withBiRequest(request, () => handleObservedPost(request)));
}
