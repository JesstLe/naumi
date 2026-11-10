import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {withBillingRequest} from "@/lib/billing/synchronous";
import {withBiRequest} from "@/lib/bi/request";
import {readBounded} from "@/lib/supplier-cost/io";
import {audioReviewRequestSchema} from "@/lib/storyboard/audio-review";
import {reviewTargetSchema} from "@/lib/storyboard/assisted-review";
import {getAudioReview,runAudioReview} from "@/lib/storyboard/audio-review-service";
import {audioHeaders,audioFailure} from "../../audio-operations/response";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=120;
export function GET(request:Request){return withCreationReceiptRoute(request,async actor=>{try{const email=await authenticatedEmail(request,actor);if(!email)return Response.json({error:"请先登录"},{status:401});const q=new URL(request.url).searchParams;return Response.json(await getAudioReview(email,reviewTargetSchema.parse(JSON.parse(q.get("target")||"null")),z.uuid().parse(q.get("operationId"))),{headers:audioHeaders});}catch(e){return audioFailure(e);}});}
export async function POST(request:Request){
 const actor=await authenticatedEmail(request);if(!actor)return Response.json({error:"请先登录"},{status:401,headers:audioHeaders});if(!sameSiteBiMutation(request))return Response.json({error:"不允许跨站操作"},{status:403,headers:audioHeaders});
 try{const input=audioReviewRequestSchema.parse(JSON.parse(await readBounded(new Response(request.clone().body),65536))),headers=new Headers(request.headers);
 if(headers.has("x-naumi-billing-operation-id")&&headers.get("x-naumi-billing-operation-id")!==input.operationId||headers.has("x-naumi-project-context")&&headers.get("x-naumi-project-context")!==input.projectKey)return Response.json({error:"语音检查操作或项目不一致"},{status:409,headers:audioHeaders});headers.set("x-naumi-billing-operation-id",input.operationId);headers.set("x-naumi-project-context",input.projectKey);headers.set("x-naumi-feature-model",input.modelId);const normalized=new Request(request,{headers});
 return withBillingRequest(normalized,"audio.transcribe",()=>withBiRequest(normalized,async()=>{try{return Response.json(await runAudioReview(actor,input,request.signal),{headers:audioHeaders});}catch(e){return audioFailure(e);}},actor));
 }catch(e){return audioFailure(e);}
}
