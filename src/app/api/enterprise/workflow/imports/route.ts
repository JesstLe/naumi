import {readWorkflowJson,workflowReadSignal} from '@/lib/enterprise/workflow-read';
import {z} from 'zod';
import {workflowSourceIdentity,workflowBridgeConfig,workflowIdentityToken} from '@/lib/enterprise/workflow-identity';
import {IntegrationError} from '@/lib/enterprise/integration/policy';
import {teamJson,teamFailure} from '@/lib/teams/access';
import { checkRateLimit } from "@/lib/rate-limit-http";
export const runtime='nodejs';export const dynamic='force-dynamic';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const query=z.strictObject({kind:z.enum(['source','worksheet']).default('source'),enterpriseId:z.string().uuid(),teamId:z.string().uuid(),source:hash,id:hash,viewer:z.string().email().max(254),download:z.enum(['0','1']).default('0')});
export async function GET(request:Request){const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'INVALID_SOURCE_FILE_QUERY'},400);try{
 const q=parsed.data,headers=new Headers(request.headers);headers.set('x-workflow-viewer',q.viewer);
 const identity=await workflowSourceIdentity(new Request(request,{headers}),q.enterpriseId);const rateLimitResult = await checkRateLimit('workflow-import-file:'+JSON.stringify(identity),180,60000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return teamJson({error:'RATE_LIMITED'},429);
 const c=workflowBridgeConfig();let r:Response;try{r=await fetch(c.origin+(q.kind==='worksheet'?'/v1/imports/worksheet-file?':'/v1/imports/asset?')+new URLSearchParams({source:q.source,id:q.id,download:q.download}),{headers:{authorization:'Bearer '+workflowIdentityToken(identity,c,q.teamId)},cache:'no-store',redirect:'error',signal:workflowReadSignal(request,120000)});}catch{return teamJson({error:'SOURCE_FILE_UNAVAILABLE'},503);}
 if(!r.ok){return teamJson(await readWorkflowJson(r,'SOURCE_FILE_RESPONSE_INVALID'),r.status);}
 const mime=r.headers.get('content-type');if(!['image/png','image/jpeg','application/octet-stream'].includes(mime||'')){await r.body?.cancel().catch(()=>{});return teamJson({error:'SOURCE_FILE_RESPONSE_INVALID'},502);}
 const output=new Headers({'Content-Type':mime!,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});for(const k of ['content-length','content-disposition','x-content-sha256']){const v=r.headers.get(k);if(v)output.set(k,v);}return new Response(r.body,{headers:output});
 }catch(e){return e instanceof IntegrationError?teamJson({error:e.code},e.status):teamFailure(e);}}
