import "server-only";
import {publishedImagegenCapabilities} from "../imagegen/capabilities";
import { compatiblePublicModels, FEATURE_BINDINGS, featureDefaultModel, modelAllowedForFeature } from "./feature-model-policy";
import {isSeedreamWire} from "./seedream-preflight";
import {adminConfiguredFeature} from "./selection-policy";
import {MODEL_BINDINGS} from "./bindings";
import {publicUpstreamIds} from "./channel-policy";
import type {FeatureId} from "../billing/rules/registry";
import type {ModelSnapshot,Modality} from "./types";
import {DISPLAY_QUALITIES,selectedImagePreset} from "./image-preset";
import {qualityPresentation} from "./quality-policy";

export function publicModelCatalog(snapshot: ModelSnapshot, modality: Modality, feature?: FeatureId, includeAll = false) {
  const config = snapshot.config;
  const f = feature ? config.business?.[feature] : undefined;
  const compatible = feature && FEATURE_BINDINGS[feature] ? compatiblePublicModels(config, FEATURE_BINDINGS[feature]!, feature).map(m => m.id) : undefined;
  const preset = selectedImagePreset(config,feature,undefined,feature ? undefined : "image.generate");
  let defaultModelId = preset ? preset.aliases[0].id : featureDefaultModel(config,feature,feature ? FEATURE_BINDINGS[feature] : undefined);
  const configuredIds = f?.enabled===false ? [] : preset ? [...preset.aliases.map(a => a.id),...(f?.options.filter(o => o.enabled && !preset.defaultModelIds.includes(o.modelId)).map(o => o.modelId) || [])] : f ? [...f.options].filter(o => o.enabled).sort((a,b) => a.sort-b.sort).map(o => o.modelId) : undefined;
  const configuredProcessor = adminConfiguredFeature(feature) && f?.enabled !== false
    ? config.publicModels.find(m => m.id === defaultModelId && m.enabled && m.modality === modality && modelAllowedForFeature(m, feature) && (!configuredIds || configuredIds.includes(m.id)))
    : undefined;
  const processorAvailable = !!configuredProcessor && publicUpstreamIds(config, configuredProcessor).some(id => {
    const upstream = config.upstreamModels.find(u => u.id === id);
    const binding = feature ? FEATURE_BINDINGS[feature] : undefined;
    return upstream?.enabled && binding && upstream.capabilities[MODEL_BINDINGS[binding].capability] && config.providers.some(p => p.id === upstream.providerId && p.enabled && !!p.credentialRef);
  });
  const models = config.publicModels.filter(m => m.enabled && m.visible && m.modality === modality && modelAllowedForFeature(m,feature) && (!compatible || compatible.includes(m.id)) && (!configuredIds || configuredIds.includes(m.id))).sort((a,b) => configuredIds ? configuredIds.indexOf(a.id)-configuredIds.indexOf(b.id) : 0).map(m => {
    const ids = publicUpstreamIds(config,m);
    const upstreams = config.upstreamModels.filter(u => ids.includes(u.id) && u.enabled && config.providers.some(p => p.id === u.providerId && p.enabled));
    const referenceChannels=upstreams.filter(u=>u.capabilities.edit&&publishedImagegenCapabilities(u.capabilities).edit?.state==="supported"&&config.providers.some(p=>p.id===u.providerId&&!!p.credentialRef));
    const references={maxReferenceImages:referenceChannels.length?Math.max(...referenceChannels.map(u=>u.capabilities.maxReferenceImages)):0,referenceLimitVerified:referenceChannels.length>0&&referenceChannels.every(u=>u.capabilities.verified)};
    const option = f?.options.find(o => o.modelId === m.id);
    const adapterRatios = upstreams.map(u => config.providers.find(p => p.id === u.providerId)?.options?.imageRatios).find(Boolean)
      || (!m.supplierRouting && !option?.parameters?.ratios
        ? upstreams.find(u => isSeedreamWire(u.model) && config.providers.find(p => p.id === u.providerId)?.protocol === "apimart-images")?.parameterMap.apimartImages?.ratios
        : undefined);
    if (preset?.aliases.some(a => a.id === m.id)) return { id:m.id,...(m.previousIds?{previousIds:m.previousIds}:{}),label:m.label,modality:m.modality,supportsEdit:true,supportsVision:false,...references,qualities:[...DISPLAY_QUALITIES],nativeResolutions:preset.resolutions,generationParameters:{ratios:preset.ratios,resolutions:m.displayResolutions || preset.resolutions,combinations:Object.keys(preset.outputDimensions || {})},qualitySupported:true };
    return { id: m.id, ...(m.previousIds?{previousIds:m.previousIds}:{}), label: m.label, modality: m.modality, supportsEdit: referenceChannels.length>0, supportsVision: upstreams.some(u => u.capabilities.vision), ...references, qualities: option?.parameters?.qualities || Array.from(new Set(upstreams.flatMap(u => u.capabilities.qualities))), ...qualityPresentation(upstreams), nativeResolutions: option?.parameters?.resolutions || Array.from(new Set(upstreams.flatMap(u => u.capabilities.nativeResolutions))), generationParameters: m.displayResolutions || adapterRatios || option?.parameters ? {ratios:adapterRatios || option?.parameters?.ratios,resolutions:m.displayResolutions || option?.parameters?.resolutions} : undefined, qualitySupported: upstreams.some(u => u.capabilities.qualities.length > 0) };
  });
  if(!models.some(m=>m.id===defaultModelId))defaultModelId=models[0]?.id;
  const publishedModels = !includeAll && adminConfiguredFeature(feature) ? models.filter(m => m.id === defaultModelId) : models;
  const visible = new Set(publishedModels.map(m => m.id));
  const bindingCapabilities = Object.fromEntries(Object.entries(config.bindings).flatMap(([binding,id]) => {
    const m = config.publicModels.find(m => m.id === id && m.enabled && m.modality === modality);
    if (!m) return [];
    const ids = publicUpstreamIds(config,m);
    const upstreams = config.upstreamModels.filter(u => ids.includes(u.id) && u.enabled && config.providers.some(p => p.id === u.providerId && p.enabled));
    const defaultPreset = selectedImagePreset(config,undefined,id,binding);
    return [[binding,{ qualities: defaultPreset ? [...DISPLAY_QUALITIES] : qualityPresentation(upstreams)?.qualities || Array.from(new Set(upstreams.flatMap(u => u.capabilities.qualities))), nativeResolutions: defaultPreset?.resolutions || Array.from(new Set(upstreams.flatMap(u => u.capabilities.nativeResolutions))) }]];
  }));
  return { version: snapshot.version, feature, selectionMode: adminConfiguredFeature(feature) ? "admin" : "user", available: adminConfiguredFeature(feature) ? processorAvailable : publishedModels.length > 0, defaultModelId, models: publishedModels, bindingCapabilities, bindings: Object.fromEntries(Object.entries(config.bindings).map(([binding,id]) => [binding, selectedImagePreset(config,undefined,id,binding)?.aliases[0].id || id]).filter(([, id]) => visible.has(id))) };
}
