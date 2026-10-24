import "server-only";
import {dbEnabled} from "@/platform/db/pool";
import {totalPaidCents} from "@/lib/payments/history";
import {resolveUserEmail} from "../admin-auth";
import {currentModelBillingSnapshot,currentModelExecution} from "../model-config/context";
import {currentImagegenStep} from "../imagegen/context";
import {readManagedModelSnapshot} from "../model-config/snapshot-reader";
import {imageBillingQuoteForRequest,assertImageBillingSelection} from "./image-quotes";
import {billingSnapshot,meteringFor} from "./runtime";
import {billingFactsForSelection,quoteForImagegenStep,prepareActorQuote} from "./quotation";
import {BillingError,type BillingFacts,type ConfigSnapshot} from "./types";
import type {QuoteSelection,QuoteInput} from "./quote-input";
// Stable public exports while domains migrate off the HTTP facade.
export {getBillingRuntime,billingSnapshot,meteringFor,updateBillingCompatibility,billingSwitches} from "./runtime";
export {quoteForActor,quoteForImagegenStep} from "./quotation";

/** The generic price directory needs the actor, not an executable default model. */
export async function billingCatalogFacts(request: Request, snapshot: ConfigSnapshot): Promise<BillingFacts> {
    if (!dbEnabled) return {feature:"image.generate",quantity:1,quality:"medium",resolution:"1K",byok:false,metered:false,paidFen:0,userGroup:"demo"};
    const email = await resolveUserEmail(request);
    if (!email) throw new BillingError("INVALID_RESULT", "请先登录", 401);
    return {feature:"image.generate",quantity:1,quality:"medium",resolution:"1K",byok:false,metered:await meteringFor(snapshot),paidFen:await totalPaidCents(email),userGroup:"default"};
}
function requestSelection(request:Request,actor:string|null):QuoteSelection{return {actor,path:new URL(request.url).pathname,imageQuality:request.headers.get("x-naumi-image-quality"),featureModel:request.headers.get("x-naumi-feature-model"),textModel:request.headers.get("x-naumi-text-model"),canvas:request.headers.get("x-naumi-canvas")==="1",accepted:request.headers.has("x-naumi-accepted-model-context")};}
export async function resolveBillingFacts(request:Request,input:QuoteInput,snapshot?:ConfigSnapshot,trustedActor?:string):Promise<BillingFacts>{
    const selection=requestSelection(request,trustedActor??(dbEnabled?await resolveUserEmail(request):null));
    if(dbEnabled&&!selection.actor)throw new BillingError("INVALID_RESULT","请先登录",401);
    return billingFactsForSelection(selection,input,{billing:snapshot??await billingSnapshot(),models:await readManagedModelSnapshot()});
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
    return prepareActorQuote(requestSelection(request,dbEnabled?await resolveUserEmail(request):null),input,snapshot,options);
}
