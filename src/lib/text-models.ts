import { observeOpenAI } from "@/lib/bi/model-observer";
import "server-only";

import OpenAI from "openai";
import { getOpenAIBaseUrl } from "./openai-base";
import { getOpenAISettings } from "./settings";

const DEFAULT_TEXT_MODEL =
  process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna";
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/;

// 对外目录白名单:设置后目录不再从上游发现,只显示这份清单(隔离上游真实模型名)。
const TEXT_MODEL_WHITELIST = (process.env.TEXT_MODEL_WHITELIST || "")
  .split(/[\s,]+/)
  .map((value) => value.trim())
  .filter((value) => MODEL_ID.test(value));

// 假名映射:目录/选择器展示对外别名(如 gpt6Astra),请求头带别名时在这里
// 翻译回真实模型 id 再转发上游。格式:别名=真实id,逗号分隔。
const TEXT_MODEL_ALIASES = new Map<string, string>(
  (process.env.TEXT_MODEL_ALIASES || "")
    .split(/[\s,]+/)
    .map((pair) => pair.split("="))
    .filter((pair): pair is [string, string] =>
      pair.length === 2 && MODEL_ID.test(pair[0]) && MODEL_ID.test(pair[1])
    )
);

function aliasOf(realModel: string): string {
  for (const [alias, real] of Array.from(TEXT_MODEL_ALIASES.entries())) {
    if (real === realModel) return alias;
  }
  return realModel;
}

let cachedCatalog: { expiresAt: number; models: string[] } | null = null;

function configuredModels(): string[] {
  return [
    DEFAULT_TEXT_MODEL,
    process.env.AGENT_VISION_MODEL,
    process.env.REFERENCE_VISION_MODEL,
    ...(process.env.OPENAI_TEXT_MODELS || "").split(/[\s,]+/),
    ...(process.env.AGENT_MODELS || "").split(/[\s,]+/),
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => MODEL_ID.test(value));
}

function looksLikeTextModel(id: string): boolean {
  return !/(image|embedding|moderation|tts|audio|transcri|whisper|dall-e)/i.test(id);
}

export function requestedTextModel(request: Request, fallback = DEFAULT_TEXT_MODEL): string {
  const requested = (request.headers.get("x-naumi-text-model") || "").trim();
  if (!MODEL_ID.test(requested)) return fallback;
  // 假名 → 真实模型 id(请求转发永远用真实 id)
  return TEXT_MODEL_ALIASES.get(requested) ?? requested;
}

export async function textModelCatalog(): Promise<{
  defaultModel: string;
  models: string[];
  discovery: "provider" | "configured";
}> {
  // 白名单模式:目录即别名/清单本身,不做上游发现(对外隔离上游真实模型名)
  if (TEXT_MODEL_WHITELIST.length) {
    return {
      defaultModel: aliasOf(DEFAULT_TEXT_MODEL),
      models: Array.from(new Set(TEXT_MODEL_WHITELIST.map(aliasOf))),
      discovery: "configured",
    };
  }

  const configured = configuredModels();
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
    return {
      defaultModel: aliasOf(DEFAULT_TEXT_MODEL),
      models: cachedCatalog.models,
      discovery: cachedCatalog.models.length > configured.length ? "provider" : "configured",
    };
  }

  let discovered: string[] = [];
  try {
    const settings = await getOpenAISettings();
    const apiKey = process.env.AGENT_API_KEY || settings.apiKey;
    if (apiKey) {
      const client = observeOpenAI(new OpenAI({
        apiKey,
        baseURL: process.env.AGENT_BASE_URL || (await getOpenAIBaseUrl()) || undefined,
        timeout: 12_000,
        maxRetries: 0,
      }));
      const page = await client.models.list();
      discovered = page.data
        .map((model) => model.id.trim())
        .filter((id) => MODEL_ID.test(id) && looksLikeTextModel(id));
    }
  } catch {
    // Some OpenAI-compatible gateways do not expose /models. The configured
    // default remains usable and the UI still allows an exact custom model ID.
  }

  const models = Array.from(new Set([...configured, ...discovered])).slice(0, 120);
  cachedCatalog = { expiresAt: Date.now() + 5 * 60_000, models };
  return {
    defaultModel: aliasOf(DEFAULT_TEXT_MODEL),
    models,
    discovery: discovered.length ? "provider" : "configured",
  };
}

