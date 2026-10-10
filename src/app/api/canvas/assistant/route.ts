import { modelAwareOpenAI } from "@/lib/model-config/clients";
import { observeOpenAI, withBiRequest } from "@/lib/bi/model-observer";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import path from "path";
import { dbEnabled, listArtworksByIds, type ArtworkRecord } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { safeError } from "@/lib/api-error";
import {
  dataUrlToBytes,
  isManagedImageUrl,
  readManagedObject,
} from "@/lib/storage";
import { toVisionDataUrl } from "@/lib/vision-image";
import { requestedTextModel } from "@/lib/text-models";
import { CANVAS_TEXT_OUTPUT_INSTRUCTION, canvasTextInput, canvasAnswerText, canvasTextFailure, reportCanvasTextFailure } from "@/lib/canvas-text-output";
import { withBillingRequest, configuredToolCost, completeSynchronousStream, failSynchronousStream } from "@/lib/billing/synchronous";
import { runCanvasAgent } from "@/lib/agent/canvas";
import { canvasAgentHistory } from "@/lib/agent/canvas-history";

// ---------------------------------------------------------------------------
// 画布助手:围绕选中节点 + 其上游生成链的多轮对话(后台可配置,默认免费)。
//
// 前端传锚定节点 id 与前端算好的上游链 id(≤5 张,归属校验防伪造),
// 无状态重建 messages:system 人设 → 上下文块(图+元数据) → 历史截 12 条。
// 助手在用户要生图/给出最终提示词时输出 [[GEN]]…[[/GEN]] 标记块,
// 前端解析成「生成到画布」按钮,生图本身走 generate-image 正常计费。
// 通道与 canvas/text-generate 完全一致(requestedTextModel + AGENT_API_KEY)。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const MAX_CONTEXT_IMAGES = 5;
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;
const MAX_HISTORY_TURNS = 12;

const SYSTEM_PROMPT = [
  "你是电商图片工作台「无限画布」里的画布助手。用户在画布上选中了一张图（下称「当前图」），并带上了它生成链的上游图片作为上下文。",
  "职责：",
  "- 点评当前图的商业表现力（构图、主体表达、光影、色彩、画面文案）；",
  "- 诊断问题并给出具体、可直接执行的修改方向；",
  "- 帮用户写或改生图/改图提示词。",
  "规则：",
  "- 用中文回复，简洁分点，结论先行；",
  "- 只依据图片与元数据里真实可见的信息，不要编造图中不存在的细节；",
  "- 仅当用户明确要求生成图片、或你给出最终版生图提示词时，才把这段提示词完整包在 [[GEN]] 和 [[/GEN]] 标记之间，一次回复最多一个标记块；其余情况禁止使用该标记；",
  "- 建议要结合生成链上下文（例如上游是白底商品图、当前是场景图）。",
].join("\n");

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

function contextMetadata(anchor: ArtworkRecord, ancestors: ArtworkRecord[]): string {
  const line = (artwork: ArtworkRecord, label: string) =>
    `${label}：${(artwork.title || "未命名图片").slice(0, 120)}\n原提示词：${(artwork.prompt || "无").slice(0, 800)}`;
  const chain = ancestors.length
    ? `\n\n上游生成链（由近到远）：\n${ancestors.map((artwork, index) => line(artwork, `上游图 ${index + 1}`)).join("\n\n")}`
    : "";
  return `${line(anchor, "当前图（用户选中的节点）")}${chain}`;
}

async function handleObservedPost(request: Request) {
  const email = await authenticatedEmail(request);
  if (dbEnabled && !email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const ip = clientIp(request) || "0.0.0.0";
  if (!rateLimit(`canvas-assistant:${ip}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "对话过于频繁，请稍后再试" }, { status: 429 });
  }

  let anchorId = "";
  let contextIds: string[] = [];
  let history: { role: "user" | "assistant"; content: string }[] = [];
  try {
    const body = (await request.json()) as {
      anchorId?: unknown;
      contextIds?: unknown;
      messages?: unknown;
    };
    anchorId = String(body.anchorId || "").trim();
    // 锚定在前、去重、≤5 张;顺序由前端按 BFS 深度排好
    contextIds = Array.from(
      new Set(
        [anchorId, ...(Array.isArray(body.contextIds) ? body.contextIds : [])
          .map((id) => String(id).trim())
          .filter(Boolean)]
      )
    ).slice(0, MAX_CONTEXT_IMAGES);
    history = (Array.isArray(body.messages) ? body.messages : [])
      .map((turn) => {
        const item = turn as { role?: unknown; content?: unknown };
        const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
        const content = String(item?.content || "").trim().slice(0, 4000);
        return role && content ? { role, content } : null;
      })
      .filter((turn): turn is { role: "user" | "assistant"; content: string } => Boolean(turn))
      .slice(-MAX_HISTORY_TURNS);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!email || !anchorId || !history.length) {
    return NextResponse.json({ error: "请选择图片并输入问题" }, { status: 400 });
  }

  const model = requestedTextModel(
    request,
    process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna"
  );
  const settings = await getOpenAISettings();
  const apiKey = process.env.AGENT_API_KEY || settings.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: "文字模型接口未配置" }, { status: 503 });
  }

  try {
    if (!dbEnabled || !email) {
      return NextResponse.json({ error: "当前环境未启用图片引用存储" }, { status: 400 });
    }
    const found = await listArtworksByIds(email, contextIds);
    const byId = new Map(found.map((artwork) => [artwork.id, artwork]));
    const ordered = contextIds
      .map((id) => byId.get(id))
      .filter((artwork): artwork is ArtworkRecord => Boolean(artwork));
    if (!ordered.length || ordered[0].id !== anchorId) {
      return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });
    }
    const contextImages = await Promise.all(
      ordered.map((artwork) => readReferenceImage(artwork.image, request.url))
    );

    const client = observeOpenAI(modelAwareOpenAI({
      apiKey,
      maxRetries: 0,
      baseURL:
        process.env.AGENT_BASE_URL || (await getOpenAIBaseUrl()) || undefined,
    }));
    const contextContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      {
        type: "text",
        text: `以下是画布上下文（第一张是当前图，其余是它的上游生成链，按从近到远排列）：\n\n${contextMetadata(ordered[0], ordered.slice(1))}`,
      },
      ...contextImages.map((url) => ({
        type: "image_url" as const,
        image_url: { url, detail: "low" as const },
      })),
    ];
    // SSE 流式输出:建立流失败仍可回 JSON 错误;建立后增量以 delta 事件转发
    let stream: Awaited<
      ReturnType<typeof client.chat.completions.create>
    >;
    try {
      await configuredToolCost();
      stream = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${CANVAS_TEXT_OUTPUT_INSTRUCTION}` },
          { role: "user", content: contextContent },
          { role: "assistant", content: "收到，我已了解画布上下文（当前图与上游生成链），可以开始对话。" },
          ...history.map(turn => turn.role === "user" ? { ...turn, content: canvasTextInput(turn.content) } : turn),
        ],
        temperature: 0.7,
        max_tokens: 1800,
        modalities: ["text"],
        stream: true,
      });
    } catch (error) {
      return NextResponse.json(
        { error: safeError(error, "画布助手暂时不可用，请稍后重试") },
        { status: 502 }
      );
    }
    const encoder = new TextEncoder();
    const sse = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: Record<string, unknown>) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            /* 连接已断开,迭代结束由 close 兜底 */
          }
        };
        let text = "";
        let lastChoice: unknown;
        let imageChoice: unknown;
        try {
          for await (const chunk of stream) {
            const choice = chunk.choices?.[0];
            if (choice) {
              lastChoice = choice;
              const code = canvasTextFailure(choice).code;
              if (code === "TEXT_OUTPUT_IMAGE" || code === "TEXT_OUTPUT_REFUSED") imageChoice = choice;
            }
            const delta = canvasAnswerText(choice?.delta?.content);
            if (delta) { text += delta; send("delta", { text: delta }); }
          }
          if (!text.trim() || imageChoice) {
            const failure = canvasTextFailure(imageChoice || lastChoice);
            reportCanvasTextFailure("assistant", failure.code);
            await failSynchronousStream();
            send("error", failure);
            controller.close();
            return;
          }
          await completeSynchronousStream({ text, model });
          send("done", { ok: true });
        } catch (e) {
          await failSynchronousStream().catch(() => {});
          send("error", { error: safeError(e, "画布助手暂时不可用，请稍后重试") });
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      },
    });
    return new Response(sse, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "画布助手暂时不可用，请稍后重试") },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const agentMode = (await request.clone().json().catch(() => null))?.mode === "agent";
  return withBillingRequest(request, "canvas.assistant", () => withBiRequest(request, () => agentMode ? runCanvasAgent(request) : handleObservedPost(request)));
}
export const GET = canvasAgentHistory;
export const PATCH = canvasAgentHistory;
export const DELETE = canvasAgentHistory;
