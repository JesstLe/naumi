import "server-only";
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
export async function meteringFor(snapshot: ConfigSnapshot) {
    if (snapshot.config.switches.metering !== "legacy-auto")
        return snapshot.config.switches.metering === "on";
    const manual = (await getSetting("credits_metering"))?.trim();
    return supabaseEnabled || await multiUserEnabled() || manual === "1" || manual === "true";
}
export async function resolveBillingFacts(request: Request, input: Partial<BillingFacts> & {
    feature: BillingFacts["feature"];
    quantity: number;
    ratio?: string;
}, snapshot?: ConfigSnapshot,trustedActor?:string): Promise<BillingFacts> {
    if (!isFeatureId(input.feature))
        throw new BillingError("INVALID_CONFIG", "未知计费功能", 400);
    const current = snapshot ?? await (await getBillingRuntime()).config.current();
    const email = trustedActor??await resolveUserEmail(request);
    if (!email)
        throw new BillingError("INVALID_RESULT", "请先登录", 401);
    let model = typeof input.modelId === "string" ? input.modelId : undefined;
    let providerId:string|undefined;
    if(input.feature==="video.generate"){
        const config=getVideoProviderConfig(input.providerId||configuredVideoProviders()[0]?.id||"openai-videos");
        if(!config)throw new BillingError("INVALID_RESULT","视频供应商未配置",400);
        providerId=config.id;model=model||config.defaultModel;
        if(!config.models.includes(model))throw new BillingError("INVALID_RESULT","视频模型不可用",400);
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
    const provider = input.feature === "image.generate" ? await getUserImageProvider(email) : null;
    const byok = !!provider && !!model?.startsWith("byok:") && provider.models.includes(upstreamUserImageModel(model));
    return { feature: input.feature, quantity: input.quantity, quality: input.feature==="video.generate"?"medium":input.quality ?? request.headers.get("x-naumi-image-quality") ?? "medium", resolution: input.resolution ?? "1K", modelId: model, providerId: byok ? `byok:${provider!.id}` : providerId,...(byok?{fallbackProviderId:"openai-images",fallbackModelId:(await getOpenAISettings()).model}:{}), byok, metered: await meteringFor(current), paidFen: await totalPaidCents(email), userGroup: "default" };
}
export async function quoteForRequest(request: Request, input: Partial<BillingFacts> & {
    feature: BillingFacts["feature"];
    quantity: number;
    ratio?: string;
},frozenSnapshot?:ConfigSnapshot) {
    const snapshot = frozenSnapshot??await (await getBillingRuntime()).config.current();
    return quote(snapshot, await resolveBillingFacts(request, input, snapshot));
}
/** Trusted domain services have already authenticated and owner-checked this actor. */
export async function quoteForActor(email:string,input:Partial<BillingFacts>&{feature:BillingFacts["feature"];quantity:number}){
    const snapshot=await(await getBillingRuntime()).config.current();
    return quote(snapshot,await resolveBillingFacts(new Request("http://internal/api/billing/quote"),input,snapshot,email));
}
export async function updateBillingCompatibility(actor: string, reason: string, change: (config: BillingConfig) => void) {
    const config = (await getBillingRuntime()).config, current = await config.current();
    const next = structuredClone(current.config);
    change(next);
    return config.publish({ id: randomUUID(), actor, reason, expectedVersion: current.version, config: next });
}
export async function billingSwitches() { const snapshot = await (await getBillingRuntime()).config.current(); return { metering: await meteringFor(snapshot), commerce: process.env.NAUMI_PUBLIC_COMMERCE === "1" && snapshot.config.switches.commerce, recharge: snapshot.config.switches.recharge, environmentCommerce: process.env.NAUMI_PUBLIC_COMMERCE === "1" }; }
