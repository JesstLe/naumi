import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import {
  deleteUserImageProviderRecord,
  getUserImageProviderRecord,
  upsertUserImageProviderRecord,
} from "@/lib/db";
import { decryptAtRest, encryptAtRest, maskKey } from "@/lib/settings";

export type UserImageProviderProtocol = "openai-images" | "chat-completions";

export type UserImageProvider = {
  enabled: boolean;
  protocol: UserImageProviderProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
};

export const USER_IMAGE_MODEL_PREFIX = "byok:";

export function userImageModelId(model: string) {
  return `${USER_IMAGE_MODEL_PREFIX}${model}`;
}

export function upstreamUserImageModel(model: string) {
  return model.startsWith(USER_IMAGE_MODEL_PREFIX)
    ? model.slice(USER_IMAGE_MODEL_PREFIX.length)
    : model;
}

export function normalizeUserImageModels(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  return Array.from(
    new Set(
      source
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0 && item.length <= 120)
        .filter((item) => /^[a-zA-Z0-9._:/-]+$/.test(item))
    )
  ).slice(0, 40);
}

export function normalizeUserImageBaseUrl(value: string): string {
  const raw = value.trim().replace(/\/+$/, "");
  if (!raw) return "";
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("接口地址必须以 http:// 或 https:// 开头");
  }
  if (parsed.username || parsed.password) {
    throw new Error("接口地址不能包含账号或密码");
  }
  return raw;
}

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }
  return false;
}

export async function assertUserImageBaseUrlAllowed(baseUrl: string) {
  const parsed = new URL(normalizeUserImageBaseUrl(baseUrl));
  const allowPrivate =
    process.env.USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK === "true" ||
    process.env.NODE_ENV !== "production";
  if (allowPrivate) return;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".local") || isPrivateAddress(hostname)) {
    throw new Error("当前部署不允许连接本机或内网接口地址");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("当前部署不允许连接解析到内网的接口地址");
  }
}

export async function getUserImageProvider(
  email: string
): Promise<UserImageProvider | null> {
  const row = await getUserImageProviderRecord(email);
  if (!row) return null;
  const baseUrl = decryptAtRest(row.baseUrlEnc) || "";
  const apiKey = decryptAtRest(row.apiKeyEnc) || "";
  const models = normalizeUserImageModels(row.models);
  const defaultModel = models.includes(row.defaultModel)
    ? row.defaultModel
    : models[0] || "";
  return {
    enabled: row.enabled,
    protocol: row.protocol,
    baseUrl,
    apiKey,
    models,
    defaultModel,
  };
}

export async function getUserImageProviderView(email: string) {
  const provider = await getUserImageProvider(email);
  return {
    configured: !!provider?.baseUrl && !!provider?.apiKey && !!provider?.models.length,
    enabled: provider?.enabled ?? false,
    protocol: provider?.protocol ?? ("openai-images" as const),
    baseUrl: provider?.baseUrl ?? "",
    hasKey: !!provider?.apiKey,
    keyMasked: maskKey(provider?.apiKey || ""),
    models: provider?.models ?? [],
    defaultModel: provider?.defaultModel ?? "",
  };
}

export async function saveUserImageProvider(input: {
  email: string;
  enabled: boolean;
  protocol: UserImageProviderProtocol;
  baseUrl: string;
  apiKey?: string;
  models: unknown;
  defaultModel: string;
}) {
  const existing = await getUserImageProvider(input.email);
  const baseUrl = normalizeUserImageBaseUrl(input.baseUrl);
  if (baseUrl) await assertUserImageBaseUrlAllowed(baseUrl);
  const apiKey = input.apiKey?.trim() || existing?.apiKey || "";
  const models = normalizeUserImageModels(input.models);
  const defaultModel = models.includes(input.defaultModel.trim())
    ? input.defaultModel.trim()
    : models[0] || "";
  if (input.enabled && (!baseUrl || !apiKey || !models.length || !defaultModel)) {
    throw new Error("启用前请填写接口地址、API Key 和至少一个模型");
  }
  await upsertUserImageProviderRecord({
    email: input.email,
    enabled: input.enabled,
    protocol:
      input.protocol === "chat-completions" ? "chat-completions" : "openai-images",
    baseUrlEnc: baseUrl ? encryptAtRest(baseUrl) : "",
    apiKeyEnc: apiKey ? encryptAtRest(apiKey) : "",
    models,
    defaultModel,
  });
  return getUserImageProviderView(input.email);
}

export async function clearUserImageProvider(email: string) {
  await deleteUserImageProviderRecord(email);
}

export async function discoverUserImageModels(
  email: string,
  overrides?: { baseUrl?: string; apiKey?: string }
): Promise<string[]> {
  const provider = await getUserImageProvider(email);
  const baseUrl = overrides?.baseUrl
    ? normalizeUserImageBaseUrl(overrides.baseUrl)
    : provider?.baseUrl || "";
  const apiKey = overrides?.apiKey?.trim() || provider?.apiKey || "";
  if (!baseUrl || !apiKey) {
    throw new Error("请先保存接口地址和 API Key");
  }
  await assertUserImageBaseUrlAllowed(baseUrl);
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`模型接口返回 ${response.status}：${raw.slice(0, 240)}`);
  }
  let body: { data?: Array<{ id?: string }> };
  try {
    body = JSON.parse(raw) as { data?: Array<{ id?: string }> };
  } catch {
    throw new Error("模型接口没有返回有效 JSON");
  }
  return normalizeUserImageModels((body.data || []).map((item) => item.id || ""));
}
