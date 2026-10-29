import {z} from 'zod';
import {workflowSameOrigin} from '@/lib/enterprise/workflow-origin';
import {workflowSourceIdentity,workflowBridgeConfig,workflowIdentityToken} from '@/lib/enterprise/workflow-identity';
import {teamJson,teamFailure} from '@/lib/teams/access';
import {IntegrationError} from '@/lib/enterprise/integration/policy';
import { checkRateLimit } from "@/lib/rate-limit-http";
export const runtime='nodejs';export const dynamic='force-dynamic';
const scope=z.strictObject({enterpriseId:z.string().uuid(),teamId:z.string().uuid()});
async function proxy(request:Request,write:boolean){
 const raw=Object.fromEntries(new URL(request.url).searchParams),{enterpriseId,teamId,...params}=raw,p=scope.safeParse({enterpriseId,teamId});if(!p.success)return teamJson({error:'INVALID_CAPACITY_QUERY'},400);
 if(write&&(!workflowSameOrigin(request)))return teamJson({error:'ORIGIN_REQUIRED'},403);
 if(write&&!request.headers.get('content-type')?.startsWith('application/json'))return teamJson({error:'JSON_REQUIRED'},415);
 try{const identity=await workflowSourceIdentity(request,p.data.enterpriseId);const rateLimitResult = await checkRateLimit('capacity-'+(write?'write:':'read:')+JSON.stringify(identity),write?30:90,60000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return teamJson({error:'RATE_LIMIT'},429);const config=workflowBridgeConfig();let text:string|undefined,path='/v1/capacity';
  if(write){if(Object.keys(params).length)return teamJson({error:'INVALID_CAPACITY_QUERY'},400);let size=0;const chunks:Uint8Array[]=[],reader=request.body?.getReader();if(reader)for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>128*1024){await reader.cancel();return teamJson({error:'BODY_TOO_LARGE'},413);}chunks.push(r.value);}text=Buffer.concat(chunks).toString('utf8');try{JSON.parse(text);}catch{return teamJson({error:'INVALID_JSON'},400);}}
  else path+='?'+new URLSearchParams(params);
  let response:Response;try{response=await fetch(config.origin+path,{method:write?'POST':'GET',headers:{authorization:'Bearer '+workflowIdentityToken(identity,config,p.data.teamId),'content-type':'application/json'},body:text,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}catch{return teamJson({error:write?'WORKFLOW_WRITE_UNCERTAIN':'WORKFLOW_SERVICE_UNAVAILABLE'},503);}
  if(!response.headers.get('content-type')?.includes('application/json'))return teamJson({error:'WORKFLOW_RESPONSE_INVALID'},502);return teamJson(await response.json(),response.status);
 }catch(e){return e instanceof IntegrationError?teamJson({error:e.code},e.status):teamFailure(e);}
}
export const GET=(request:Request)=>proxy(request,false);
export const POST=(request:Request)=>proxy(request,true);
