import {z} from "zod";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {recoverAudioOperation} from "@/lib/audio/operation-service";
import {videoProjectKeySchema} from "@/lib/canvas/project-key";
import {audioHeaders,audioFailure} from "../response";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
const inputSchema=z.strictObject({projectKey:videoProjectKeySchema,operationId:z.uuid()});
export function POST(request:Request){return withCreationReceiptRoute(request,async authenticatedActor=>{
  const actor=await authenticatedEmail(request,authenticatedActor);if(!actor)return Response.json({error:"请先登录"},{status:401,headers:audioHeaders});
  if(!sameSiteBiMutation(request))return Response.json({error:"不允许跨站操作"},{status:403,headers:audioHeaders});
  try{const input=inputSchema.parse(JSON.parse(await readBounded(new Response(request.body),4096)));return Response.json(await recoverAudioOperation(actor,input.projectKey,input.operationId),{headers:audioHeaders});}catch(error){return audioFailure(error);}
});}
