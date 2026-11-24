import {accountImageModel} from "./account-image-policy";
import type {AccountImageGrant} from "../accounts/creation-policy";
import {canonicalPublicModelId} from "./public-identity";
import {resolveImageResolution,resolutionFacts} from "./resolution-fallback";
import {selectImageQuality} from "./image-quality-selection";
import {selectFeatureModel} from "./model-selection";
import {publicUpstreamIds} from "./channel-policy";
import {assertDisplayResolution} from "./resolution-options";
import {requestedFeatureModel} from "./selection-policy";
import { featureDefaultModel } from "./feature-model-policy";
import {effectiveImageParameters,type ImageParameters} from "./image-preset";
import {resolutionForLongSide} from "../mock-data";
import {routeImageModel} from "../image-model-routing";
import {legacyImagegenIntent} from "../imagegen/legacy-intent";
import {ModelConfigError,type ModelFacts,type ModelSnapshot} from "./types";
import type {ModelBinding} from "./bindings";
import type {BillingQuote,ConfigSnapshot} from "../billing/types";
import type {Intent} from "../imagegen/types";
import type {PreparedImageOperation} from "./prepared-image-contract";
export type {PreparedImageOperation} from "./prepared-image-contract";

export type ImagePreparationInput={accountImage?:AccountImageGrant;path:string;body:Record<string,any>;references:number;featureModel?:string|null;quality?:string|null;quote?:BillingQuote;feature?:string;binding:ModelBinding;accepted?:boolean;allowResolutionFallback?:boolean;resolvedFrame?:{ratio?:string;preserveModelIdentity?:boolean};advanced?:{intent:Intent;requestedParameters?:ImageParameters;eligibleUpstreamIds?:string[]}};
function imageRatio(width:number,height:number){const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;const g=gcd(Math.round(width),Math.round(height));return `${Math.round(width)/g}:${Math.round(height)/g}`;}

/** The authoritative parameter preparation used at preview or by legacy unprepared requests. */
export function prepareImageOperation(input:ImagePreparationInput,snapshot:ModelSnapshot,billing:ConfigSnapshot):PreparedImageOperation{
    const parsed={body:input.body,references:input.references},mainFeature=input.feature,purpose={image:input.binding},quotedImage=input.quote,accepted=input.accepted;
    const selected = String(parsed.body.model || parsed.body.modelId || "").trim();
    const explicit = accountImageModel(snapshot.config,input.accountImage,input.featureModel||selected||undefined)||"";
    const explicitModelId = requestedFeatureModel(mainFeature, explicit.startsWith("byok:") ? undefined : explicit || undefined);
    const featureDefault = featureDefaultModel(snapshot.config,mainFeature,purpose.image);
    const configuredModelId = canonicalPublicModelId(snapshot.config.publicModels, quotedImage?.facts.modelId || explicitModelId || featureDefault || snapshot.config.bindings[purpose.image]);
    const outputResolution = quotedImage?.effectiveParameters?.resolution || quotedImage?.requestedParameters?.resolution || quotedImage?.facts.resolution || (Number(parsed.body.targetWidth) > 0 && Number(parsed.body.targetHeight) > 0 ? resolutionForLongSide(Math.max(Number(parsed.body.targetWidth), Number(parsed.body.targetHeight))) : String(parsed.body.resolution || "1K"));
    const ratio = input.resolvedFrame?.ratio || quotedImage?.facts.ratio || (/^\d+:\d+$/.test(String(parsed.body.ratio||parsed.body.size||"")) ? String(parsed.body.ratio||parsed.body.size) : Number(parsed.body.targetWidth)>0&&Number(parsed.body.targetHeight)>0 ? imageRatio(Number(parsed.body.targetWidth),Number(parsed.body.targetHeight)) : "1:1");
    // A server quote already selected its priced public identity. Routing a
    // directional alias belongs before quotation, never during execution.
    const routedModelId = quotedImage || input.resolvedFrame?.preserveModelIdentity ? configuredModelId : routeImageModel(
      configuredModelId,
      ratio,
      snapshot.config.publicModels.filter(model => model.enabled && model.modality === "image"),
    );
    // A configured default is not a user selection. Keep it implicit so enabled
    // internal processors can remain hidden; explicit IDs still require visibility.
    // The browser echoes the priced model in x-naumi-feature-model, even when
    // the original selection was implicit. Only an owner-bound server quote
    // for this frozen default can authorize that echo; a body selection or a
    // different header is still explicit and must pass catalogue visibility.
    const quotedDefault = !!quotedImage && !selected &&
      (!input.featureModel || canonicalPublicModelId(snapshot.config.publicModels,input.featureModel) === configuredModelId) &&
      configuredModelId === canonicalPublicModelId(snapshot.config.publicModels,featureDefault);
    const requestedModelId = requestedFeatureModel(mainFeature, quotedDefault ? undefined : (quotedImage || explicitModelId || routedModelId !== configuredModelId) ? routedModelId : undefined);
    const selection=selectFeatureModel(snapshot.config,{accountImage:input.accountImage,feature:mainFeature,binding:purpose.image!,requestedModelId,scopeSystem:parsed.body.origin==="canvas"?"canvas":undefined})!;
    const {preset,option,model}=selection;
    if (option?.parameters?.inputTypes && ((parsed.references > 0 && !option.parameters.inputTypes.includes("image")) || (parsed.body.needsMask && !option.parameters.inputTypes.includes("mask")))) throw new ModelConfigError("MODEL_INCOMPATIBLE", "本功能模型未开放该输入类型", 400);

    const ids=model?publicUpstreamIds(snapshot.config,model):[];
    const upstreams=snapshot.config.upstreamModels.filter(u=>ids.includes(u.id)&&u.enabled&&snapshot.config.providers.some(p=>p.id===u.providerId&&p.enabled));
    if (option?.parameters?.ratios?.length && !option.parameters.ratios.includes(ratio)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型未开放该比例", 400);
    // A saved quote already chose its logical quality. Its raw audit label must
    // never be normalized again against a later environment default.
    const qualityChoice=quotedImage
      ?{quality:quotedImage.facts.quality,requested:quotedImage.requestedParameters?.quality||quotedImage.facts.quality,reason:null}
      :selectImageQuality(snapshot.config,mainFeature,model?.id,parsed.body.quality||input.quality,purpose.image);
    const requestedQuality=qualityChoice.quality;
    if(qualityChoice.reason)console.warn("[image-quality-fallback]",qualityChoice.reason,qualityChoice.requested,"->",requestedQuality);
    const presetParams = preset ? effectiveImageParameters(preset, { quality: requestedQuality, resolution: outputResolution, ratio }) : null;
    const canvasRequest = parsed.body.origin === "canvas" || input.path.startsWith("/api/canvas/");

    const effectiveQuality = presetParams?.effective.quality || requestedQuality;

    const native = presetParams ? presetParams.nativeResolution : !upstreams.some(u=>u.parameterMap.resolutionPolicy) && ["1K", "2K", "4K"].includes(outputResolution) && upstreams.some(u => u.capabilities.nativeResolutions.includes(outputResolution as "1K" | "2K" | "4K"));
    const needsEdit = purpose.image === "image.edit" || purpose.image === "image.cutout" || parsed.references > 0;
    const needsText = input.path.includes("/canvas/image-tasks");
    const task = String(parsed.body.taskType || parsed.body.task || "");
    const facts: ModelFacts = { task: ["draft", "product", "detail", "layout"].includes(task) ? task as ModelFacts["task"] : needsText ? "layout" : "product", quality: effectiveQuality, resolution: native ? outputResolution : "1K", requestedResolution:outputResolution, ratio, needsEdit, preserveIdentity: needsEdit, needsText, nativeResolution: native && outputResolution !== "1K", references: parsed.references, quantity: 1, inputLength: String(parsed.body.prompt || parsed.body.text || "").length };
    const advanced=input.advanced;
    const inferred=advanced?.intent||legacyImagegenIntent(parsed.body,parsed.references);
    if(advanced||inferred?.background||inferred?.conflicts.length)facts.imagegenRequirements=advanced?.intent||inferred!;
    facts.needsMask = !!parsed.body.needsMask || input.path.includes("/canvas/image-tasks");
    if (presetParams) { facts.quality = requestedQuality; facts.resolution = outputResolution; }
    const allowResolutionFallback = input.allowResolutionFallback!==false && !accepted && !(Number(parsed.body.targetWidth)>0 && Number(parsed.body.targetHeight)>0);
    const choice=allowResolutionFallback ? resolveImageResolution(snapshot.config,model?.id,outputResolution,mainFeature,ratio,{snapshot,billing,facts,options:{trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)}}) : undefined;
    const effectiveResolution=choice?.effective||outputResolution;
    assertDisplayResolution(model,effectiveResolution);
    if (!model?.displayResolutions && option?.parameters?.resolutions?.length && !option.parameters.resolutions.includes(effectiveResolution as any)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型未开放该尺寸", 400);
    const effectivePreset=preset?effectiveImageParameters(preset,{quality:requestedQuality,resolution:effectiveResolution,ratio}):null;
    if (canvasRequest && effectivePreset && parsed.body.resolution && (!effectivePreset.nativeResolution||!effectivePreset.nativeRatio))throw new ModelConfigError("MODEL_INCOMPATIBLE","所选模型未核验该尺寸与比例组合，请选择已开放参数",400);
    let preparedFacts=choice?.changed?resolutionFacts(facts,effectiveResolution):facts;
    // Apply a preset once. Execution consumes these facts without reapplying default quality/resolution policy.
    if(effectivePreset)preparedFacts={...preparedFacts,...effectivePreset.effective,nativeResolution:effectivePreset.nativeResolution&&effectiveResolution!=="1K"};
    const requestedParameters=advanced?.requestedParameters||(quotedImage?.requestedParameters?{...quotedImage.requestedParameters,ratio}:undefined)||((preset||choice?.supported.length||qualityChoice.reason)?{quality:qualityChoice.reason?qualityChoice.requested:requestedQuality,resolution:outputResolution,ratio}:undefined);
    return {version:1,modelVersion:snapshot.version,billingVersion:billing.version,modelDigest:snapshot.digest,feature:mainFeature,binding:purpose.image as PreparedImageOperation["binding"],modelId:model.id,facts:preparedFacts as PreparedImageOperation["facts"],...(requestedParameters?{requestedParameters}:{}),...(advanced?.eligibleUpstreamIds?{eligibleUpstreamIds:[...advanced.eligibleUpstreamIds]}:{})};
}
