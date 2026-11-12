import {publishedImagegenCapabilities} from "../imagegen/capabilities";
import type { FeatureId } from "../billing/rules/registry";
import { MODEL_BINDINGS, type ModelBinding } from "./bindings";
import { publicUpstreamIds } from "./channel-policy";
import { ModelConfigError, type ModelConfig, type PublicModel, type UpstreamModel } from "./types";

/** Pure feature-to-model policy shared by catalog, quotation, execution and
 * management. No repository, current snapshot, SDK, or business orchestration. */
export const FEATURE_BINDINGS: Partial<Record<FeatureId, ModelBinding>> = {
  "image.generate": "image.generate", "image.suite": "image.generate", "image.aplus": "image.generate",
  "tool.cutout": "image.cutout", "tool.upscale":"image.edit", "tool.printfile":"image.edit", "tool.ipcheck": "text.competitor", "competitor.action": "image.edit",
  "canvas.text-generate": "text.generate", "canvas.assistant": "text.generate", "canvas.ocr": "vision.ocr",
  ...Object.fromEntries(["tool.garment", "tool.avatar", "tool.dewrinkle", "tool.dewatermark", "tool.style", "tool.tryon", "tool.retouch", "tool.recolor", "tool.replicate", "tool.inpaint", "tool.extract", "tool.garment3d", "tool.packaging3d", "canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate"].map(id => [id, "image.edit"])),
  "video.generate": "video.generate",
  "audio.speech": "audio.speech", "audio.transcribe": "audio.transcribe",
};

export function modelAllowedForFeature(model: PublicModel, feature?: string) {
  return !feature || !model.toolScope || feature.startsWith("canvas.") && model.toolScope.systems?.includes("canvas") || model.toolScope.features.includes(feature as never);
}

export function featureDefaultModel(config: ModelConfig, feature?: string, binding?: ModelBinding): string | undefined {
  return (feature && config.publicModels.find(m => m.enabled && m.visible && m.toolScope?.defaultFor.includes(feature as never))?.id) ||
    (feature && config.business?.[feature as keyof NonNullable<ModelConfig["business"]>]?.defaultModelId) || (binding && config.bindings[binding]) || undefined;
}

export function upstreamSupportsFeature(capabilities: UpstreamModel["capabilities"], binding: ModelBinding, feature?: string) {
  // Canvas admits both plain generation and reference editing. The concrete
  // request still resolves its own binding and compatible supplier subset.
  const capability=MODEL_BINDINGS[binding].capability;
  const edit=publishedImagegenCapabilities(capabilities).edit?.state==="supported";
  return feature === "canvas.image" ? capabilities.generate || edit : capability==="edit" ? edit : capabilities[capability];
}

export function compatiblePublicModels(config: ModelConfig, binding: ModelBinding, feature?: string) {
  const purpose = MODEL_BINDINGS[binding];
  return config.publicModels.filter(m => m.enabled && m.visible && m.modality === purpose.modality &&
    publicUpstreamIds(config,m).some(id => {
      const u = config.upstreamModels.find(u => u.id === id);
      return u?.enabled && upstreamSupportsFeature(u.capabilities, binding, feature) && config.providers.some(p => p.id === u.providerId && p.enabled);
    }));
}

export function assertToolScope(config: ModelConfig, feature: string | undefined, id: string, system?:"canvas") {
  const model = config.publicModels.find(m => m.id === id);
  if(system==="canvas" && ["image.aplus","image.suite"].includes(feature || "") && model?.toolScope?.systems?.includes("canvas"))return;
  if (model && !modelAllowedForFeature(model, feature)) throw new ModelConfigError("MODEL_OUTSIDE_TOOL_SCOPE", "该模型未应用到当前工具，请选择该工具已开放的模型", 400);
}
