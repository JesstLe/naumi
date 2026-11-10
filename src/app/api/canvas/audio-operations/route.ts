import {z} from "zod";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {authenticatedEmail} from "@/lib/request-auth";
import {getAudioOperation} from "@/lib/audio/operation-service";
import {videoProjectKeySchema} from "@/lib/canvas/project-key";
import {audioHeaders,audioFailure} from "./response";
export const runtime="nodejs",dynamic="force-dynamic";
export function GET(request:Request){return withCreationReceiptRoute(request,async authenticatedActor=>{
  const actor=await authenticatedEmail(request,authenticatedActor);if(!actor)return Response.json({error:"请先登录"},{status:401,headers:audioHeaders});
  try{const query=new URL(request.url).searchParams;return Response.json(await getAudioOperation(actor,videoProjectKeySchema.parse(query.get("projectKey")),z.uuid().parse(query.get("operationId"))),{headers:audioHeaders});}catch(error){return audioFailure(error);}
});}
