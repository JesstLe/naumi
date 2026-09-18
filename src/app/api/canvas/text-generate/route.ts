import { NextResponse } from "next/server";
import OpenAI from "openai";
import { readFile, stat } from "fs/promises";
import path from "path";
import { dbEnabled, listArtworksByIds, type ArtworkRecord } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { safeError } from "@/lib/api-error";
import { dataUrlToBytes, MEDIA_DIR } from "@/lib/storage";
import { toVisionDataUrl } from "@/lib/vision-image";

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

  if (source.startsWith("/media/") && !source.startsWith("//")) {
    const pathname = decodeURIComponent(source.split("?", 1)[0]);
    const full = path.resolve(MEDIA_DIR, pathname.slice("/media/".length));
    const root = path.resolve(MEDIA_DIR);
    if (full === root || !full.startsWith(root + path.sep)) throw new Error("参考图片地址无效");
    const info = await stat(full);
    if (info.size > MAX_REFERENCE_BYTES) throw new Error("参考图片超过 12MB");
    return toVisionDataUrl(await readFile(full), mediaTypeFromPath(full));
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

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const ip = clientIp(request) || "0.0.0.0";
  if (!rateLimit(`canvas-text:${ip}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let prompt = "";
  let sourceIds: string[] = [];
  try {
    const body = (await request.json()) as { prompt?: string; sourceIds?: unknown };
    prompt = String(body.prompt || "").trim().slice(0, 4000);
    sourceIds = Array.from(
      new Set(
        (Array.isArray(body.sourceIds) ? body.sourceIds : [])
          .map((id) => String(id).trim())
          .filter(Boolean)
      )
    ).slice(0, MAX_REFERENCE_IMAGES);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "请输入要生成的文字内容" }, { status: 400 });
  }

  const model = process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna";
  const settings = await getOpenAISettings();
  const apiKey = process.env.AGENT_API_KEY || settings.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: "文字模型接口未配置" }, { status: 503 });
  }

  try {
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

    const client = new OpenAI({
      apiKey,
      baseURL:
        process.env.AGENT_BASE_URL || (await getOpenAIBaseUrl()) || undefined,
    });
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      {
        type: "text",
        text: references.length
          ? `${prompt}\n\n以下图片已由用户通过画布连线加入当前节点上下文。请结合图片内容和元数据完成任务。\n\n${referenceMetadata(references)}`
          : prompt,
      },
      ...referenceImages.map((url) => ({
        type: "image_url" as const,
        image_url: { url, detail: "low" as const },
      })),
    ];
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是电商创作画布里的文字生成助手。直接完成用户要求，可写标题、卖点、脚本、详情文案、提示词或结构化方案。内容要清晰、可直接复制使用；除非用户要求，不要解释过程，不要添加空泛口号。",
        },
        { role: "user", content: references.length ? userContent : prompt },
      ],
      temperature: 0.75,
      max_tokens: 1800,
    });
    const text = (response.choices[0]?.message?.content || "").trim();
    if (!text) {
      return NextResponse.json({ error: "文字生成没有返回内容，请重试" }, { status: 502 });
    }
    return NextResponse.json({ text, model, referenceCount: references.length });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "文字生成失败，请稍后重试") },
      { status: 502 }
    );
  }
}
