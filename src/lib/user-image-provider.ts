import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import {
  activateUserImageProviderRecord,
  countUserImageProviderRecords,
  deleteUserImageProviderRecord,
  getUserImageProviderRecord,
  getUserImageProviderRecordById,
  listUserImageProviderRecords,
  upsertUserImageProviderRecord,
} from "@/lib/db";
import { decryptAtRest, encryptAtRest, maskKey } from "@/lib/settings";

export type UserImageProviderProtocol = "openai-images" | "chat-completions";

export type UserImageProvider = {
  id: string;
  name: string;
  isActive: boolean;
  protocol: UserImageProviderProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
};

/** Private durable payload only; never return this credential envelope to the browser. */
export function freezeUserImageProvider(email: string, provider: UserImageProvider): string {
  return encryptAtRest(JSON.stringify({ version: 1, actor: email.trim().toLowerCase(), provider }));
}

export function restoreUserImageProvider(email: string, envelope: string): UserImageProvider {
  const plain = decryptAtRest(envelope);
  if (!plain) throw new Error("任务自定义接口凭据无法解密，请联系管理员核查");
  const saved = JSON.parse(plain);
  const p = saved.provider;
  if (saved.version !== 1 || saved.actor !== email.trim().toLowerCase() || !p ||
      typeof p.id !== "string" || typeof p.baseUrl !== "string" || typeof p.apiKey !== "string" ||
      !["openai-images", "chat-completions"].includes(p.protocol) || !Array.isArray(p.models) ||
      !p.models.every((m: unknown) => typeof m === "string")) throw new Error("任务自定义接口快照无效");
  return p as UserImageProvider;
}

/**
 * 读出供应商密文字段。落库策略(2026-09-24 起):服务器存明文,传输全程密文——
 * 列名保留 *_enc 只是历史兼容;库里可能仍有旧版 AES 密文,读时先尝试解密,
 * 解不开按明文原样返回(旧密文 → 下次保存自动转成明文)。
 */
function readSecret(value: string): string {
  if (!value) return "";
  return decryptAtRest(value) ?? value;
}

/** 每人最多保存的供应商数(防滥用)。 */
export const MAX_USER_IMAGE_PROVIDERS = 8;

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

export async function listUserImageProviders(
  email: string
): Promise<UserImageProvider[]> {
  const rows = await listUserImageProviderRecords(email);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    protocol: row.protocol,
    baseUrl: readSecret(row.baseUrlEnc),
    apiKey: readSecret(row.apiKeyEnc),
    models: normalizeUserImageModels(row.models),
    defaultModel: row.models.includes(row.defaultModel) ? row.defaultModel : "",
  }));
}

/** 消费侧入口:取当前激活的供应商(任何时刻至多一个;目录与生图都只认它)。 */
export async function getUserImageProvider(
  email: string
): Promise<UserImageProvider | null> {
  const row = await getUserImageProviderRecord(email);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isActive: true,
    protocol: row.protocol,
    baseUrl: readSecret(row.baseUrlEnc),
    apiKey: readSecret(row.apiKeyEnc),
    models: normalizeUserImageModels(row.models),
    defaultModel: row.models.includes(row.defaultModel) ? row.defaultModel : row.models[0] || "",
  };
}

export type UserImageProviderView = {
  id: string;
  name: string;
  isActive: boolean;
  protocol: UserImageProviderProtocol;
  baseUrl: string;
  hasKey: boolean;
  keyMasked: string;
  models: string[];
  defaultModel: string;
};

export async function getUserImageProviderViews(email: string): Promise<UserImageProviderView[]> {
  const providers = await listUserImageProviders(email);
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    isActive: provider.isActive,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    hasKey: !!provider.apiKey,
    keyMasked: maskKey(provider.apiKey || ""),
    models: provider.models,
    defaultModel: provider.defaultModel || provider.models[0] || "",
  }));
}

export async function saveUserImageProvider(input: {
  email: string;
  id?: string;
  name: string;
  activate: boolean;
  protocol: UserImageProviderProtocol;
  baseUrl: string;
  apiKey?: string;
  models: unknown;
  defaultModel: string;
}): Promise<{ savedId: string; views: UserImageProviderView[] }> {
  const existing = input.id
    ? await getUserImageProviderRecordById(input.email, input.id)
    : null;
  if (input.id && !existing) throw new Error("供应商不存在或已删除");

  let activate = input.activate;
  if (!existing) {
    const count = await countUserImageProviderRecords(input.email);
    if (count >= MAX_USER_IMAGE_PROVIDERS) {
      throw new Error(`最多保存 ${MAX_USER_IMAGE_PROVIDERS} 个供应商，请先删除不需要的`);
    }
    // 第一个供应商保存后自动成为当前使用,避免配好了却没生效
    if (count === 0) activate = true;
  }

  const baseUrl = normalizeUserImageBaseUrl(input.baseUrl);
  if (baseUrl) await assertUserImageBaseUrlAllowed(baseUrl);
  const apiKey = input.apiKey?.trim() || (existing
    ? readSecret(existing.apiKeyEnc)
    : "");
  const models = normalizeUserImageModels(input.models);
  const defaultModel = models.includes(input.defaultModel.trim())
    ? input.defaultModel.trim()
    : models[0] || "";
  if (activate && (!baseUrl || !apiKey || !models.length || !defaultModel)) {
    throw new Error("设为当前使用前请填写接口地址、API Key 和至少一个模型");
  }
  const name = (input.name || "").trim().slice(0, 40) || "未命名供应商";

  const saved = await upsertUserImageProviderRecord({
    id: existing?.id || "",
    email: input.email,
    name,
    isActive: activate,
    enabled: activate,
    protocol:
      input.protocol === "chat-completions" ? "chat-completions" : "openai-images",
    baseUrlEnc: baseUrl || existing?.baseUrlEnc || "",
    apiKeyEnc: apiKey,
    models,
    defaultModel,
  });
  if (activate) {
    await activateUserImageProviderRecord(input.email, saved.id).catch(() => {});
  }
  return { savedId: saved.id, views: await getUserImageProviderViews(input.email) };
}

export async function setActiveUserImageProvider(email: string, id: string) {
  const record = await getUserImageProviderRecordById(email, id);
  if (!record) throw new Error("供应商不存在或已删除");
  const baseUrl = readSecret(record.baseUrlEnc);
  const apiKey = readSecret(record.apiKeyEnc);
  const models = normalizeUserImageModels(record.models);
  if (!baseUrl || !apiKey || !models.length) {
    throw new Error("该供应商配置不完整，请先补全接口地址、API Key 和模型后再启用");
  }
  await assertUserImageBaseUrlAllowed(baseUrl);
  const ok = await activateUserImageProviderRecord(email, id);
  if (!ok) throw new Error("供应商不存在或已删除");
  return getUserImageProviderViews(email);
}
export async function clearUserImageProvider(email: string, id?: string) {
  await deleteUserImageProviderRecord(email, id);
  return getUserImageProviderViews(email);
}

export async function discoverUserImageModels(
  email: string,
  overrides?: { baseUrl?: string; apiKey?: string; providerId?: string }
): Promise<string[]> {
  let baseUrl = overrides?.baseUrl
    ? normalizeUserImageBaseUrl(overrides.baseUrl)
    : "";
  let apiKey = overrides?.apiKey?.trim() || "";
  if ((!baseUrl || !apiKey) && overrides?.providerId) {
    const record = await getUserImageProviderRecordById(email, overrides.providerId);
    if (record) {
      baseUrl = baseUrl || readSecret(record.baseUrlEnc);
      apiKey = apiKey || readSecret(record.apiKeyEnc);
    }
  }
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
