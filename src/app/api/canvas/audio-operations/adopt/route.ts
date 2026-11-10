import {withCreationRoute} from "@/lib/saas/creation-context";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {adoptDialogueAudioOperation} from "@/lib/audio/adoption-service";
import {audioHeaders,audioFailure} from "../response";
export const runtime="nodejs",dynamic="force-dynamic";
export function POST(request:Request){return withCreationRoute(request,async authenticatedActor=>{
  const actor=await authenticatedEmail(request,authenticatedActor);if(!actor)return Response.json({error:"请先登录"},{status:401,headers:audioHeaders});
  if(!sameSiteBiMutation(request))return Response.json({error:"不允许跨站操作"},{status:403,headers:audioHeaders});
  try{return Response.json({node:await adoptDialogueAudioOperation(actor,JSON.parse(await readBounded(new Response(request.body),8192)))},{headers:audioHeaders});}catch(error){return audioFailure(error);}
});}
