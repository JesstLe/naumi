import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {authenticatedEmail} from "@/lib/request-auth";
import {readPublishedModelCatalog} from "@/lib/model-config/catalog-query";
import {getBillingRuntime} from "@/lib/billing/runtime";
import {audioHeaders,audioFailure} from "../response";
export const runtime="nodejs",dynamic="force-dynamic";
export function GET(request:Request){return withCreationReceiptRoute(request,async authenticatedActor=>{
  if(!await authenticatedEmail(request,authenticatedActor))return Response.json({error:"请先登录"},{status:401,headers:audioHeaders});
  try{const billing=await(await getBillingRuntime()).config.current();const view=async(feature:"audio.speech"|"audio.transcribe")=>billing.config.features[feature].enabled?readPublishedModelCatalog("audio",feature):{available:false,models:[]};return Response.json({speech:await view("audio.speech"),transcribe:await view("audio.transcribe")},{headers:audioHeaders});}catch(error){return audioFailure(error);}
});}
