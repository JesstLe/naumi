import { FEATURE_BINDINGS, selectedBusinessOption, upstreamSupportsFeature } from "./business";
import "server-only";
import { requestedFeatureModel } from "./selection-policy";
import type { FeatureId } from "../billing/rules/registry";
import { MODEL_BINDINGS, type ModelBinding } from "./bindings";
import { currentExecutionBundle, currentModelExecution } from "./context";
import { modelConfigurationEnabled } from "./requests";
import { getModelAdministration } from "./server";
import { ModelConfigError } from "./types";
import { presetPublicId, selectedImagePreset } from "./image-preset";
import {featureDefaultModel,assertToolScope} from "./tool-scope";

const billingBinding = (feature: FeatureId) => FEATURE_BINDINGS[feature];

/** Read the same accepted registry used by execution, without preparing a route or contacting a supplier. */
export async function managedBillingModel(request: Request, feature: FeatureId, selected?: string) {
  const binding = billingBinding(feature);
  if (!binding || !await modelConfigurationEnabled()) return null;
  const role = binding.startsWith("vision.") ? "vision" : MODEL_BINDINGS[binding].modality;
  const scope = currentModelExecution(role);
  if (scope && (scope.frozen.binding === binding || feature === "canvas.image" && scope.frozen.binding === "image.generate") && (!scope.frozen.feature || scope.frozen.feature === feature)) return { modelId: scope.frozen.publicModelId, providerId: scope.connection.providerId };
  const admin = await getModelAdministration();
  const accepted = currentExecutionBundle()?.modelVersion || currentModelExecution()?.frozen.modelVersion;
  const snapshot = accepted ? await admin.repo.byVersion(accepted) : await admin.repo.current();
  const quoted = request.headers.get("x-naumi-model-version");
  if (role !== "image" && quoted && (!/^[1-9][0-9]{0,15}$/.test(quoted) || Number(quoted) !== snapshot.version))
    throw new ModelConfigError("MODEL_CHANGED", "模型配置已更新，请刷新模型列表后重新提交；原输入已保留", 409);
  const requested = requestedFeatureModel(feature, selected || (role === "text" ? request.headers.get("x-naumi-text-model")?.trim() : undefined));
  const preset = selectedImagePreset(snapshot.config,feature,requested,binding);
  if (preset) {const id=presetPublicId(preset,requested);assertToolScope(snapshot.config,feature,id,request.headers.get("x-naumi-canvas")==="1"?"canvas":undefined);return { modelId:id, providerId: snapshot.config.upstreamModels.find(u => u.id === preset.upstreamId)!.providerId };}
  const option = selectedBusinessOption(snapshot.config, feature, requested);
  if (feature === "tool.cutout" && !option && !snapshot.config.bindings[binding]) return null;
  const model = snapshot.config.publicModels.find(m => m.id === (option?.modelId || requested || featureDefaultModel(snapshot.config,feature,binding)) && m.enabled && m.modality === MODEL_BINDINGS[binding].modality && (!requested || m.visible));
  if (!model) throw new ModelConfigError("MODEL_UNAVAILABLE", "当前用途没有可用模型，请联系管理员配置", 409);
  assertToolScope(snapshot.config,feature,model.id,request.headers.get("x-naumi-canvas")==="1"?"canvas":undefined);
  if (model.target.type === "pool") return { modelId: model.id, providerId: "managed-router" };
  const upstream = snapshot.config.upstreamModels.find(u => u.id === model.target.id);
  const provider = snapshot.config.providers.find(p => p.id === upstream?.providerId);
  if (!upstream?.enabled || !provider?.enabled || !upstreamSupportsFeature(upstream.capabilities, binding, feature))
    throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不支持当前操作", 400);
  return { modelId: model.id, providerId: ["apimart-images", "fal-images"].includes(provider.protocol) ? "managed-router" : provider.id };
}
