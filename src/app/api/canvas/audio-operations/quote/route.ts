import {z} from "zod";
import {withCreationRoute} from "@/lib/saas/creation-context";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {speechOperationSchema,transcriptionOperationSchema} from "@/lib/audio/operation-schema";
import {requireAudioTarget} from "@/lib/audio/operation-service";
import {withModelOperation} from "@/lib/model-config/requests";
import {quoteForActor} from "@/lib/billing/quotation";
import {ModelConfigError} from "@/lib/model-config/types";
import {audioHeaders,audioFailure} from "../response";
export const runtime="nodejs",dynamic="force-dynamic";
export function POST(request:Request){return withCreationRoute(request,async authenticatedActor=>{
  const actor=await authenticatedEmail(request,authenticatedActor);if(!actor)return Response.json({error:"请先登录"},{status:401,headers:audioHeaders});
  if(!sameSiteBiMutation(request))return Response.json({error:"不允许跨站操作"},{status:403,headers:audioHeaders});
  try{const raw=z.strictObject({kind:z.enum(["speech","transcribe"]),request:z.unknown()}).parse(JSON.parse(await readBounded(new Response(request.body),65536))),input=(raw.kind==="speech"?speechOperationSchema:transcriptionOperationSchema).parse(raw.request);await requireAudioTarget(actor,input.target);
    return await withModelOperation({path:`/api/canvas/audio-operations/${raw.kind}`,body:input,references:0},async()=>{const q=await quoteForActor(actor,{feature:`audio.${raw.kind}`,modelId:input.modelId,quantity:1,quality:"medium",resolution:"1K"});if(!q.tariff.enabled||q.tariff.pricing.mode==="usage")throw new ModelConfigError("AUDIO_PRICE_UNAVAILABLE","声音通道尚未配置明确售价",503);return Response.json({version:q.configVersion,modelVersion:q.modelVersion,credits:q.requestedCredits,authorizedCredits:q.authorizedCredits},{headers:audioHeaders});});
  }catch(error){return audioFailure(error);}
});}
