import "server-only";
import type { FeatureId } from "../billing/rules/registry";
import { MODEL_BINDINGS, type ModelBinding } from "./bindings";
import { currentExecutionBundle, currentModelExecution } from "./context";
import { modelConfigurationEnabled } from "./requests";
import { getModelAdministration } from "./server";
import { ModelConfigError } from "./types";

function billingBinding(feature: FeatureId): ModelBinding | undefined {
  if (feature === "tool.upscale" || feature === "tool.printfile") return undefined;
  if (feature === "video.generate") return "video.generate";
  if (feature === "canvas.ocr") return "vision.ocr";
  if (feature === "canvas.text-generate" || feature === "canvas.assistant") return "text.generate";
  if (feature === "tool.ipcheck" || feature === "competitor.action") return "text.competitor";
  if (feature === "tool.cutout") return "image.cutout";
  if (["image.generate", "image.suite", "image.aplus"].includes(feature)) return "image.generate";
  return "image.edit";
}

/** Read the same accepted registry used by execution, without preparing a route or contacting a supplier. */
export async function managedBillingModel(request: Request, feature: FeatureId, selected?: string) {
  const binding = billingBinding(feature);
  if (!binding || !await modelConfigurationEnabled()) return null;
  const role = binding.startsWith("vision.") ? "vision" : MODEL_BINDINGS[binding].modality;
  const scope = currentModelExecution(role);
  if (scope?.frozen.binding === binding) return { modelId: scope.frozen.publicModelId, providerId: scope.connection.providerId };
  const admin = await getModelAdministration();
  const accepted = currentExecutionBundle()?.modelVersion || currentModelExecution()?.frozen.modelVersion;
  const snapshot = accepted ? await admin.repo.byVersion(accepted) : await admin.repo.current();
  const quoted = request.headers.get("x-naumi-model-version");
  if (quoted && (!/^[1-9][0-9]{0,15}$/.test(quoted) || Number(quoted) !== snapshot.version))
    throw new ModelConfigError("MODEL_CHANGED", "模型配置已更新，请刷新模型列表后重新提交；原输入已保留", 409);
  const requested = selected || (role === "text" ? request.headers.get("x-naumi-text-model")?.trim() : undefined);
  const model = snapshot.config.publicModels.find(m => m.id === (requested || snapshot.config.bindings[binding]) && m.enabled && m.modality === MODEL_BINDINGS[binding].modality && (!requested || m.visible));
  if (!model) throw new ModelConfigError("MODEL_UNAVAILABLE", "当前用途没有可用模型，请联系管理员配置", 409);
  if (model.target.type === "pool") return { modelId: model.id, providerId: "managed-router" };
  const upstream = snapshot.config.upstreamModels.find(u => u.id === model.target.id);
  const provider = snapshot.config.providers.find(p => p.id === upstream?.providerId);
  if (!upstream?.enabled || !provider?.enabled || !upstream.capabilities[MODEL_BINDINGS[binding].capability])
    throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不支持当前操作", 400);
  return { modelId: model.id, providerId: ["apimart-images", "fal-images"].includes(provider.protocol) ? "managed-router" : provider.id };
}
