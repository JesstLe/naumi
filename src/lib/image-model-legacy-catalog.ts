import "server-only";
import {getLegacyOpenAISettings} from "@/lib/settings";
import {currentModelExecution} from "./model-config/context";
import {getUserImageProvider,userImageModelId} from "@/lib/user-image-provider";
import {imageModelFamily} from "@/lib/image-model-routing";
import type {ImageModelDescriptor} from "./image-model-catalog-types";

type CachedCatalog = {
  expiresAt: number;
  models: string[];
};

let newApiCatalogCache: CachedCatalog | null = null;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeModels(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  return Array.from(
    new Set(
      source
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0 && item.length <= 100)
        .filter((item) => /^[a-zA-Z0-9._:/-]+$/.test(item))
    )
  ).slice(0, 40);
}

export function isNewApiFlowImageModel(model: string) {
  return (
    /^gemini-\d+(?:\.\d+)?-(?:pro|flash)-image-(?:landscape|portrait|square|four-three|three-four)$/i.test(
      model
    ) ||
    /^imagen-\d+(?:\.\d+)?-generate-preview-(?:landscape|portrait)$/i.test(model) ||
    /^nano-banana-(?:pro|2(?:\.1)?)$/i.test(model) ||
    // 即梦 jimeng-free-api:chat/completions 流式生图协议与 new-api-flow 兼容
    /^jimeng-image-[a-z0-9][a-z0-9.-]*$/i.test(model)
  );
}

export function isOpenAIImagesEditModel(model: string) {
  const scope = currentModelExecution("image");
  if (scope && [scope.frozen.publicModelId,scope.connection.wireModel].includes(model)) return scope.capabilities.edit;
  return (
    model.startsWith("gpt-image") ||
    /^naumi-image-(?:auto|economy|standard|premium)$/i.test(model)
  );
}

function aspectLabel(model: string) {
  if (model.endsWith("four-three")) return "横版 4:3";
  if (model.endsWith("three-four")) return "竖版 3:4";
  if (model.endsWith("landscape")) return "横版";
  if (model.endsWith("portrait")) return "竖版";
  if (model.endsWith("square")) return "方图";
  return "";
}

function flowModelLabel(model: string) {
  const family = imageModelFamily(model);
  if (family === "nano-banana-2") return "Nano Banana 2";
  if (family === "nano-banana-pro") return "Nano Banana Pro";
  if (family === "imagen-4") return "Imagen 4";
  return model;
}

export function getLegacyNewApiImageSettings() {
  return {
    baseUrl: normalizeBaseUrl(process.env.NEW_API_IMAGE_BASE_URL || ""),
    apiKey: (process.env.NEW_API_IMAGE_API_KEY || "").trim(),
    configuredModels: normalizeModels(process.env.NEW_API_IMAGE_MODELS || ""),
  };
}

async function discoverNewApiModels(): Promise<string[]> {
  const settings = getLegacyNewApiImageSettings();
  if (!settings.baseUrl || !settings.apiKey) return [];
  if (newApiCatalogCache && newApiCatalogCache.expiresAt > Date.now()) {
    return newApiCatalogCache.models;
  }

  const fallback = settings.configuredModels.filter(isNewApiFlowImageModel);
  try {
    const response = await fetch(`${settings.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`model catalog ${response.status}`);
    const body = (await response.json()) as { data?: { id?: string }[] };
    const models = normalizeModels((body.data || []).map((item) => item.id || "")).filter(
      isNewApiFlowImageModel
    );
    const resolved = models.length ? models : fallback;
    newApiCatalogCache = {
      models: resolved,
      expiresAt: Date.now() + 5 * 60_000,
    };
    return resolved;
  } catch {
    newApiCatalogCache = {
      models: fallback,
      expiresAt: Date.now() + 30_000,
    };
    return fallback;
  }
}

export async function getLegacyImageModelCatalog(
  email?: string | null
): Promise<ImageModelDescriptor[]> {
  const primary = await getLegacyOpenAISettings();
  const openaiModels = primary.models.map((id) => ({
    id,
    label: id,
    supportsEdit: isOpenAIImagesEditModel(id),
    provider: "openai-images" as const,
  }));
  const flowModels = (await discoverNewApiModels()).map((id) => ({
    id,
    label: flowModelLabel(id),
    supportsEdit: true,
    provider: "new-api-flow" as const,
  }));
  const userProvider = email ? await getUserImageProvider(email) : null;
  const userModels =
    userProvider &&
    userProvider.baseUrl &&
    userProvider.apiKey &&
    userProvider.models.length
      ? userProvider.models.map((model) => ({
          id: userImageModelId(model),
          label: `自定义 · ${model}`,
          supportsEdit:
            userProvider.protocol === "chat-completions" || model.startsWith("gpt-image"),
          provider:
            userProvider.protocol === "chat-completions"
              ? ("user-chat-completions" as const)
              : ("user-openai-images" as const),
        }))
      : [];
  const merged = new Map<string, ImageModelDescriptor>();
  for (const model of [...userModels, ...openaiModels, ...flowModels]) {
    if (!merged.has(model.id)) merged.set(model.id, model);
  }
  return Array.from(merged.values());
}
