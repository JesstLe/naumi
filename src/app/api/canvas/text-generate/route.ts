import { modelAwareOpenAI } from "@/lib/model-config/clients";
import { observeOpenAI, withBiRequest } from "@/lib/bi/model-observer";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import path from "path";
import { dbEnabled, listArtworksByIds, listCanvasTextNodes, type ArtworkRecord } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { clientIp } from "@/lib/ip";
import { safeError } from "@/lib/api-error";
import {
  dataUrlToBytes,
  isManagedImageUrl,
  readManagedObject,
} from "@/lib/storage";
import { toVisionDataUrl } from "@/lib/vision-image";
import { requestedTextModel } from "@/lib/text-models";
import { withBillingRequest, configuredToolCost } from "@/lib/billing/synchronous";
import { CANVAS_TEXT_OUTPUT_INSTRUCTION, canvasTextInput, canvasAnswerText, canvasTextFailure, reportCanvasTextFailure } from "@/lib/canvas-text-output";
import { currentModelExecution } from "@/lib/model-config/context";
import { CanvasTextContentError, canvasTextGenerationInput, parseCanvasTextContent, resolveCanvasTextInstruction } from "@/lib/canvas/text-generation-input";
import { CanvasTextReferenceError, canvasTextReferenceContext, splitCanvasTextReferences } from "@/lib/canvas/text-generation-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_REFERENCE_IMAGES = 5;
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

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

function mediaTypeFromPath(value: string): string {
  const ext = path.extname(value.split("?", 1)[0]).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

async function readReferenceImage(source: string, requestUrl: string): Promise<string> {
  const inline = dataUrlToBytes(source);
  if (inline) {
    if (inline.bytes.byteLength > MAX_REFERENCE_BYTES) throw new Error("参考图片超过 12MB");
    return toVisionDataUrl(Buffer.from(inline.bytes), inline.contentType);
  }

  if (isManagedImageUrl(source)) {
    const object = await readManagedObject(source, MAX_REFERENCE_BYTES);
    return toVisionDataUrl(
      object.bytes,
      object.contentType === "application/octet-stream"
        ? mediaTypeFromPath(source)
        : object.contentType
    );
  }

  const sameOrigin = source.startsWith("/") && !source.startsWith("//");
  const target = sameOrigin ? new URL(source, requestUrl) : new URL(source);
  if (!sameOrigin && !allowedRemoteImage(target)) throw new Error("参考图片来源不受支持");
  const response = await fetch(target, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`读取参考图片失败 (${response.status})`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_REFERENCE_BYTES) throw new Error("参考图片超过 12MB");
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.byteLength > MAX_REFERENCE_BYTES) throw new Error("参考图片超过 12MB");
  return toVisionDataUrl(raw, response.headers.get("content-type") || mediaTypeFromPath(source));
}

function referenceMetadata(artworks: ArtworkRecord[]): string {
  return artworks
    .map(
      (artwork, index) =>
        `引用图片 ${index + 1}：${(artwork.title || "未命名图片").slice(0, 120)}\n原提示词：${
          (artwork.prompt || "无").slice(0, 800)
        }`
    )
    .join("\n\n");
}

async function handleObservedPost(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const ip = clientIp(request) || "0.0.0.0";
  const rateLimitResult = await checkRateLimit(`canvas-text:${ip}`, 40, 10 * 60 * 1000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let prompt = "";
  let content = "";
  let sourceIds: string[] = [];
  let textSourceIds: string[] = [];
  let projectKey = "";
  let productIds: string[] = [];
  let mode: "general" | "reverse" | "assist" = "general";
  try {
    const body = (await request.json()) as {
      prompt?: string;
      content?: unknown;
      sourceIds?: unknown;
      projectKey?: unknown;
      productIds?: unknown;
      mode?: unknown;
    };
    prompt = String(body.prompt || "").trim().slice(0, 4000);
    content = parseCanvasTextContent(body.content);
    mode = body.mode === "reverse" || body.mode === "assist" ? body.mode : "general";
    projectKey = typeof body.projectKey === "string" ? body.projectKey.trim() : "";
    sourceIds = Array.from(
      new Set(
        (Array.isArray(body.sourceIds) ? body.sourceIds : [])
          .map((id) => String(id).trim())
          .filter(Boolean)
      )
    );
    if (mode === "general") {
      const references = splitCanvasTextReferences(sourceIds);
      sourceIds = references.imageIds;
      textSourceIds = references.textIds;
      if (textSourceIds.length && !projectKey) {
        throw new CanvasTextReferenceError("TEXT_REFERENCE_PROJECT_REQUIRED", "关联文字需要当前画布项目");
      }
    } else {
      // Product recipes still accept their original image-only inputs.
      sourceIds = sourceIds.slice(0, MAX_REFERENCE_IMAGES);
    }
    productIds = Array.from(
      new Set(
        (Array.isArray(body.productIds) ? body.productIds : [])
          .map((id) => String(id).trim())
          .filter(Boolean)
      )
    ).slice(0, 2);
  } catch (error) {
    if (error instanceof CanvasTextContentError || error instanceof CanvasTextReferenceError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  // Only an explicit general request may use the current body as a polish action.
  // Parsing and input limits above still apply; product recipe modes stay unchanged.
  if (mode === "general") prompt = resolveCanvasTextInstruction(prompt, content);
  // reverse(竞品图反推提示词)可以不带用户指令；general 空正文仍需明确写作要求。
  if (!prompt && mode !== "reverse") {
    return NextResponse.json({ error: "请输入要生成的文字内容" }, { status: 400 });
  }
  if (mode === "reverse" && !sourceIds.length) {
    return NextResponse.json({ error: "反推提示词需要至少一张参考图" }, { status: 400 });
  }
  if (mode === "assist" && !productIds.length) {
    return NextResponse.json({ error: "智能帮写需要先选择产品图" }, { status: 400 });
  }
  if (textSourceIds.length && (!dbEnabled || !email)) {
    return NextResponse.json({ code: "TEXT_REFERENCE_STORAGE_REQUIRED", error: "当前环境未启用文字引用存储" }, { status: 400 });
  }

  const model = requestedTextModel(
    request,
    process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna"
  );
  const settings = await getOpenAISettings();
  const apiKey = process.env.AGENT_API_KEY || settings.apiKey || (currentModelExecution("text") || currentModelExecution("vision") ? "managed-canvas-text" : "");
  if (!apiKey) {
    return NextResponse.json({ error: "文字模型接口未配置" }, { status: 503 });
  }

  try {
    let textReferences = "";
    if (textSourceIds.length) {
      textReferences = canvasTextReferenceContext({
        textIds: textSourceIds,
        projectKey,
        nodes: await listCanvasTextNodes(email!),
        contentLength: content.length,
      });
    }
    let references: ArtworkRecord[] = [];
    let referenceImages: string[] = [];
    if (sourceIds.length) {
      if (!dbEnabled || !email) {
        return NextResponse.json({ error: "当前环境未启用图片引用存储" }, { status: 400 });
      }
      const found = await listArtworksByIds(email, sourceIds);
      const byId = new Map(found.map((artwork) => [artwork.id, artwork]));
      references = sourceIds
        .map((id) => byId.get(id))
        .filter((artwork): artwork is ArtworkRecord => Boolean(artwork));
      if (references.length !== sourceIds.length) {
        return NextResponse.json({ error: "部分引用图片不存在或无权访问" }, { status: 400 });
      }
      referenceImages = await Promise.all(
        references.map((artwork) => readReferenceImage(artwork.image, request.url))
      );
    }
    // 产品图(assist 模式):单独一组引用,提示词里明确标注是"用户自己的产品"
    let products: ArtworkRecord[] = [];
    let productImages: string[] = [];
    if (productIds.length) {
      if (!dbEnabled || !email) {
        return NextResponse.json({ error: "当前环境未启用图片引用存储" }, { status: 400 });
      }
      const found = await listArtworksByIds(email, productIds);
      const byId = new Map(found.map((artwork) => [artwork.id, artwork]));
      products = productIds
        .map((id) => byId.get(id))
        .filter((artwork): artwork is ArtworkRecord => Boolean(artwork));
      if (products.length !== productIds.length) {
        return NextResponse.json({ error: "绑定的产品图不存在或无权访问" }, { status: 400 });
      }
      productImages = await Promise.all(
        products.map((artwork) => readReferenceImage(artwork.image, request.url))
      );
    }

    const client = observeOpenAI(modelAwareOpenAI({
      apiKey,
      maxRetries: 0,
      baseURL:
        process.env.AGENT_BASE_URL || (await getOpenAIBaseUrl()) || undefined,
    }));
    // 按模式拼系统提示词与用户内容:
    //  general=画布通用文字生成;reverse=竞品图→逆向生图提示词;assist=逆向词按用户产品改写。
    const systemPrompt =
      mode === "reverse"
        ? "你是电商图片逆向工程助手。根据给出的参考图反推出一段可直接用于文生图模型的完整中文提示词,涵盖:画面主体与商品形态、构图与版式(主体位置/占比/角度)、背景与场景、布光、色调与风格、画面文案的布局类型(不杜撰具体文字)、画质与质感词。只输出提示词本身,不要解释、不要标题、不要分点编号。参考图是竞品图,描述画面本身,不要写入任何品牌名或店铺名。"
        : mode === "assist"
          ? "你是电商提示词改写助手。用户会给出一段从竞品图逆向出来的提示词,以及用户自己产品的白底图。把提示词中所有与竞品产品相关的描述(产品形态、卖点、品牌、文案内容)替换为用户产品图中的真实产品与卖点,保持原有构图、布光、场景、色调与风格不变,并剔除一切竞品品牌名与标识。只输出改写后的完整中文提示词,不要解释。画面文案要求必须与用户产品匹配、可直接使用。"
          : "你是电商创作画布里的文字生成助手。直接完成用户要求，可写标题、卖点、脚本、详情文案、提示词或结构化方案。内容要清晰、可直接复制使用；除非用户要求，不要解释过程，不要添加空泛口号。";
    let userText = canvasTextGenerationInput(prompt, content);
    if (mode === "reverse") {
      userText = `${prompt || "请反推这张竞品图的生图提示词。"}\n\n以下是待反推的竞品参考图。\n${referenceMetadata(references)}`;
    } else if (mode === "assist") {
      const competitorNote = references.length
        ? `\n\n竞品参考图(只取其构图/布光/风格信息):\n${referenceMetadata(references)}`
        : "";
      userText = `待改写的逆向提示词:\n${prompt}\n\n以下是用户自己产品的白底图(改写后的提示词必须描述这个产品):\n${referenceMetadata(products)}${competitorNote}`;
    } else if (references.length) {
      userText = `${userText}\n\n以下图片已由用户通过画布连线加入当前节点上下文。请结合图片内容和元数据完成任务。\n\n${referenceMetadata(references)}`;
    }
    if (textReferences) userText = `${userText}\n\n${textReferences}`;
    const allImages = [...referenceImages, ...productImages];
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      { type: "text", text: canvasTextInput(userText) },
      ...allImages.map((url) => ({
        type: "image_url" as const,
        image_url: { url, detail: "low" as const },
      })),
    ];
    await configuredToolCost();
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\n${CANVAS_TEXT_OUTPUT_INSTRUCTION}`,
        },
        { role: "user", content: allImages.length ? userContent : canvasTextInput(userText) },
      ],
      temperature: 0.75,
      max_tokens: 1800,
      modalities: ["text"],
    });
    const choice = response.choices?.[0];
    const text = canvasAnswerText(choice?.message?.content).trim();
    const failure = canvasTextFailure(choice);
    if (!text || failure.code === "TEXT_OUTPUT_IMAGE" || failure.code === "TEXT_OUTPUT_REFUSED" || failure.code === "TEXT_OUTPUT_LIMIT") {
      reportCanvasTextFailure("text-generate", failure.code);
      return NextResponse.json(failure, { status: 502 });
    }
    return NextResponse.json({ text, model, referenceCount: references.length, textReferenceCount: textSourceIds.length });
  } catch (error) {
    if (error instanceof CanvasTextReferenceError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: safeError(error, "文字生成失败，请稍后重试") },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  return withBillingRequest(request, "canvas.text-generate", () => withBiRequest(request, () => handleObservedPost(request)));
}
