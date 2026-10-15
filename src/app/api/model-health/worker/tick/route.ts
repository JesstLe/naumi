import { healthWorkerAuthorized } from "@/lib/model-health/access";
import { scanModelHealthOnce } from "@/lib/model-health/service";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
export async function POST(request:Request) {
  if(!healthWorkerAuthorized(request))return Response.json({error:"worker authentication failed"},{status:401});
  try {return Response.json({...await scanModelHealthOnce(),at:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});}
  catch{return Response.json({error:"health tick incomplete"},{status:503});}
}
