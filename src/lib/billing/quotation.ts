import "server-only";
import {dbEnabled,totalPaidCents} from "../db";
import {cutoutImageQuality} from "../model-config/cutout-quality";
import {requestedFeatureModel,assertPlatformImageSelection} from "../model-config/selection-policy";
import {getUserImageProvider,upstreamUserImageModel} from "../user-image-provider";
import {getOpenAISettings,getCutoutSettings} from "../settings";
import {getUserDefaultImageModel,isNewApiFlowImageModel,getImageModelCatalog} from "../image-model-catalog";
import {routeImageModel} from "../image-model-routing";
import {configuredVideoProviders,getVideoProviderConfig} from "../video/providers/config";
import {selectedTextModel} from "../text-models";
import {currentModelBillingSnapshot} from "../model-config/context";
import {managedBillingSelection} from "../model-config/billing-model";
import {freezeBusinessQuoteForModel} from "../model-config/business-billing";
import {selectImageQuality} from "../model-config/image-quality-selection";
import {FEATURE_BINDINGS} from "../model-config/business";
import {readManagedModelSnapshot} from "../model-config/snapshot-reader";
import {currentImagegenStep} from "../imagegen/context";
import {getBillingRuntime,meteringFor} from "./runtime";
import {quote} from "./quote";
import seed from "./bootstrap.json";
import {BillingError,type BillingConfig,type BillingFacts,type ConfigSnapshot} from "./types";
import {isFeatureId} from "./rules/registry";
import {CANVAS_FREE_DEFAULTS} from "./canvas-defaults";
import type {QuoteInput,QuoteSelection,QuotePreparation} from "./quote-input";

function compatibleQuote(snapshot:ConfigSnapshot,facts:BillingFacts) {
    const q=quote(snapshot,facts),legacy=structuredClone(seed) as BillingConfig;
    const video=Number(process.env.VIDEO_TASK_COST);if(Number.isSafeInteger(video)&&video>0)legacy.features["video.generate"].pricing={mode:"fixed",credits:video};
    const old=quote({version:0,config:legacy},facts), canonical=(value:unknown):string=>JSON.stringify(value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,JSON.parse(canonical(v))])):value);
    q.legacyCompatible=snapshot.config.switches.metering==="legacy-auto"&&q.requestedCredits===old.requestedCredits&&q.authorizedCredits===old.authorizedCredits&&q.reserveCredits===old.reserveCredits&&q.debitOrder===old.debitOrder&&canonical(q.tariff)===canonical(old.tariff);
    return q;
}
export async function billingFactsForSelection(selection:QuoteSelection,input:QuoteInput,prepared:QuotePreparation):Promise<BillingFacts>{
    if (input.feature === "tool.cutout") input = { ...input, quality: cutoutImageQuality(input.quality ?? selection.imageQuality) };
    if (!isFeatureId(input.feature))
        throw new BillingError("INVALID_CONFIG", "未知计费功能", 400);
    assertPlatformImageSelection(input.modelId, selection.featureModel);
    const current = prepared.billing;
    if(!dbEnabled)return {feature:input.feature,quantity:input.quantity,quality:input.quality||"medium",resolution:input.resolution||"1K",byok:false,metered:false,paidFen:0,userGroup:"demo"};
    const email = selection.actor;
    if (!email)
        throw new BillingError("INVALID_RESULT", "请先登录", 401);
    let model = requestedFeatureModel(input.feature, selection.featureModel || (typeof input.modelId === "string" ? input.modelId : undefined));
    let providerId:string|undefined;
    const provider = input.feature === "image.generate" ? await getUserImageProvider(email) : null;
    const byok = !!provider && !!model?.startsWith("byok:") && provider.models.includes(upstreamUserImageModel(model));
    const managed = !byok ? await managedBillingSelection(selection, input.feature, model,prepared.models) : null;
    if (managed) {
        model = managed.modelId; providerId = managed.providerId;
    }else if(input.feature==="video.generate"){
        const config=getVideoProviderConfig(input.providerId||configuredVideoProviders()[0]?.id||"openai-videos");
        if(!config)throw new BillingError("INVALID_RESULT","视频供应商未配置",400);
        providerId=config.id;model=model||config.defaultModel;
        if(!config.models.includes(model))throw new BillingError("INVALID_RESULT","视频模型不可用",400);
    }else if(["canvas.text-generate","canvas.assistant","canvas.ocr"].includes(input.feature)){
        providerId=input.feature==="canvas.ocr"?"canvas-ocr":"agent-text";
        model=input.feature==="canvas.ocr"&&process.env.PADDLE_OCR_BASE_URL?.trim()?"paddleocr-with-vision-fallback":selectedTextModel(selection,input.feature==="canvas.ocr"?(process.env.PADDLE_OCR_FALLBACK_MODEL||process.env.OPENAI_TEXT_MODEL||process.env.AGENT_MODEL||"gpt-5.6-luna"):(process.env.OPENAI_TEXT_MODEL||process.env.AGENT_MODEL||"gpt-5.6-luna"));
    }else if(input.feature==="tool.cutout"){
        const config=await getCutoutSettings(),replicate=config.backend!=="openai"&&!!config.replicateToken;
        providerId=replicate?"replicate":"openai-images";model=replicate?config.replicateModel:config.openaiModel;
    }else if(input.feature==="tool.upscale"){
        providerId="replicate";model=process.env.REPLICATE_UPSCALE_MODEL||"nightmareai/real-esrgan";
    }else if(!["tool.ipcheck","tool.printfile"].includes(input.feature)){
        if(input.feature!=="image.generate"&&input.feature!=="image.suite"&&input.feature!=="image.aplus")model=undefined;
        model=model||(input.feature==="image.generate"?await getUserDefaultImageModel(email):null)||(await getOpenAISettings()).model;
        if(input.feature==="image.generate"&&input.ratio&&isNewApiFlowImageModel(model))model=routeImageModel(model,input.ratio,await getImageModelCatalog(email));
        providerId=isNewApiFlowImageModel(model)?"new-api-flow":"openai-images";
    }
    const fallback = byok ? await managedBillingSelection(selection, "image.generate",undefined,prepared.models) : null;
    return { feature: input.feature, quantity: input.quantity, quality: input.feature==="video.generate"||input.feature in CANVAS_FREE_DEFAULTS?"medium":input.quality ?? selection.imageQuality ?? "medium", resolution: input.feature in CANVAS_FREE_DEFAULTS?"1K":input.resolution ?? "1K", ratio: input.ratio, modelId: model, providerId: byok ? `byok:${provider!.id}` : providerId,...(byok?{fallbackProviderId:fallback?.providerId || "openai-images",fallbackModelId:fallback?.modelId || (await getOpenAISettings()).model}:{}), byok, metered: await meteringFor(current), paidFen: await totalPaidCents(email), userGroup:"default" };
}
/** Shared validation for a server-owned frozen step, without a synthetic Request. */
export function quoteForImagegenStep(actor:string|null,operationId:string|null,billingVersion:number,input:Partial<BillingFacts>&{feature:BillingFacts["feature"];quantity:number}){
    const saved=currentImagegenStep()?.billing;
    if(!saved)return undefined;
    const q=saved.quote;
    if(actor?.toLowerCase()!==saved.owner||operationId!==saved.operationId||input.feature!==q.facts.feature||input.quantity!==q.facts.quantity||(input.modelId!==undefined&&input.modelId!==q.facts.modelId)||billingVersion!==q.configVersion)
        throw new BillingError("OPERATION_CONFLICT","冻结执行步骤与原报价不符",409);
    return structuredClone(q);
}
/** Trusted domain services have already authenticated and owner-checked this actor. */
export async function quoteForActor(email:string,input:QuoteInput,options?:{effectiveResolution?:string},frozenSnapshot?:ConfigSnapshot){
    const snapshot=frozenSnapshot??currentModelBillingSnapshot()??await(await getBillingRuntime()).config.current();
    return prepareActorQuote({actor:email},input,snapshot,options);
}
/** One model snapshot supplies identity, parameters and price for this preparation. */
export async function prepareActorQuote(selection:QuoteSelection,input:QuoteInput,billing:ConfigSnapshot,options?:{allowResolutionFallback?:boolean;effectiveResolution?:string}){
    if(dbEnabled&&!selection.actor)throw new BillingError("INVALID_RESULT","请先登录",401);
    assertPlatformImageSelection(input.modelId,selection.featureModel);
    const models=await readManagedModelSnapshot();
    let facts=await billingFactsForSelection(selection,input,{billing,models});
    const binding=FEATURE_BINDINGS[facts.feature];
    const quality=models&&binding?.startsWith("image.")?selectImageQuality(models.config,facts.feature,facts.modelId,facts.quality,binding):undefined;
    if(quality)facts={...facts,quality:quality.quality};
    const quote=freezeBusinessQuoteForModel(billing,models,facts,compatibleQuote,{...options,accepted:selection.accepted});
    if(quality?.reason){
        quote.requestedParameters={quality:quality.requested,resolution:input.resolution||facts.resolution,ratio:input.ratio||"1:1"};
        quote.effectiveParameters={...(quote.effectiveParameters||quote.requestedParameters),quality:quote.effectiveParameters?.quality||quality.quality};
        quote.legacyCompatible=false;
    }
    return quote;
}
