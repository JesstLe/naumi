import {z} from 'zod';
import {workflowSourceIdentity,workflowBridgeConfig,workflowIdentityToken} from '@/lib/enterprise/workflow-identity';
import {IntegrationError} from '@/lib/enterprise/integration/policy';
import {teamJson,teamFailure} from '@/lib/teams/access';
import { checkRateLimit } from "@/lib/rate-limit-http";
export const runtime='nodejs';export const dynamic='force-dynamic';
const base={enterpriseId:z.string().uuid(),teamId:z.string().uuid()},scope={...base,orderId:z.string().uuid()};
const query=z.discriminatedUnion('action',[z.strictObject({action:z.literal('library'),...base,query:z.string().max(120).optional(),scope:z.enum(['all','mine']).optional(),page:z.coerce.number().int().min(1).max(10000).optional()}),z.strictObject({action:z.literal('list'),...scope}),z.strictObject({action:z.literal('file'),...scope,id:z.string().regex(/^[a-f0-9]{64}$/),viewer:z.string().email().max(254),download:z.enum(['0','1']).default('0')})]);
export async function GET(request:Request){const parsed=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return teamJson({error:'INVALID_REFERENCE_QUERY'},400);try{
 const q=parsed.data,headers=new Headers(request.headers);if(q.action==='file'){if(headers.has('x-workflow-viewer')&&headers.get('x-workflow-viewer')!==q.viewer)return teamJson({error:'ACCOUNT_CHANGED'},409);headers.set('x-workflow-viewer',q.viewer);}const identity=await workflowSourceIdentity(new Request(request,{headers}),q.enterpriseId);const rateLimitResult = await checkRateLimit('workflow-reference-read:'+JSON.stringify(identity),180,60000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) return teamJson({error:'RATE_LIMITED'},429);const c=workflowBridgeConfig();let r:Response;
 const params=new URLSearchParams();for(const [k,v] of Object.entries(q))if(!['action','enterpriseId','teamId','viewer'].includes(k)&&v!==undefined)params.set(k,String(v));try{r=await fetch(c.origin+(q.action==='file'?'/v1/references/file?':q.action==='library'?'/v1/references/library?':'/v1/references?')+params,{headers:{authorization:'Bearer '+workflowIdentityToken(identity,c,q.teamId)},cache:'no-store',redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)])});}catch{return teamJson({error:'REFERENCE_SERVICE_UNAVAILABLE'},503);}
 if(q.action!=='file'||!r.ok){if(!r.headers.get('content-type')?.includes('application/json'))return teamJson({error:'REFERENCE_RESPONSE_INVALID'},502);return teamJson(await r.json(),r.status);}
 const mime=r.headers.get('content-type');if(!['image/png','image/jpeg','application/octet-stream'].includes(mime||''))return teamJson({error:'REFERENCE_RESPONSE_INVALID'},502);const output=new Headers({'Content-Type':mime!,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});for(const k of ['content-length','content-disposition','x-content-sha256']){const v=r.headers.get(k);if(v)output.set(k,v);}return new Response(r.body,{headers:output});
 }catch(e){return e instanceof IntegrationError?teamJson({error:e.code},e.status):teamFailure(e);}}
