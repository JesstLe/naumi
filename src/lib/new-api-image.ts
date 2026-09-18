import { getNewApiImageSettings } from "@/lib/image-model-catalog";

export type NewApiReferenceImage = {
  buffer: Buffer;
  mimeType: string;
};

function upstreamError(raw: string, status: number) {
  try {
    const body = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message || body.message || raw.slice(0, 500);
    return new Error(`${status} ${message}`);
  } catch {
    return new Error(`${status} ${raw.slice(0, 500)}`);
  }
}

function collectStreamContent(raw: string) {
  let content = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const chunk = JSON.parse(data) as {
        choices?: {
          delta?: { content?: string; reasoning_content?: string };
          message?: { content?: string };
        }[];
        error?: { message?: string } | string;
      };
      if (chunk.error) {
        throw new Error(
          typeof chunk.error === "string"
            ? chunk.error
            : chunk.error.message || "生图服务返回错误"
        );
      }
      const choice = chunk.choices?.[0];
      content +=
        choice?.delta?.content ||
        choice?.delta?.reasoning_content ||
        choice?.message?.content ||
        "";
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  if (!content && raw.trim().startsWith("{")) {
    try {
      const body = JSON.parse(raw) as {
        choices?: { message?: { content?: string } }[];
      };
      content = body.choices?.[0]?.message?.content || "";
    } catch {
      /* keep empty content */
    }
  }
  return content;
}

function extractImageUrl(content: string) {
  const markdown = Array.from(
    content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)
  );
  if (markdown.length) return markdown.at(-1)?.[1] || "";
  const urls = Array.from(content.matchAll(/https?:\/\/[^\s)]+/g));
  return urls.at(-1)?.[0] || "";
}

export async function generateNewApiImage(input: {
  model: string;
  prompt: string;
  images?: NewApiReferenceImage[];
  settings?: { baseUrl: string; apiKey: string };
}): Promise<{ buffer: Buffer; contentType: string }> {
  const settings = input.settings || getNewApiImageSettings();
  if (!settings.baseUrl || !settings.apiKey) {
    throw new Error("New API 生图分组尚未配置");
  }
  const references = (input.images || []).slice(0, 6);
  const content = references.length
    ? [
        { type: "text", text: input.prompt },
        ...references.map((image) => ({
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType || "image/png"};base64,${image.buffer.toString("base64")}`,
          },
        })),
      ]
    : input.prompt;
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: "user", content }],
      stream: true,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const raw = await response.text();
  if (!response.ok) throw upstreamError(raw, response.status);
  const streamContent = collectStreamContent(raw);
  const imageUrl = extractImageUrl(streamContent);
  if (!imageUrl) {
    throw new Error(`New API 生图分组未返回图片：${streamContent.slice(-300)}`);
  }
  const imageResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!imageResponse.ok) {
    throw new Error(`生成图片下载失败 ${imageResponse.status}`);
  }
  const contentType = imageResponse.headers.get("content-type") || "image/png";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("生图服务返回了非图片内容");
  }
  const declaredSize = Number(imageResponse.headers.get("content-length") || 0);
  if (declaredSize > 32 * 1024 * 1024) {
    throw new Error("生成图片超过 32MB 限制");
  }
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (!buffer.length) throw new Error("生成图片内容为空");
  if (buffer.length > 32 * 1024 * 1024) {
    throw new Error("生成图片超过 32MB 限制");
  }
  return {
    buffer,
    contentType,
  };
}
