import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { VideoProviderRuntimeConfig } from "../video/providers/config";
import type { createCredentialStore } from "./credentials";
import { validateModelConfig, type ValidationOptions } from "./schema";
import { ModelConfigError, type ModelConfig, type ModelProvider, type UpstreamModel } from "./types";
import { legacyAgentVision } from "./legacy-vision";
import { configuredVideoCapability } from "../video/capabilities";

type LegacyImage = { baseUrl: string; apiKey: string; models: string[]; defaultModel: string; cutoutModel?: string; qualitySupported: boolean; editModels?: string[] };
type LegacyText = { baseUrl: string; apiKey: string; defaultModel: string; agentModel: string; models: string[]; aliases: Record<string,string>; visibleModels: string[]; visionModels?: string[]; agent?: { baseUrl: string; apiKey: string }; vision?: { model: string; baseUrl: string; apiKey: string }; ocr?: { model: string; baseUrl: string; apiKey: string }; agentVisionModel?: string };
export type LegacyModelSources = { image?: LegacyImage; flow?: LegacyImage; text?: LegacyText; video: VideoProviderRuntimeConfig[]; router?: ModelConfig };
const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
function publicId(model: string, modality: string) { return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(model) ? model : `${modality}-${shortHash(model)}`; }
const unverifiedCapabilities = (): UpstreamModel["capabilities"] => ({ verified: false, generate: true, edit: false, vision: false, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: 3, qualities: [], nativeResolutions: [], maxReferenceImages: 0, expectedLatencyMs: 0 });

/** Called under the repository's bootstrap transaction/lock. It never generates or changes billing. */
export async function bootstrapModelConfig(input: ValidationOptions & { credentials: ReturnType<typeof createCredentialStore>; sources: LegacyModelSources; tx?: PoolClient }): Promise<ModelConfig> {
  const config: ModelConfig = { schemaVersion: 1, providers: [], upstreamModels: [], publicModels: [], pools: [], bindings: {} };
  const addProvider = async (id: string, name: string, protocol: ModelProvider["protocol"], baseUrl: string, apiKey: string, options?: ModelProvider["options"]) => {
    const ref = await input.credentials.importPlain({ providerId: id, plain: apiKey, actor: "system" }, input.tx);
    config.providers.push({ id, name, protocol, baseUrl: baseUrl || "https://api.openai.com/v1", credentialRef: ref.id, enabled: true, timeoutMs: protocol === "openai-images" || protocol === "new-api-flow" ? 280000 : protocol === "openai-chat" ? 90000 : 120000, maxConcurrent: 4, ...(options ? { options } : {}) });
  };
  const addModel = (providerId: string, wire: string, modality: UpstreamModel["modality"], alias = wire, visible = true, capabilities = unverifiedCapabilities()) => {
    const id = `${providerId}:${shortHash(wire)}`;
    if (!config.upstreamModels.some(m => m.id === id)) config.upstreamModels.push({ id, providerId, model: wire, label: wire.slice(0, 100), modality, enabled: true, capabilities, parameterMap: {} });
    let external = publicId(alias, modality);
    const existing = config.publicModels.find(m => m.id === external);
    if (existing && (existing.target.id !== id || existing.modality !== modality)) external = `${modality}-${shortHash(`${providerId}:${alias}`)}`;
    if (!config.publicModels.some(m => m.id === external)) config.publicModels.push({ id: external, label: alias.slice(0, 100), modality, enabled: true, visible, target: { type: "upstream", id } });
    return external;
  };
  for (const [providerId, source, protocol, label] of [
    ["platform-images", input.sources.image, "openai-images", "现行主生图通道"],
    ["flow-images", input.sources.flow, "new-api-flow", "现行 Flow 通道"],
  ] as const) {
    if (!source?.apiKey || !source.defaultModel) continue;
    await addProvider(providerId, label, protocol, source.baseUrl, source.apiKey);
    for (const wire of Array.from(new Set([source.defaultModel, ...source.models, source.cutoutModel].filter((x): x is string => !!x)))) {
      const caps = unverifiedCapabilities();
      caps.edit = protocol === "new-api-flow" ? true : (source.editModels || []).includes(wire) || /^gpt-image|^naumi-image-(auto|economy|standard|premium)$/.test(wire);
      if (protocol === "new-api-flow") caps.maxReferenceImages = 6;
      caps.transparent = wire === source.cutoutModel && /^gpt-image-1(?:$|-)/.test(wire);
      caps.qualities = source.qualitySupported ? ["low", "medium", "high", "xhigh", "max", "auto"] : [];
      const external = addModel(providerId, wire, "image", wire, source.models.includes(wire), caps);
      if (providerId === "platform-images" && wire === source.defaultModel) { config.bindings["image.generate"] = external; if (caps.edit) config.bindings["image.edit"] = external; }
      if (caps.transparent && wire === source.cutoutModel) config.bindings["image.cutout"] = external;
    }
  }
  const text = input.sources.text;
  if (text?.apiKey && text.defaultModel) {
    const providerId = "platform-text"; await addProvider(providerId, "现行文字与视觉通道", "openai-chat", text.baseUrl, text.apiKey);
    // Legacy whitelists may contain wire IDs or public aliases. Normalize the
    // allowlist before comparing: otherwise every aliased default becomes hidden.
    const visibleWires = new Set(text.visibleModels.filter(id => !text.aliases[id]));
    const wires = new Set([text.defaultModel, ...(!text.agent ? [text.agentModel] : []), ...text.models, ...Object.values(text.aliases), ...(text.visionModels || []), ...text.visibleModels.map(id => text.aliases[id] || id)]);
    for (const wire of Array.from(wires).filter(Boolean)) {
      const aliases = Object.entries(text.aliases).filter(([, model]) => model === wire).map(([alias]) => alias);
      const caps = unverifiedCapabilities(); caps.vision = (text.visionModels || []).includes(wire);
      for (const alias of aliases.length ? aliases : [wire]) {
        const visible = text.visibleModels.length ? text.visibleModels.includes(alias) || visibleWires.has(wire) : text.models.includes(wire) || wire === text.defaultModel;
        const external = addModel(providerId, wire, "text", alias, visible, caps);
        if (wire === text.defaultModel && (!config.bindings["text.generate"] || visible)) config.bindings["text.generate"] = external;
        if (!text.agent && wire === text.agentModel && !config.bindings["agent.text"]) config.bindings["agent.text"] = external;
        if (caps.vision && !config.bindings["vision.reference"]) for (const binding of ["vision.reference", "vision.review", "vision.ocr", "agent.vision"]) config.bindings[binding] = external;
      }
    }
    if (text.agent) {
      await addProvider("platform-agent", "现行 Agent 通道", "openai-chat", text.agent.baseUrl, text.agent.apiKey);
      const caps = unverifiedCapabilities(); caps.vision = (text.visionModels || []).includes(text.agentModel);
      config.bindings["agent.text"] = addModel("platform-agent", text.agentModel, "text", text.agentModel, false, caps);
      // Canvas text used AGENT_* before managed routing. When that model is the
      // default, retain its account/endpoint rather than the image gateway's key.
      if (text.defaultModel === text.agentModel) {
        const textDefault = config.publicModels.find(m => m.id === config.bindings["text.generate"]);
        const agentDefault = config.publicModels.find(m => m.id === config.bindings["agent.text"]);
        if (textDefault && agentDefault) textDefault.target = { ...agentDefault.target };
      }
      if (caps.vision) config.bindings["agent.vision"] = config.bindings["agent.text"];
    }
    if (text.agentVisionModel) {
      const caps = unverifiedCapabilities(); caps.vision = true;
      config.bindings["agent.vision"] = addModel(text.agent ? "platform-agent" : providerId, text.agentVisionModel, "text", `agent-vision-${shortHash(text.agentVisionModel)}`, false, caps);
    }
    for (const [id, source, bindings] of [["platform-reference", text.vision, ["vision.reference", "vision.review"]], ["platform-ocr", text.ocr, ["vision.ocr"]]] as const) {
      if (!source?.apiKey || !source.model) continue;
      await addProvider(id, id === "platform-ocr" ? "现行 OCR 视觉通道" : "现行参考图视觉通道", "openai-chat", source.baseUrl, source.apiKey);
      const caps = unverifiedCapabilities(); caps.vision = true;
      const alias = addModel(id, source.model, "text", `${id}-${shortHash(source.model)}`, false, caps);
      for (const binding of bindings) config.bindings[binding] = alias;
    }
    config.bindings["agent.text"] ||= config.bindings["text.generate"];
    config.bindings["text.title"] = config.bindings["text.generate"];
    config.bindings["text.competitor"] = config.bindings["text.generate"];
  }
  for (const v of input.sources.video) {
    const id = `video:${v.id}`;
    const { createPath, pollPath, contentPath, rawAuthorization, workflowId, idempotencyStrategy, idempotencyBodyField } = v;
    await addProvider(id, v.label, v.protocol, v.baseUrl, v.apiKey, { createPath, pollPath, contentPath, rawAuthorization, workflowId, idempotencyStrategy, idempotencyBodyField });
    for (const wire of Array.from(new Set([v.defaultModel, ...v.models]))) {
      const caps = unverifiedCapabilities();
      caps.maxReferenceImages = configuredVideoCapability(v.protocol, v.id, wire).maxReferenceImages;
      const external = addModel(id, wire, "video", wire, true, caps);
      if (wire === v.defaultModel && !config.bindings["video.generate"]) config.bindings["video.generate"] = external;
    }
  }
  // The control-plane importer supplies a validated registry with locally imported immutable credential refs.
  // Merge its explicit aliases before first activation; unknown legacy capabilities stay direct/unverified.
  if (input.sources.router) {
    const router = input.sources.router;
    config.providers.push(...router.providers); config.upstreamModels.push(...router.upstreamModels); config.pools.push(...router.pools);
    for (const model of router.publicModels) {
      const index = config.publicModels.findIndex(m => m.id === model.id);
      if (index >= 0) config.publicModels[index] = model; else config.publicModels.push(model);
    }
  }
  if (!config.publicModels.length) throw new ModelConfigError("CONFIG_NOT_READY", "尚未完成可用模型配置，请先完成首启设置", 503);
  return validateModelConfig(config, input);
}

export async function readLegacyModelSources(): Promise<LegacyModelSources> {
  const [{ getLegacyOpenAISettings }, { getLegacyOpenAIBaseUrl }, { getLegacyNewApiImageSettings, getLegacyImageModelCatalog }, { configuredVideoProviders }] = await Promise.all([import("../settings"), import("../openai-base"), import("../image-model-catalog"), import("../video/providers/config")]);
  const [settings, baseUrl, catalog] = await Promise.all([getLegacyOpenAISettings(), getLegacyOpenAIBaseUrl(), getLegacyImageModelCatalog()]);
  const flow = getLegacyNewApiImageSettings();
  const list = (value?: string) => (value || "").split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
  const aliases = Object.fromEntries(list(process.env.TEXT_MODEL_ALIASES).map(x => x.split("=")).filter(pair => pair.length === 2));
  const defaultModel = process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna";
  const agentModel = process.env.AGENT_MODEL || "qwen3.8-flash";
  const agentVisionModel = process.env.AGENT_VISION_MODEL || (legacyAgentVision(agentModel) ? agentModel : undefined);
  const visionModels = [agentVisionModel, process.env.REFERENCE_VISION_MODEL, ...(legacyAgentVision(defaultModel, "") ? [defaultModel] : [])].filter((x): x is string => !!x);
  const agentBase = process.env.AGENT_BASE_URL || baseUrl || "https://api.openai.com/v1";
  const agentKey = process.env.AGENT_API_KEY || settings.apiKey;
  const imageVision = process.env.REFERENCE_VISION_SOURCE === "image";
  return {
    image: { baseUrl: baseUrl || "https://api.openai.com/v1", apiKey: settings.apiKey, models: settings.models, defaultModel: settings.model, cutoutModel: settings.cutoutModel, qualitySupported: process.env.NAUMI_IMAGE_QUALITY_SUPPORTED === "1", editModels: catalog.filter(m => m.provider === "openai-images" && m.supportsEdit).map(m => m.id) },
    flow: { baseUrl: flow.baseUrl, apiKey: flow.apiKey, models: catalog.filter(m => m.provider === "new-api-flow").map(m => m.id), defaultModel: catalog.find(m => m.provider === "new-api-flow")?.id || "", qualitySupported: false },
    text: { baseUrl: baseUrl || "https://api.openai.com/v1", apiKey: settings.apiKey, defaultModel, agentModel, models: Array.from(new Set([defaultModel, agentModel, ...list(process.env.OPENAI_TEXT_MODELS), ...list(process.env.AGENT_MODELS), ...visionModels])), aliases, visibleModels: list(process.env.TEXT_MODEL_WHITELIST), visionModels,
      agentVisionModel,
      vision: { model: process.env.REFERENCE_VISION_MODEL || (!imageVision && process.env.AGENT_VISION_MODEL) || "gpt-5.6-luna", baseUrl: imageVision ? baseUrl || "https://api.openai.com/v1" : agentBase, apiKey: imageVision ? settings.apiKey : agentKey },
      ocr: { model: process.env.PADDLE_OCR_FALLBACK_MODEL || process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna", baseUrl: baseUrl || agentBase, apiKey: settings.apiKey || agentKey },
      ...(process.env.AGENT_BASE_URL || process.env.AGENT_API_KEY ? { agent: { baseUrl: process.env.AGENT_BASE_URL || baseUrl || "https://api.openai.com/v1", apiKey: process.env.AGENT_API_KEY || settings.apiKey } } : {}) },
    video: configuredVideoProviders(),
  };
}
