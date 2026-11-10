import {storyboardProductionRoute} from "@/lib/storyboard/production-route";
import {audioReviewEvidence} from "@/lib/storyboard/audio-review-service";
import {withModelOperation} from "@/lib/model-config/requests";
import {quoteForActor} from "@/lib/billing/quotation";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic";
export function POST(request:Request){return storyboardProductionRoute(request,async(actor,body)=>{const {input}=await audioReviewEvidence(actor,body);return withModelOperation({path:"/api/canvas/storyboards/review-audio",body:input,references:0},async()=>{const q=await quoteForActor(actor,{feature:"audio.transcribe",modelId:input.modelId,quantity:1,quality:"medium",resolution:"1K"});if(!q.tariff.enabled||q.tariff.pricing.mode==="usage")throw new ModelConfigError("AUDIO_PRICE_UNAVAILABLE","声音通道尚未配置明确售价",503);return {version:q.configVersion,modelVersion:q.modelVersion,credits:q.requestedCredits};});});}
