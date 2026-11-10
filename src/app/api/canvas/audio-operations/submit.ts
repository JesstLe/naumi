import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {withBillingRequest} from "@/lib/billing/synchronous";
import {withBiRequest} from "@/lib/bi/request";
import {readBounded} from "@/lib/supplier-cost/io";
import {speechOperationSchema,transcriptionOperationSchema} from "@/lib/audio/operation-schema";
import {runAudioOperation} from "@/lib/audio/operation-service";
import {audioHeaders,audioFailure} from "./response";
export async function submitAudio(request:Request,kind:"speech"|"transcribe"){
  const actor=await authenticatedEmail(request);if(!actor)return Response.json({error:"请先登录"},{status:401,headers:audioHeaders});
  if(!sameSiteBiMutation(request))return Response.json({error:"不允许跨站操作"},{status:403,headers:audioHeaders});
  let input;
  try{input=(kind==="speech"?speechOperationSchema:transcriptionOperationSchema).parse(JSON.parse(await readBounded(new Response(request.clone().body),65536)));}catch{return Response.json({error:"声音操作参数无效"},{status:422,headers:audioHeaders});}
  if(request.headers.has("x-naumi-billing-operation-id")&&request.headers.get("x-naumi-billing-operation-id")!==input.operationId)return Response.json({error:"声音操作编号不一致"},{status:409,headers:audioHeaders});
  const headers=new Headers(request.headers);headers.set("x-naumi-billing-operation-id",input.operationId);
  if(headers.has("x-naumi-project-context")&&headers.get("x-naumi-project-context")!==input.target.projectKey)return Response.json({error:"声音操作项目不一致"},{status:409,headers:audioHeaders});
  headers.set("x-naumi-project-context",input.target.projectKey);headers.set("x-naumi-feature-model",input.modelId);
  const normalized=new Request(request,{headers});
  return withBillingRequest(normalized,`audio.${kind}`,()=>withBiRequest(normalized,async()=>{
    try{return Response.json(await runAudioOperation(actor,kind,input,request.signal),{headers:audioHeaders});}catch(error){return audioFailure(error);}
  },actor));
}
