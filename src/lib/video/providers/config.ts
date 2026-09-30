import "server-only";
import { createHash } from "node:crypto";

export type VideoProviderProtocol =
  | "openai-videos"
  | "ark"
  | "kie"
  | "apimart"
  | "gemini"
  | "minimax"
  | "autodl"
  | "runninghub";

export type VideoProviderRuntimeConfig = {
  id: string;
  label: string;
  protocol: VideoProviderProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  createPath?: string;
  pollPath?: string;
  contentPath?: string;
  rawAuthorization?: boolean;
  workflowId?: string;
  idempotencyStrategy: "header" | "body" | "none";
  idempotencyBodyField?: string;
};

const BUILT_INS: Array<{ id: string; label: string; protocol: VideoProviderProtocol; prefix: string }> = [
  { id: "ark-seedance", label: "火山方舟 Seedance", protocol: "ark", prefix: "VIDEO_ARK" },
  { id: "kie", label: "Kie / Kling", protocol: "kie", prefix: "VIDEO_KIE" },
  { id: "apimart", label: "API Mart", protocol: "apimart", prefix: "VIDEO_APIMART" },
  { id: "gemini-veo", label: "Google Gemini Veo", protocol: "gemini", prefix: "VIDEO_GEMINI" },
  { id: "minimax-h3", label: "MiniMax H3", protocol: "minimax", prefix: "VIDEO_MINIMAX" },
  { id: "autodl", label: "AutoDL 工作流", protocol: "autodl", prefix: "VIDEO_AUTODL" },
  { id: "runninghub", label: "RunningHub 工作流", protocol: "runninghub", prefix: "VIDEO_RUNNINGHUB" },
];

function modelList(value: string | undefined): string[] {
  const raw = (value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((v) => v.trim()).filter(Boolean);
  } catch { /* comma list */ }
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

function normalized(value: Partial<VideoProviderRuntimeConfig>): VideoProviderRuntimeConfig | null {
  const id = String(value.id || "").trim();
  const baseUrl = String(value.baseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = String(value.apiKey || "").trim();
  const models = (value.models ?? []).map(String).map((v) => v.trim()).filter(Boolean);
  const defaultModel = String(value.defaultModel || models[0] || "").trim();
  const idempotencyStrategy = ["header", "body"].includes(String(value.idempotencyStrategy))
    ? value.idempotencyStrategy as "header" | "body"
    : "none";
  const idempotencyBodyField = String(value.idempotencyBodyField || "").trim() || undefined;
  if (!id || !baseUrl || !apiKey || !defaultModel) return null;
  if (idempotencyStrategy === "body" && !idempotencyBodyField) return null;
  return {
    id,
    label: String(value.label || id),
    protocol: value.protocol || "openai-videos",
    baseUrl,
    apiKey,
    models: models.length ? models : [defaultModel],
    defaultModel,
    createPath: value.createPath,
    pollPath: value.pollPath,
    contentPath: value.contentPath,
    rawAuthorization: Boolean(value.rawAuthorization),
    workflowId: value.workflowId,
    idempotencyStrategy,
    idempotencyBodyField,
  };
}

function jsonProviders(): VideoProviderRuntimeConfig[] {
  const raw = (process.env.VIDEO_PROVIDERS_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Partial<VideoProviderRuntimeConfig>>;
    return Array.isArray(parsed) ? parsed.map(normalized).filter((v): v is VideoProviderRuntimeConfig => Boolean(v)) : [];
  } catch {
    return [];
  }
}

export function configuredVideoProviders(): VideoProviderRuntimeConfig[] {
  const providers = new Map<string, VideoProviderRuntimeConfig>();
  const legacy = normalized({
    id: "openai-videos",
    label: "OpenAI Videos 兼容",
    protocol: "openai-videos",
    baseUrl: process.env.VIDEO_API_BASE_URL,
    apiKey: process.env.VIDEO_API_KEY,
    models: modelList(process.env.VIDEO_API_MODELS || process.env.VIDEO_API_MODEL),
    defaultModel: process.env.VIDEO_API_MODEL,
    idempotencyStrategy: "header",
  });
  if (legacy) providers.set(legacy.id, legacy);

  for (const item of BUILT_INS) {
    const p = item.prefix;
    const cfg = normalized({
      id: item.id,
      label: process.env[`${p}_LABEL`] || item.label,
      protocol: item.protocol,
      baseUrl: process.env[`${p}_BASE_URL`],
      apiKey: process.env[`${p}_API_KEY`],
      models: modelList(process.env[`${p}_MODELS`] || process.env[`${p}_MODEL`]),
      defaultModel: process.env[`${p}_MODEL`],
      createPath: process.env[`${p}_CREATE_PATH`],
      pollPath: process.env[`${p}_POLL_PATH`],
      contentPath: process.env[`${p}_CONTENT_PATH`],
      rawAuthorization: process.env[`${p}_RAW_AUTH`] === "1",
      workflowId: process.env[`${p}_WORKFLOW_ID`],
      idempotencyStrategy: process.env[`${p}_IDEMPOTENCY_STRATEGY`] as "header" | "body" | "none" | undefined,
      idempotencyBodyField: process.env[`${p}_IDEMPOTENCY_BODY_FIELD`],
    });
    if (cfg) providers.set(cfg.id, cfg);
  }
  for (const cfg of jsonProviders()) providers.set(cfg.id, cfg);
  return Array.from(providers.values());
}

export function getVideoProviderConfig(providerId: string): VideoProviderRuntimeConfig | null {
  return configuredVideoProviders().find((p) => p.id === providerId) ?? null;
}

export function publicProviderSnapshot(cfg: VideoProviderRuntimeConfig) {
  let endpoint = cfg.baseUrl;
  try { endpoint = new URL(cfg.baseUrl).host; } catch { /* retain */ }
  return {
    id: cfg.id,
    label: cfg.label,
    protocol: cfg.protocol,
    baseUrl: cfg.baseUrl,
    endpoint,
    createPath: cfg.createPath || "",
    workflowId: cfg.workflowId || "",
    defaultModel: cfg.defaultModel,
    credentialFingerprint: createHash("sha256").update(cfg.apiKey).digest("hex").slice(0, 16),
    idempotencyStrategy: cfg.idempotencyStrategy,
    idempotencyBodyField: cfg.idempotencyBodyField || "",
  };
}
