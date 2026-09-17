import { getOpenAISettings } from "@/lib/settings";

export type ImageModelProvider = "openai-images" | "new-api-flow";

export type ImageModelDescriptor = {
  id: string;
  label: string;
  supportsEdit: boolean;
  provider: ImageModelProvider;
};

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
    /^imagen-\d+(?:\.\d+)?-generate-preview-(?:landscape|portrait)$/i.test(model)
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
  const aspect = aspectLabel(model);
  if (model.startsWith("gemini-3.1-flash-image-")) {
    return `Gemini 3.1 Flash · ${aspect}`;
  }
  if (model.startsWith("gemini-3.0-pro-image-")) {
    return `Gemini 3.0 Pro · ${aspect}`;
  }
  if (model.startsWith("imagen-4.0-generate-preview-")) {
    return `Imagen 4 Preview · ${aspect}`;
  }
  return model;
}

export function getNewApiImageSettings() {
  return {
    baseUrl: normalizeBaseUrl(process.env.NEW_API_IMAGE_BASE_URL || ""),
    apiKey: (process.env.NEW_API_IMAGE_API_KEY || "").trim(),
    configuredModels: normalizeModels(process.env.NEW_API_IMAGE_MODELS || ""),
  };
}

async function discoverNewApiModels(): Promise<string[]> {
  const settings = getNewApiImageSettings();
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

export async function getImageModelCatalog(): Promise<ImageModelDescriptor[]> {
  const primary = await getOpenAISettings();
  const openaiModels = primary.models.map((id) => ({
    id,
    label: id,
    supportsEdit: id.startsWith("gpt-image"),
    provider: "openai-images" as const,
  }));
  const flowModels = (await discoverNewApiModels()).map((id) => ({
    id,
    label: flowModelLabel(id),
    supportsEdit: true,
    provider: "new-api-flow" as const,
  }));
  const merged = new Map<string, ImageModelDescriptor>();
  for (const model of [...openaiModels, ...flowModels]) {
    if (!merged.has(model.id)) merged.set(model.id, model);
  }
  return Array.from(merged.values());
}

export async function resolveImageModel(model: string) {
  return (await getImageModelCatalog()).find((item) => item.id === model) || null;
}

