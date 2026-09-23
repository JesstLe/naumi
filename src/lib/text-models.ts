import "server-only";

import OpenAI from "openai";
import { getOpenAIBaseUrl } from "./openai-base";
import { getOpenAISettings } from "./settings";

const DEFAULT_TEXT_MODEL =
  process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna";
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/;

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
  return MODEL_ID.test(requested) ? requested : fallback;
}

export async function textModelCatalog(): Promise<{
  defaultModel: string;
  models: string[];
  discovery: "provider" | "configured";
}> {
  const configured = configuredModels();
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
    return {
      defaultModel: DEFAULT_TEXT_MODEL,
      models: cachedCatalog.models,
      discovery: cachedCatalog.models.length > configured.length ? "provider" : "configured",
    };
  }

  let discovered: string[] = [];
  try {
    const settings = await getOpenAISettings();
    const apiKey = process.env.AGENT_API_KEY || settings.apiKey;
    if (apiKey) {
      const client = new OpenAI({
        apiKey,
        baseURL: process.env.AGENT_BASE_URL || (await getOpenAIBaseUrl()) || undefined,
        timeout: 12_000,
        maxRetries: 0,
      });
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
    defaultModel: DEFAULT_TEXT_MODEL,
    models,
    discovery: discovered.length ? "provider" : "configured",
  };
}

