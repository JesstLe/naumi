import "server-only";
import {imageBillingQuoteForRequest,assertImageBillingSelection} from "./image-quotes";
import {cutoutImageQuality} from "../model-config/cutout-quality";
import { requestedFeatureModel, assertPlatformImageSelection } from "../model-config/selection-policy";
import { randomUUID } from "node:crypto";
import { dbEnabled, getPool, ensureSchema, getSetting, totalPaidCents } from "@/lib/db";
import seed from "./bootstrap.json";
import { createConfigRuntime } from "./catalog";
import { createBillingService } from "./service";
import { quote } from "./quote";
import { BillingError, type BillingConfig, type BillingFacts, type ConfigSnapshot } from "./types";
import { resolveUserEmail } from "@/lib/admin-auth";
import { supabaseEnabled } from "@/lib/auth-mode";
import { multiUserEnabled } from "@/lib/native-auth";
import { getUserImageProvider, upstreamUserImageModel } from "@/lib/user-image-provider";
import { isFeatureId } from "./rules/registry";
import {getOpenAISettings,getCutoutSettings} from "@/lib/settings";
import {getUserDefaultImageModel,isNewApiFlowImageModel,getImageModelCatalog} from "@/lib/image-model-catalog";
import {routeImageModel} from "@/lib/image-model-routing";
import {configuredVideoProviders,getVideoProviderConfig} from "@/lib/video/providers/config";
import { requestedTextModel } from "@/lib/text-models";
import { CANVAS_FREE_DEFAULTS } from "./canvas-defaults";
import { currentModelBillingSnapshot,currentModelExecution } from "../model-config/context";
import { managedBillingModel } from "../model-config/billing-model";
import { freezeBusinessQuote } from "../model-config/business-billing";
import {currentImagegenStep} from "../imagegen/context";
let runtime: ReturnType<typeof assemble> | undefined;
function assemble() {
    return { service: createBillingService(), config: createConfigRuntime({ pool: getPool(), ensureSchema, initialize: async (tx) => {
                const config = structuredClone(seed) as BillingConfig;
                const settings = (await tx.query<{
                    k: string;
                    v: string;
                }>("SELECT k,v FROM app_settings WHERE k=ANY($1)", [["signup_bonus_credits", "credits_metering", "pay_enabled"]])).rows;
                const old = Object.fromEntries(settings.map(x => [x.k, x.v]));
                const bonus = Number(old.signup_bonus_credits);
                if (old.signup_bonus_credits !== undefined && Number.isSafeInteger(bonus) && bonus >= 0)
                    config.credits.signup.amount = Math.min(bonus, 100000);
                // legacy-auto preserves Supabase/multi-user plus the original manual switch.
                const recharge = old.pay_enabled === undefined ? process.env.NEXT_PUBLIC_RECHARGE_ENABLED === "true" : old.pay_enabled === "1";
                config.switches.commerce = process.env.NAUMI_PUBLIC_COMMERCE === "1";
                config.switches.recharge = recharge;
                const video = Number(process.env.VIDEO_TASK_COST);
                if (Number.isSafeInteger(video) && video > 0 && video <= 2147483647)
                    config.features["video.generate"].pricing = { mode: "fixed", credits: video };
                return config;
            } }) };
}
export async function getBillingRuntime() {
    if (!dbEnabled)
        throw new BillingError("CONFIG_UNAVAILABLE", "未配置数据库，计费管理暂不可用", 503);
    return runtime ?? (runtime = assemble());
}
export async function billingSnapshot():Promise<ConfigSnapshot> {
    if(dbEnabled)return (await getBillingRuntime()).config.current();
    const config=structuredClone(seed) as BillingConfig;
    config.switches.metering="off";config.switches.commerce=false;config.switches.recharge=false;
    return {version:0,config};
}
function compatibleQuote(snapshot:ConfigSnapshot,facts:BillingFacts) {
    const q=quote(snapshot,facts),legacy=structuredClone(seed) as BillingConfig;
    const video=Number(process.env.VIDEO_TASK_COST);if(Number.isSafeInteger(video)&&video>0)legacy.features["video.generate"].pricing={mode:"fixed",credits:video};
    const old=quote({version:0,config:legacy},facts), canonical=(value:unknown):string=>JSON.stringify(value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,JSON.parse(canonical(v))])):value);
    q.legacyCompatible=snapshot.config.switches.metering==="legacy-auto"&&q.requestedCredits===old.requestedCredits&&q.authorizedCredits===old.authorizedCredits&&q.reserveCredits===old.reserveCredits&&q.debitOrder===old.debitOrder&&canonical(q.tariff)===canonical(old.tariff);
    return q;
}
export async function meteringFor(snapshot: ConfigSnapshot) {
    if(!dbEnabled)return false;
    if (snapshot.config.switches.metering !== "legacy-auto")
        return snapshot.config.switches.metering === "on";
    const manual = (await getSetting("credits_metering"))?.trim();
    return supabaseEnabled || await multiUserEnabled() || manual === "1" || manual === "true";
}
/** The generic price directory needs the actor, not an executable default model. */
export async function billingCatalogFacts(request: Request, snapshot: ConfigSnapshot): Promise<BillingFacts> {
    if (!dbEnabled) return {feature:"image.generate",quantity:1,quality:"medium",resolution:"1K",byok:false,metered:false,paidFen:0,userGroup:"demo"};
    const email = await resolveUserEmail(request);
    if (!email) throw new BillingError("INVALID_RESULT", "请先登录", 401);
    return {feature:"image.generate",quantity:1,quality:"medium",resolution:"1K",byok:false,metered:await meteringFor(snapshot),paidFen:await totalPaidCents(email),userGroup:"default"};
}
export async function resolveBillingFacts(request: Request, input: Partial<BillingFacts> & {
    feature: BillingFacts["feature"];
    quantity: number;
    ratio?: string;
}, snapshot?: ConfigSnapshot,trustedActor?:string): Promise<BillingFacts> {
    if (input.feature === "tool.cutout") input = { ...input, quality: cutoutImageQuality(input.quality ?? request.headers.get("x-naumi-image-quality")) };
    if (!isFeatureId(input.feature))
        throw new BillingError("INVALID_CONFIG", "未知计费功能", 400);
    assertPlatformImageSelection(input.modelId, request.headers.get("x-naumi-feature-model"));
    const current = snapshot ?? await billingSnapshot();
    if(!dbEnabled)return {feature:input.feature,quantity:input.quantity,quality:input.quality||"medium",resolution:input.resolution||"1K",byok:false,metered:false,paidFen:0,userGroup:"demo"};
    const email = trustedActor??await resolveUserEmail(request);
    if (!email)
        throw new BillingError("INVALID_RESULT", "请先登录", 401);
    let model = requestedFeatureModel(input.feature, request.headers.get("x-naumi-feature-model") || (typeof input.modelId === "string" ? input.modelId : undefined));
    let providerId:string|undefined;
    const provider = input.feature === "image.generate" ? await getUserImageProvider(email) : null;
    const byok = !!provider && !!model?.startsWith("byok:") && provider.models.includes(upstreamUserImageModel(model));
    const managed = !byok ? await managedBillingModel(request, input.feature, model) : null;
    if (managed) {
        model = managed.modelId; providerId = managed.providerId;
    }else if(input.feature==="video.generate"){
        const config=getVideoProviderConfig(input.providerId||configuredVideoProviders()[0]?.id||"openai-videos");
        if(!config)throw new BillingError("INVALID_RESULT","视频供应商未配置",400);
        providerId=config.id;model=model||config.defaultModel;
        if(!config.models.includes(model))throw new BillingError("INVALID_RESULT","视频模型不可用",400);
    }else if(["canvas.text-generate","canvas.assistant","canvas.ocr"].includes(input.feature)){
        providerId=input.feature==="canvas.ocr"?"canvas-ocr":"agent-text";
        model=input.feature==="canvas.ocr"&&process.env.PADDLE_OCR_BASE_URL?.trim()?"paddleocr-with-vision-fallback":requestedTextModel(request,input.feature==="canvas.ocr"?(process.env.PADDLE_OCR_FALLBACK_MODEL||process.env.OPENAI_TEXT_MODEL||process.env.AGENT_MODEL||"gpt-5.6-luna"):(process.env.OPENAI_TEXT_MODEL||process.env.AGENT_MODEL||"gpt-5.6-luna"));
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
    const fallback = byok ? await managedBillingModel(request, "image.generate") : null;
    return { feature: input.feature, quantity: input.quantity, quality: input.feature==="video.generate"||input.feature in CANVAS_FREE_DEFAULTS?"medium":input.quality ?? request.headers.get("x-naumi-image-quality") ?? "medium", resolution: input.feature in CANVAS_FREE_DEFAULTS?"1K":input.resolution ?? "1K", ratio: input.ratio, modelId: model, providerId: byok ? `byok:${provider!.id}` : providerId,...(byok?{fallbackProviderId:fallback?.providerId || "openai-images",fallbackModelId:fallback?.modelId || (await getOpenAISettings()).model}:{}), byok, metered: await meteringFor(current), paidFen: await totalPaidCents(email), userGroup:"default" };
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
export async function quoteForRequest(request: Request, input: Partial<BillingFacts> & {
    feature: BillingFacts["feature"];
    quantity: number;
    ratio?: string;
},frozenSnapshot?:ConfigSnapshot,options?:{allowResolutionFallback?:boolean}) {
    // Only an in-process, server-owned imagegen step can supply this quote.
    // Keep the complete tariff/facts used at preview, not just its version or
    // credits: metering and recharge changes must not reprice an accepted plan.
    if(currentImagegenStep()?.billing){
        return quoteForImagegenStep(await resolveUserEmail(request),request.headers.get("x-naumi-billing-operation-id"),Number(request.headers.get("x-naumi-billing-version")),input)!;
    }
    const browserQuote=await imageBillingQuoteForRequest(request);
    if(browserQuote){
        assertImageBillingSelection(browserQuote,input);
        // Old estimates did not select a frame. Resolve that missing input from
        // the authenticated handler, never a fabricated preset default of 1:1.
        // Only the ratio is bound here; tariff, authorization and versions stay frozen.
        const ratio=input.ratio||currentModelExecution("image")?.frozen.facts?.ratio;
        if(browserQuote.facts.ratio===undefined&&ratio){
            browserQuote.facts.ratio=ratio;
            if(browserQuote.requestedParameters)browserQuote.requestedParameters.ratio=ratio;
            if(browserQuote.effectiveParameters)browserQuote.effectiveParameters.ratio=ratio;
        }
        return browserQuote;
    }
    const snapshot = frozenSnapshot??currentModelBillingSnapshot()??await billingSnapshot();
    return freezeBusinessQuote(request, snapshot, await resolveBillingFacts(request, input, snapshot), compatibleQuote, options);
}
/** Trusted domain services have already authenticated and owner-checked this actor. */
export async function quoteForActor(email:string,input:Partial<BillingFacts>&{feature:BillingFacts["feature"];quantity:number},options?:{effectiveResolution?:string},frozenSnapshot?:ConfigSnapshot){
    const snapshot=frozenSnapshot??currentModelBillingSnapshot()??await(await getBillingRuntime()).config.current();
    const request = new Request("http://internal/api/billing/quote");
    return freezeBusinessQuote(request,snapshot,await resolveBillingFacts(request,input,snapshot,email),compatibleQuote,options);
}
export async function updateBillingCompatibility(actor: string, reason: string, change: (config: BillingConfig) => void) {
    const config = (await getBillingRuntime()).config, current = await config.current();
    const next = structuredClone(current.config);
    change(next);
    return config.publish({ id: randomUUID(), actor, reason, expectedVersion: current.version, config: next });
}
export async function billingSwitches() { const snapshot = await billingSnapshot(); return { metering: await meteringFor(snapshot), commerce: process.env.NAUMI_PUBLIC_COMMERCE === "1" && snapshot.config.switches.commerce, recharge: snapshot.config.switches.recharge, environmentCommerce: process.env.NAUMI_PUBLIC_COMMERCE === "1" }; }
